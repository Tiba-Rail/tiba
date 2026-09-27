import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Agent } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getGnkUsdRate } from "@/lib/gonka-pricing";
import { CANDIDATES, runGonka, fingerprintPrompt, fingerprintResponse, type GonkaMessage, type GonkaRequest, type GonkaResult } from "@/lib/gonka";
import { modelAnsweredWith, sameMakerFallback } from "@/lib/channel-makers";
import { recipientIdentityOk } from "@/lib/identity";
import {
  artifactDecisionSchema,
  artifactSystemPrompt,
  payerRecordDecisionSchema,
  payerRecordSystemPrompt
} from "@/lib/prompts";
import {
  assertArtifactSize,
  assertReplayBelongsTo,
  effectiveChannels,
  INTENT_RATE_LIMITED,
  intentBudgetExceeded
} from "@/lib/payout-guards";
import { debitAtomically, evaluateBeforeDebit, type AgentLimits, type PolicyReason, type SqlExecutor } from "@/lib/policy";
import { reconcile, type DecisionTuple, type RequiredChannels } from "@/lib/reconcile";
import { committedPendingData, settleCommittedIntent } from "@/lib/payout-settlement";
import { chainForRecipient, payoutRail, recipientAddressReason, settledChain } from "@/lib/rails";
import { isBase58Signature } from "@/lib/rails/base58";
import { solanaExplorerTxUrl } from "@/lib/rails/solana";
import { replenishDemoWorkOrder } from "@/lib/demo-replenish";
import { X402_NEEDS_LIVE_WALLET } from "@/lib/x402/gate";
import { readSolanaTransaction, x402SettlementProven, type ChainTransactionReader } from "@/lib/x402/settlement-proof";
import type { SettlementResponse } from "@/lib/x402/types";

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
  x402Routed: boolean;
  /** Amount (micros) the checks cleared and the debit counted. Null until the checks agree. */
  amountMicros?: string | null;
};

type IntentBody = {
  idempotency_key: string;
  artifact: string;
  recipient_ref: string;
};

export type ProcessPayoutOptions = {
  /** Default "rail" keeps today's settlement. "defer" is the x402 path: authorize, do not send. */
  settlement?: "rail" | "defer";
  gonka?: (request: GonkaRequest) => Promise<GonkaResult>;
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
  x402Routed?: boolean;
  amountMicros?: bigint | null;
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
    signature: intent.digest,
    x402Routed: intent.x402Routed === true,
    amountMicros: intent.amountMicros != null ? intent.amountMicros.toString() : null
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

/**
 * Throws INTENT_RATE_LIMITED before any row is written: nothing is stored and no receipt exists
 * for a blocked call. Served by the existing (agentId, createdAt) index on payout_intents.
 */
export async function assertIntentBudget(agentId: string, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const [mine, all] = await Promise.all([
    prisma.payoutIntent.count({ where: { agentId, createdAt: { gte: since } } }),
    prisma.payoutIntent.count({ where: { createdAt: { gte: since } } })
  ]);
  if (intentBudgetExceeded({ mine, all })) throw new Error(INTENT_RATE_LIMITED);
}

export async function processPayoutIntent(
  agent: Agent,
  body: IntentBody,
  options: ProcessPayoutOptions = {}
): Promise<PublicIntent> {
  const gonka = options.gonka ?? runGonka;
  const settlement = options.settlement ?? "rail";
  assertArtifactSize(body.artifact);
  const existing = await prisma.payoutIntent.findUnique({ where: { idempotencyKey: body.idempotency_key } });
  if (existing) {
    // Another workspace's key: refuse, and never hand back that workspace's intent or receipt token.
    assertReplayBelongsTo(existing, agent);
    return toPublicIntent(existing);
  }
  await assertIntentBudget(agent.id);

  // Only this workspace's recipients, and through them only its own open invoices.
  const recipient = await prisma.recipient.findFirst({ where: { ref: body.recipient_ref, agentId: agent.id } });
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

  // assertIntentBudget above is a fast pre-check only: its count and this insert are two
  // separate round trips, so two calls arriving together can both count a spot free and both
  // write (S20 -- confirmed in job #379's review, REVIEW_PR31.md). The recheck and the insert
  // below happen inside one advisory-locked transaction instead, so nothing between the count
  // and the write can slip through: a fixed lock key serializes intent creation
  // deployment-wide, which is what closes the deployment-wide half of the cap, not just the
  // per-workspace half.
  let intent;
  try {
    intent = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(872341)`;
      const since = new Date(now.getTime() - 60 * 60 * 1000);
      const [mine, all] = await Promise.all([
        tx.payoutIntent.count({ where: { agentId: agent.id, createdAt: { gte: since } } }),
        tx.payoutIntent.count({ where: { createdAt: { gte: since } } })
      ]);
      if (intentBudgetExceeded({ mine, all })) throw new Error(INTENT_RATE_LIMITED);
      return tx.payoutIntent.create({
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
    });
  } catch (error) {
    // Two calls with the same brand-new idempotency key can both pass the earlier findUnique
    // (neither had a row yet) and both reach this insert; only one @unique constraint lets one
    // through. Without this catch the loser threw a raw 500 instead of the same graceful reply
    // an ordinary replay gets (job #379's review, REVIEW_PR31.md, gap 2). Scoped to exactly that
    // constraint, so an unrelated write failure still surfaces as a real error.
    const isIdempotencyKeyConflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | string | undefined)?.toString().includes("idempotency_key");
    if (!isIdempotencyKeyConflict) throw error;
    const winner = await prisma.payoutIntent.findUniqueOrThrow({ where: { idempotencyKey: body.idempotency_key } });
    assertReplayBelongsTo(winner, agent);
    return toPublicIntent(winner);
  }

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

  // Refuse before any
  // inference or debit when there is nowhere to send the money.
  const target = chainForRecipient(recipient);
  if (!target) {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: recipientAddressReason(), ...pricing }
    });
    return toPublicIntent(denied);
  }
  const chain = settledChain(agent.rail, target.chain);

  // An x402 authorization is only ever signed with Solana devnet USDC from the treasury. A
  // workspace that settles anywhere else (practice wallet, MOCK_SETTLEMENT, RAIL=tempo) is
  // refused here, before the checks run and before anything counts against its limits.
  if (settlement === "defer" && chain !== "solana") {
    const pricing = await pricingData();
    const denied = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: { status: "refused", decisionClass: "RED", reasonCode: X402_NEEDS_LIVE_WALLET, ...pricing }
    });
    return toPublicIntent(denied);
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

  const [artifactRun, payerRun] = await Promise.allSettled([
    gonka({ channel: "artifact", messages: artifactMessages, schema: artifactDecisionSchema }),
    gonka({ channel: "payer_record", messages: payerMessages, schema: payerRecordDecisionSchema })
  ]);
  const artifactResult = artifactRun.status === "fulfilled" ? artifactRun.value : unavailable("moonshotai/Kimi-K2.6");
  const payerResult = payerRun.status === "fulfilled" ? payerRun.value : unavailable("deepseek-ai/DeepSeek-V4-Flash-0731");

  const payerTuple = tuple(payerResult);
  const artifactTuple = tuple(artifactResult);
  const channelPolicyWorkOrder = payerTuple
    ? openWorkOrders.find((workOrder) => workOrder.ref === payerTuple.workOrderId)
    : null;
  // The amount rule cannot be turned off: the work order's stored choice can only add strictness.
  const storedChannels = channelPolicyWorkOrder ? requiredChannelsFrom(channelPolicyWorkOrder.requiredChannels) : "both";
  const requiredChannels = payerTuple ? effectiveChannels(storedChannels, payerTuple.amountMicros) : storedChannels;
  // A fallback that left both checks on one maker is recorded. It does not change pay or refuse.
  const sameMaker = sameMakerFallback({
    requiredChannels,
    artifactModel: artifactResult.model,
    payerModel: payerResult.model,
    artifactAnswered: artifactTuple !== null,
    payerAnswered: payerTuple !== null,
    artifactPrimary: CANDIDATES.artifact[0],
    payerPrimary: CANDIDATES.payer_record[0]
  });

  await prisma.adjudication.createMany({
    data: [
      {
        intentId: intent.id,
        channel: "artifact",
        model: modelAnsweredWith(artifactResult),
        requestId: artifactResult.requestId,
        fallback: artifactResult.fallback,
        promptSha: fingerprintPrompt(artifactMessages),
        responseSha: fingerprintResponse(artifactResult.content),
        inputTokens: artifactResult.inputTokens,
        outputTokens: artifactResult.outputTokens,
        latencyMs: artifactResult.latencyMs,
        tupleJson: tupleJson(artifactResult),
        ok: artifactResult.ok,
        sameMaker
      },
      {
        intentId: intent.id,
        channel: "payer_record",
        model: modelAnsweredWith(payerResult),
        requestId: payerResult.requestId,
        fallback: payerResult.fallback,
        promptSha: fingerprintPrompt(payerMessages),
        responseSha: fingerprintResponse(payerResult.content),
        inputTokens: payerResult.inputTokens,
        outputTokens: payerResult.outputTokens,
        latencyMs: payerResult.latencyMs,
        tupleJson: tupleJson(payerResult),
        ok: payerResult.ok,
        sameMaker
      }
    ]
  });

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

  const pricing = await pricingData();

  // Step 1, committed before any money moves: the debit, the discharge, and the intent marked
  // pending. Nothing here touches the network, so a rollback can only mean the database refused.
  let committed;
  try {
    committed = await prisma.$transaction(async (tx) => {
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

      if (settlement === "defer") {
        return tx.payoutIntent.update({
          where: { id: intent.id },
          data: {
            workOrderId: selected.id,
            amountMicros: reconciled.tuple.amountMicros,
            status: "processing",
            decisionClass: "AMBER",
            x402Routed: true,
            chain,
            ...pricing
          }
        });
      }

      return tx.payoutIntent.update({
        where: { id: intent.id },
        data: committedPendingData({ workOrderId: selected.id, amountMicros: reconciled.tuple.amountMicros, chain, pricing })
      });
    });
  } catch (error) {
    // The database did not commit anything: no debit, no discharge, nothing sent.
    console.error(`[intents] commit before settlement failed for intent ${intent.id}`, error);
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

  if (committed.status !== "processing" || settlement === "defer") return toPublicIntent(committed);

  // Step 2, outside any database transaction: sign, store the id, broadcast, confirm. Only a
  // proven outcome changes the record; a timeout leaves it pending and the invoice closed.
  await settleCommittedIntent(prisma, {
    intentId: intent.id,
    workOrderId: selected.id,
    amountMicros: reconciled.tuple.amountMicros,
    target,
    rail: payoutRail(agent.rail, target.chain),
    paidReasonCode: null,
    pricing
  });
  return toPublicIntent(await prisma.payoutIntent.findUniqueOrThrow({ where: { id: intent.id } }));
}

/**
 * Record what an x402 seller reported. PAID needs proof, not the seller's word: the reported
 * transaction id must be a confirmed, error-free transaction on Solana devnet that carries
 * Tiba's own signature (which covers the exact amount, mint and payTo the checks cleared).
 * Anything short of that stays SETTLEMENT_PENDING. The invoice stays discharged either way.
 */
export async function finalizeX402Settlement(
  intentId: string,
  settlement: SettlementResponse,
  expectedSignature: string | null = null,
  readTransaction: ChainTransactionReader = readSolanaTransaction
): Promise<PublicIntent> {
  const intent = await prisma.payoutIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new Error("INTENT_NOT_FOUND");
  if (!intent.x402Routed) throw new Error("INTENT_NOT_X402");

  const reported = settlement.transaction?.trim() ?? "";
  // A transaction id that is not base58 is not a transaction id: never stored, never linked.
  const digest = reported && isBase58Signature(reported) ? reported : null;
  const explorerUrl = digest ? solanaExplorerTxUrl(digest) : null;
  const proven = settlement.success && (await x402SettlementProven(digest, expectedSignature, readTransaction));
  const pending = settlement.errorReason === "settlement_pending" || (settlement.success && !proven);
  const pricing = await pricingData();

  if (proven) {
    const updated = await prisma.payoutIntent.update({
      where: { id: intentId },
      data: {
        status: "settled",
        decisionClass: "PAID",
        reasonCode: null,
        digest,
        explorerUrl,
        ...pricing
      }
    });
    await replenishDemoWorkOrder(prisma, { workOrderId: updated.workOrderId, settled: true });
    return toPublicIntent(updated);
  }

  if (pending) {
    const updated = await prisma.payoutIntent.update({
      where: { id: intentId },
      data: {
        status: "processing",
        decisionClass: "AMBER",
        reasonCode: "SETTLEMENT_PENDING",
        digest,
        explorerUrl,
        ...pricing
      }
    });
    return toPublicIntent(updated);
  }

  const updated = await prisma.payoutIntent.update({
    where: { id: intentId },
    data: {
      status: "refused",
      decisionClass: "RED",
      reasonCode: "SETTLEMENT_FAILED",
      digest,
      explorerUrl,
      ...pricing
    }
  });
  return toPublicIntent(updated);
}
