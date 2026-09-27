import { replenishDemoWorkOrder } from "./demo-replenish.ts";
import { executionFailedCode, PayoutRailError, settlementProvenFailed, type Chain, type PayoutRail } from "./rails/index.ts";
import { solanaExplorerTxUrl } from "./rails/solana.ts";

/**
 * Money moves in two steps, never inside one database transaction:
 *
 *   1. The engine debits the limits, discharges the invoice and commits the intent as
 *      processing / AMBER / SETTLEMENT_PENDING. That commit is final before any broadcast.
 *   2. settleCommittedIntent signs, stores the transaction id, broadcasts, and waits for both
 *      RPC endpoints. Only a proven outcome changes the record: confirmed -> PAID; proven not
 *      sent or rejected by the chain -> refused and the invoice reopened. A timeout, a split or
 *      any other unknown leaves the intent pending with its id, and the invoice stays closed.
 *
 * Before this, the send ran inside the transaction that held the debit and the discharge. A slow
 * confirmation threw, the rollback reopened the invoice, the intent was written refused, and the
 * transfer landed anyway, so a retry with a new key paid the same invoice twice.
 */

export const SETTLEMENT_PENDING = "SETTLEMENT_PENDING";
export const SETTLEMENT_FAILED = "SETTLEMENT_FAILED";

export type SettlementPricing = { gnkUsd: string | null; pricingUpdatedAt: Date | null };

export type SettlementIntentRow = {
  id: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  digest: string | null;
  explorerUrl: string | null;
  workOrderId: string | null;
};

/** The slice of PrismaClient this module touches. Tests pass an in-memory stand-in. */
export type SettlementClient = {
  payoutIntent: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<SettlementIntentRow>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  workOrder: {
    findUnique(args: { where: { id: string }; select: { id: true; ref: true } }): Promise<{ id: string; ref: string } | null>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

export type SettleInput = {
  intentId: string;
  workOrderId: string;
  amountMicros: bigint;
  target: { chain: Chain; address: string };
  rail: PayoutRail;
  /** Reason stamped on a PAID intent: null for the engine, "OWNER_OVERRIDE" for the console. */
  paidReasonCode: string | null;
  pricing: SettlementPricing;
  log?: (message: string, error: unknown) => void;
};

/** The data the engine commits in step 1, before any broadcast. Kept here so both callers agree. */
export function committedPendingData(input: {
  workOrderId: string;
  amountMicros: bigint;
  chain: string;
  pricing: SettlementPricing;
}): Record<string, unknown> {
  return {
    workOrderId: input.workOrderId,
    amountMicros: input.amountMicros,
    status: "processing",
    decisionClass: "AMBER",
    reasonCode: SETTLEMENT_PENDING,
    digest: null,
    explorerUrl: null,
    chain: input.chain,
    ...input.pricing
  };
}

/**
 * What to do with a committed intent after the rail threw. Pure. Only a failure the rail has
 * proven (nothing sent, or the chain rejected it) may reopen the invoice; everything else,
 * including plain Errors, keeps it closed and the intent pending.
 */
export function afterSettlementFailure(error: unknown): {
  reopenInvoice: boolean;
  status: "refused" | "processing";
  decisionClass: "RED" | "AMBER";
  reasonCode: typeof SETTLEMENT_FAILED | typeof SETTLEMENT_PENDING;
} {
  if (settlementProvenFailed(error)) {
    return { reopenInvoice: true, status: "refused", decisionClass: "RED", reasonCode: SETTLEMENT_FAILED };
  }
  return { reopenInvoice: false, status: "processing", decisionClass: "AMBER", reasonCode: SETTLEMENT_PENDING };
}

export async function settleCommittedIntent(db: SettlementClient, input: SettleInput): Promise<SettlementIntentRow> {
  const log = input.log ?? ((message, error) => console.error(message, error));
  try {
    const receipt = await input.rail.send({
      recipientAddress: input.target.address,
      amountMicros: input.amountMicros,
      intentId: input.intentId,
      onSigned: async (signature) => {
        await db.payoutIntent.update({
          where: { id: input.intentId },
          data: { digest: signature, explorerUrl: solanaExplorerTxUrl(signature) }
        });
      }
    });
    if (!receipt.digest || !receipt.explorerUrl) {
      throw new PayoutRailError(executionFailedCode(input.target.chain), "Settlement did not return a digest.", { outcome: "unknown" });
    }
    const paid = await db.payoutIntent.update({
      where: { id: input.intentId },
      data: {
        status: "settled",
        decisionClass: "PAID",
        reasonCode: input.paidReasonCode,
        digest: receipt.digest,
        explorerUrl: receipt.explorerUrl,
        ...input.pricing
      }
    });
    await replenishDemoWorkOrder(db, { workOrderId: input.workOrderId, settled: true });
    return paid;
  } catch (error) {
    const next = afterSettlementFailure(error);
    if (next.reopenInvoice) {
      // Proven: nothing moved. Give the invoice back; the debit stays counted (conservative).
      await db.workOrder.updateMany({
        where: { id: input.workOrderId, dischargedByIntentId: input.intentId },
        data: { status: "open", dischargedByIntentId: null }
      });
      return db.payoutIntent.update({
        where: { id: input.intentId },
        data: { status: next.status, decisionClass: next.decisionClass, reasonCode: next.reasonCode, ...input.pricing }
      });
    }
    // Unknown: the transfer may have landed. The stored id (if any) is what settles it later.
    log(`[settlement] intent ${input.intentId} left ${SETTLEMENT_PENDING}: outcome unknown`, error);
    return db.payoutIntent.update({
      where: { id: input.intentId },
      data: { status: next.status, decisionClass: next.decisionClass, reasonCode: next.reasonCode, ...input.pricing }
    });
  }
}
