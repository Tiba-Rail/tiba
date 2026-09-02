import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
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
import { PayoutRailError, payoutRail } from "@/lib/rails";
import { replenishDemoWorkOrder } from "@/lib/demo-replenish";

export const runtime = "nodejs";

type PublicIntent = {
  id: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  digest: string | null;
  explorerUrl: string | null;
  publicToken: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function apiKey(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function response(intent: PublicIntent) {
  return NextResponse.json({
    id: intent.id,
    status: intent.status,
    decision_class: intent.decisionClass,
    reason_code: intent.reasonCode,
    digest: intent.digest,
    explorer_url: intent.explorerUrl,
    public_token: intent.publicToken
  });
}

async function pricingData() {
  const rate = await getGnkUsdRate();
  return {
    gnkUsd: rate?.value ?? null,
    pricingUpdatedAt: rate?.updatedAt ?? null
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

export async function POST(request: NextRequest) {
  const secret = apiKey(request);
  if (!secret) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const agent = await prisma.agent.findUnique({ where: { apiKeyHash: hash(secret) } });
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { idempotency_key?: unknown; artifact?: unknown; recipient_ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (
    typeof body.idempotency_key !== "string" ||
    typeof body.artifact !== "string" ||
    typeof body.recipient_ref !== "string" ||
    !body.idempotency_key ||
    !body.artifact ||
    !body.recipient_ref
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const existing = await prisma.payoutIntent.findUnique({ where: { idempotencyKey: body.idempotency_key } });
  if (existing) return response(existing);

  const recipient = await prisma.recipient.findUnique({ where: { ref: body.recipient_ref } });
  if (!recipient) return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });

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
    return response(denied);
  }

  // Identity gate (default off per agent). Sits before inference so an unverified
  // recipient is refused without spending a model call.
  if (agent.requireRecipientKyc && !recipientIdentityOk(recipient, now)) {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "RECIPIENT_UNVERIFIED", ...pricing }
    });
    return response(denied);
  }

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

  // Both channels are started before either is awaited. The previous form
  // awaited the artifact channel before starting the payer-record channel, so
  // every intent paid the two model latencies in series (~45 s observed).
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

  if (!reconciled.ok) {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: reconciled.decisionClass === "AMBER" ? "held" : "refused",
        decisionClass: reconciled.decisionClass,
        reasonCode: reconciled.reasonCode,
        ...pricing
      }
    });
    return response(updated);
  }

  const selected = openWorkOrders.find((workOrder) => workOrder.ref === reconciled.tuple.workOrderId) ?? null;
  if (!selected) {
    const pricing = await pricingData();
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: "NO_OPEN_OBLIGATION", ...pricing }
    });
    return response(updated);
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
    return response(updated);
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

      const receipt = await payoutRail(agent.rail).send({
        recipientAddress: recipient.suiAddress,
        amountMicros: reconciled.tuple.amountMicros,
        intentId: intent.id
      });
      if (!receipt.digest || !receipt.explorerUrl) {
        throw new PayoutRailError("SUI_EXECUTION_FAILED", "Settlement did not return a digest.");
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
          ...pricing
        }
      });
    }, { timeout: 120_000 });
    // Demo fixture only: let the documented walkthrough order be paid again by the next judge.
    await replenishDemoWorkOrder(prisma, { workOrderId: updated.workOrderId, settled: updated.status === "settled" });
    return response(updated);
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
        ...pricing
      }
    });
    return response(updated);
  }
}
