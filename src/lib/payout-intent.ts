import { createHash, randomUUID } from "node:crypto";
import type { Agent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getGnkUsdRate } from "@/lib/gonka-pricing";
import { runGonka, fingerprintPrompt, fingerprintResponse, type GonkaMessage, type GonkaResult } from "@/lib/gonka";
import { recipientIdentityOk } from "@/lib/identity";
import {
  artifactDecisionSchema,
  artifactSystemPrompt,
  payerRecordDecisionSchema,
  payerRecordSystemPrompt
} from "@/lib/prompts";
import { debitAtomically, evaluateBeforeDebit, type AgentLimits, type PolicyReason, type SqlExecutor } from "@/lib/policy";
import { reconcile, type DecisionTuple, type RequiredChannels } from "@/lib/reconcile";
import { chainForRecipient, executionFailedCode, PayoutRailError, payoutRail, settledChain } from "@/lib/rails";
import { replenishDemoWorkOrder } from "@/lib/demo-replenish";

export type PublicIntent = {
  id: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  digest: string | null;
  explorerUrl: string | null;
  publicToken: string;
  chain: string | null;
  /** Same value as digest: the transaction id on whichever chain settled. */
  signature: string | null;
};

type IntentBody = {
  idempotency_key: string;
  artifact: string;
  recipient_ref: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPublicIntent(intent: {
  id: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  digest: string | null;
  explorerUrl: string | null;
  publicToken: string;
  chain: string | null;
}): PublicIntent {
  return {
    id: intent.id,
    status: intent.status,
    decisionClass: intent.decisionClass,
    reasonCode: intent.reasonCode,
    digest: intent.digest,
    explorerUrl: intent.explorerUrl,
    publicToken: intent.publicToken,
    chain: intent.chain,
    signature: intent.digest
  };
}

function tuple(result: GonkaResult): DecisionTuple | null {
  if (!result.ok || !result.content) return null;
  try {
    const value = JSON.parse(result.content) as Record<string, unknown>;
    if (typeof value.work_order_id !== "string") return null;
    if (typeof value.amount_micros !== "string" || !/^\d+$/.test(value.amount_micros)) return null;
    if (typeof value.delivery_timestamp !== "string" || Number.isNaN(new Date(value.delivery_timestamp).getTime())) return null;
    return {
      workOrderId: value.work_order_id,
      amountMicros: BigInt(value.amount_micros),
      deliveryTimestamp: value.delivery_timestamp
    };
  } catch {
    return null;
  }
}

function tupleJson(result: GonkaResult): Prisma.InputJsonObject | undefined {
  if (!result.content) return undefined;
  try {
    const parsed = JSON.parse(result.content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Prisma.InputJsonObject : undefined;
  } catch {
    return undefined;
  }
}

function unavailable(model: string): GonkaResult {
  return { ok: false, model, latencyMs: 0, errorCode: "INFERENCE_UNAVAILABLE" };
}

function requiredChannelsFrom(value: string): RequiredChannels {
  return value === "payer_record" || value === "human" ? value : "both";
}

async function pricingData() {
  const rate = await getGnkUsdRate();
  return {
    gnkUsd: rate?.value ?? null,
    pricingUpdatedAt: rate?.updatedAt ?? null
  };
}

export async function processPayoutIntent(agent: Agent, body: IntentBody): Promise<PublicIntent> {
  const existing = await prisma.payoutIntent.findUnique({ where: { idempotencyKey: body.idempotency_key } });
  if (existing) return toPublicIntent(existing);

  const recipient = await prisma.recipient.findUnique({ where: { ref: body.recipient_ref } });
  if (!recipient) {
    throw new Error("RECIPIENT_NOT_FOUND");
  }

  const now = new Date();
  const openWorkOrders = await prisma.workOrder.findMany({
    where: {
      recipientId: recipient.id,
      status: "open",
      expiresAt: { gt: now },
      dischargedByIntentId: null
    },
    orderBy: { expiresAt: "asc" }
  });

  const intent = await prisma.payoutIntent.create({
    data: {
      agentId: agent.id,
      recipientId: recipient.id,
      status: "processing",
      decisionClass: "AMBER",
      idempotencyKey: body.idempotency_key,
      publicToken: randomUUID(),
      artifact: {
        create: {
          rawText: body.artifact,
          sha256: hash(body.artifact)
        }
      }
    }
  });

  if (openWorkOrders.length === 0) {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "NO_OPEN_OBLIGATION", ...pricing }
    });
    return toPublicIntent(denied);
  }

  if (agent.requireRecipientKyc && !recipientIdentityOk(recipient, now)) {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "RECIPIENT_UNVERIFIED", ...pricing }
    });
    return toPublicIntent(denied);
  }

  // Chain per recipient: a saved Solana address pays on Solana, else Sui. Refuse before any
  // inference or debit when there is nowhere to send the money.
  const target = chainForRecipient(recipient);
  if (!target) {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "RECIPIENT_NO_CHAIN_ADDRESS", ...pricing }
    });
    return toPublicIntent(denied);
  }
  const chain = settledChain(agent.rail, target.chain);

  const artifactMessages: GonkaMessage[] = [
    { role: "system", content: artifactSystemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        open_work_order_ids: openWorkOrders.map((workOrder) => workOrder.ref),
        delivery_event_metadata: { received_at: now.toISOString(), recipient_ref: recipient.ref },
        artifact_text_and_links: body.artifact
      })
    }
  ];
  const payerMessages: GonkaMessage[] = [
    { role: "system", content: payerRecordSystemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        open_work_orders: openWorkOrders.map((workOrder) => ({
          id: workOrder.ref,
          ceiling_micros: workOrder.ceilingMicros.toString(),
          brief_text: workOrder.briefText,
          payer_record: workOrder.payerRecord
        })),
        delivery_event_metadata: { received_at: now.toISOString(), recipient_ref: recipient.ref }
      })
    }
  ];

  const [artifactRun, payerRun] = await Promise.allSettled([
    runGonka({ channel: "artifact", messages: artifactMessages, schema: artifactDecisionSchema }),
    runGonka({ channel: "payer_record", messages: payerMessages, schema: payerRecordDecisionSchema })
  ]);
  const artifactResult = artifactRun.status === "fulfilled" ? artifactRun.value : unavailable("moonshotai/Kimi-K2.6");
  const payerResult = payerRun.status === "fulfilled" ? payerRun.value : unavailable("deepseek-ai/DeepSeek-V4-Flash-0731");

  await prisma.adjudication.createMany({
    data: [
      {
        intentId: intent.id,
        channel: "artifact",
        model: artifactResult.model,
        requestId: artifactResult.requestId,
        fallback: artifactResult.fallback,
        promptSha: fingerprintPrompt(artifactMessages),
        responseSha: fingerprintResponse(artifactResult.content),
        inputTokens: artifactResult.inputTokens,
        outputTokens: artifactResult.outputTokens,
        latencyMs: artifactResult.latencyMs,
        tupleJson: tupleJson(artifactResult),
        ok: artifactResult.ok
      },
      {
        intentId: intent.id,
        channel: "payer_record",
        model: payerResult.model,
        requestId: payerResult.requestId,
        fallback: payerResult.fallback,
        promptSha: fingerprintPrompt(payerMessages),
        responseSha: fingerprintResponse(payerResult.content),
        inputTokens: payerResult.inputTokens,
        outputTokens: payerResult.outputTokens,
        latencyMs: payerResult.latencyMs,
        tupleJson: tupleJson(payerResult),
        ok: payerResult.ok
      }
    ]
  });

  const payerTuple = tuple(payerResult);
  const artifactTuple = tuple(artifactResult);
  const channelPolicyWorkOrder = payerTuple
    ? openWorkOrders.find((workOrder) => workOrder.ref === payerTuple.workOrderId)
    : null;
  const requiredChannels = channelPolicyWorkOrder ? requiredChannelsFrom(channelPolicyWorkOrder.requiredChannels) : "both";
  const reconciled = reconcile(requiredChannels, {
    artifact: artifactTuple ?? undefined,
    payer_record: payerTuple ?? undefined
  });

  // A disagreement is only the payer's fault if both channels ran the models we asked for.
  // When the router substituted a model, a split cannot be attributed to the evidence, so the
  // payment is held for a human instead of refused. Never refuse on our own infrastructure.
  const substituted = Boolean(artifactResult.fallback || payerResult.fallback);
  const splitOnSubstitutedModels =
    !reconciled.ok &&
    reconciled.decisionClass === "RED" &&
    String(reconciled.reasonCode ?? "").startsWith("QUORUM_SPLIT") &&
    substituted;

  if (!reconciled.ok) {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: reconciled.decisionClass === "AMBER" || splitOnSubstitutedModels ? "held" : "refused",
        decisionClass: splitOnSubstitutedModels ? "AMBER" : reconciled.decisionClass,
        reasonCode: splitOnSubstitutedModels ? "MODEL_SUBSTITUTED_SPLIT" : reconciled.reasonCode,
        ...pricing
      }
    });
    return toPublicIntent(updated);
  }

  const selected = openWorkOrders.find((workOrder) => workOrder.ref === reconciled.tuple.workOrderId) ?? null;
  if (!selected) {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "NO_OPEN_OBLIGATION", ...pricing }
    });
    return toPublicIntent(updated);
  }

  const before = evaluateBeforeDebit({
    agent: agent as AgentLimits,
    workOrder: selected,
    recipientActive: recipient.active,
    amountMicros: reconciled.tuple.amountMicros,
    now
  });
  if (!before.ok) {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: before.reasonCode, ...pricing }
    });
    return toPublicIntent(updated);
  }

  try {
    const pricing = await pricingData();
    const updated = await prisma.$transaction(async (tx) => {
      const debit = await debitAtomically(tx as unknown as SqlExecutor, agent as AgentLimits, reconciled.tuple.amountMicros, now);
      if (!debit.ok) {
        return tx.payoutIntent.update({
          where: { id: intent.id },
          data: { status: "refused", decisionClass: "RED", reasonCode: debit.reasonCode as PolicyReason, ...pricing }
        });
      }

      const claimed = await tx.workOrder.updateMany({
        where: {
          id: selected.id,
          status: "open",
          dischargedByIntentId: null,
          expiresAt: { gt: now }
        },
        data: { status: "discharged", dischargedByIntentId: intent.id }
      });
      if (claimed.count !== 1) {
        return tx.payoutIntent.update({
          where: { id: intent.id },
          data: { status: "refused", decisionClass: "RED", reasonCode: "WORK_ORDER_NOT_OPEN", ...pricing }
        });
      }

      const receipt = await payoutRail(agent.rail, target.chain).send({
        recipientAddress: target.address,
        amountMicros: reconciled.tuple.amountMicros,
        intentId: intent.id
      });
      if (!receipt.digest || !receipt.explorerUrl) {
        throw new PayoutRailError(executionFailedCode(target.chain), "Settlement did not return a digest.");
      }

      return tx.payoutIntent.update({
        where: { id: intent.id },
        data: {
          workOrderId: selected.id,
          amountMicros: reconciled.tuple.amountMicros,
          status: "settled",
          decisionClass: "PAID",
          digest: receipt.digest,
          explorerUrl: receipt.explorerUrl,
          chain,
          ...pricing
        }
      });
    }, { timeout: 120_000 });

    await replenishDemoWorkOrder(prisma, { workOrderId: updated.workOrderId, settled: updated.status === "settled" });
    return toPublicIntent(updated);
  } catch {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        workOrderId: selected.id,
        amountMicros: reconciled.tuple.amountMicros,
        status: "refused",
        decisionClass: "RED",
        reasonCode: "SETTLEMENT_FAILED",
        digest: null,
        explorerUrl: null,
        chain,
        ...pricing
      }
    });
    return toPublicIntent(updated);
  }
}
