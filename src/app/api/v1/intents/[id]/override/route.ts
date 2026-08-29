import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGnkUsdRate } from "@/lib/gonka-pricing";
import { isOperatorRequest } from "@/lib/operator-auth";
import { debitAtomically, evaluateBeforeDebit, type AgentLimits, type PolicyReason, type SqlExecutor } from "@/lib/policy";
import { PayoutRailError, payoutRail } from "@/lib/rails";

export const runtime = "nodejs";

function tupleFrom(value: unknown): { workOrderId: string; amountMicros: bigint; deliveryTimestamp?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tuple = value as Record<string, unknown>;
  if (typeof tuple.work_order_id !== "string") return null;
  if (typeof tuple.amount_micros !== "string" || !/^\d+$/.test(tuple.amount_micros)) return null;
  return {
    workOrderId: tuple.work_order_id,
    amountMicros: BigInt(tuple.amount_micros),
    deliveryTimestamp: typeof tuple.delivery_timestamp === "string" ? tuple.delivery_timestamp : undefined
  };
}

async function pricingData() {
  const rate = await getGnkUsdRate();
  return {
    gnkUsd: rate?.value ?? null,
    pricingUpdatedAt: rate?.updatedAt ?? null
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  const intent = await prisma.payoutIntent.findUnique({
    where: { id },
    include: { agent: true, recipient: true, adjudications: true }
  });
  if (!intent) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (intent.decisionClass === "PAID") {
    return NextResponse.json({ error: "ALREADY_PAID" }, { status: 409 });
  }
  if (intent.decisionClass !== "AMBER" && !(intent.decisionClass === "RED" && intent.reasonCode?.startsWith("QUORUM_SPLIT"))) {
    return NextResponse.json({ error: "NOT_OVERRIDABLE" }, { status: 409 });
  }

  const payerAdjudication = intent.adjudications
    .filter((row) => row.channel === "payer_record")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const tuple = tupleFrom(payerAdjudication?.tupleJson);
  const pricing = await pricingData();
  if (!tuple) {
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "held",
        decisionClass: "AMBER",
        reasonCode: "MISSING_PAYER_RECORD",
        ...pricing
      }
    });
    return NextResponse.json({ id: updated.id, decision_class: updated.decisionClass, reason_code: updated.reasonCode });
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      ref: tuple.workOrderId,
      recipientId: intent.recipientId
    }
  });
  const now = new Date();
  const before = evaluateBeforeDebit({
    agent: intent.agent as AgentLimits,
    workOrder,
    recipientActive: intent.recipient.active,
    amountMicros: tuple.amountMicros,
    now
  });
  if (!before.ok) {
    const updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "refused",
        decisionClass: "RED",
        reasonCode: before.reasonCode,
        amountMicros: tuple.amountMicros,
        workOrderId: workOrder?.id,
        ...pricing
      }
    });
    return NextResponse.json({ id: updated.id, decision_class: updated.decisionClass, reason_code: updated.reasonCode });
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const debit = await debitAtomically(tx as unknown as SqlExecutor, intent.agent as AgentLimits, tuple.amountMicros, now);
      if (!debit.ok) {
        return tx.payoutIntent.update({
          where: { id: intent.id },
          data: {
            status: "refused",
            decisionClass: "RED",
            reasonCode: debit.reasonCode as PolicyReason,
            amountMicros: tuple.amountMicros,
            workOrderId: workOrder?.id,
            ...pricing
          }
        });
      }
      const claimed = await tx.workOrder.updateMany({
        where: {
          id: workOrder!.id,
          status: "open",
          dischargedByIntentId: null,
          expiresAt: { gt: now }
        },
        data: { status: "discharged", dischargedByIntentId: intent.id }
      });
      if (claimed.count !== 1) {
        return tx.payoutIntent.update({
          where: { id: intent.id },
          data: {
            status: "refused",
            decisionClass: "RED",
            reasonCode: "WORK_ORDER_NOT_OPEN",
            amountMicros: tuple.amountMicros,
            workOrderId: workOrder?.id,
            ...pricing
          }
        });
      }
      const receipt = await payoutRail(intent.agent.rail).send({
        recipientAddress: intent.recipient.suiAddress,
        amountMicros: tuple.amountMicros,
        intentId: intent.id
      });
      if (!receipt.digest || !receipt.explorerUrl) {
        throw new PayoutRailError("SUI_EXECUTION_FAILED", "Settlement did not return a digest.");
      }
      return tx.payoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "settled",
          decisionClass: "PAID",
          reasonCode: "OWNER_OVERRIDE",
          amountMicros: tuple.amountMicros,
          workOrderId: workOrder!.id,
          digest: receipt.digest,
          explorerUrl: receipt.explorerUrl,
          ...pricing
        }
      });
    });
  } catch {
    updated = await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "refused",
        decisionClass: "RED",
        reasonCode: "SETTLEMENT_FAILED",
        amountMicros: tuple.amountMicros,
        workOrderId: workOrder?.id,
        digest: null,
        explorerUrl: null,
        ...pricing
      }
    });
  }

  return NextResponse.json({
    id: updated.id,
    decision_class: updated.decisionClass,
    reason_code: updated.reasonCode,
    amount_micros: updated.amountMicros.toString(),
    digest: updated.digest,
    explorer_url: updated.explorerUrl
  });
}
