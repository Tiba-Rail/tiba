/**
 * Demo reproducibility, not production semantics.
 *
 * A work order can be paid exactly once — that is the point of the product. But the public
 * judge walkthrough tells EVERY judge to pay the same order (WO-13) and expect PAID, so the
 * first judge discharges it and everyone after sees a refusal where a payment was promised.
 *
 * After a genuinely settled payment against a designated demo order, we re-open that same
 * order — same ref, same ceiling, same payer record — so the next judge repeats the
 * walkthrough verbatim. Nothing else in the system is ever auto-replenished.
 */

/** Refs eligible for replenishment. Env overrides; WO-13 is the documented demo order. */
export function demoReplenishRefs(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.DEMO_REPLENISH_REFS;
  if (raw === undefined) return ["WO-13"];
  return raw.split(",").map((r) => r.trim()).filter(Boolean);
}

/** Each demo payment spends real testnet SUI, so cap how often one ref may recycle. */
export const DEMO_REPLENISH_DAILY_CAP = 40;

/**
 * Pure decision, unit-tested. Replenish only a designated ref, only after a real settlement,
 * and only while under the rolling 24h cap.
 */
export function shouldReplenish(input: {
  ref: string;
  settled: boolean;
  settledCountLast24h: number;
  refs?: string[];
  cap?: number;
}): boolean {
  const refs = input.refs ?? demoReplenishRefs();
  const cap = input.cap ?? DEMO_REPLENISH_DAILY_CAP;
  if (!input.settled) return false;
  if (!refs.includes(input.ref)) return false;
  return input.settledCountLast24h < cap;
}

type ReplenishClient = {
  workOrder: {
    findUnique(args: { where: { id: string }; select: { id: true; ref: true } }): Promise<{ id: string; ref: string } | null>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  payoutIntent: { count(args: { where: Record<string, unknown> }): Promise<number> };
};

/**
 * Best-effort. The payment is the product; a failure to recycle the demo fixture must never
 * surface to the caller or undo a settled transfer, so every error is swallowed.
 */
export async function replenishDemoWorkOrder(
  client: ReplenishClient,
  args: { workOrderId: string | null; settled: boolean; now?: Date }
): Promise<"replenished" | "skipped"> {
  try {
    if (!args.workOrderId || !args.settled) return "skipped";
    const order = await client.workOrder.findUnique({
      where: { id: args.workOrderId },
      select: { id: true, ref: true }
    });
    if (!order) return "skipped";
    const since = new Date((args.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
    const settledCountLast24h = await client.payoutIntent.count({
      where: { workOrderId: order.id, status: "settled", createdAt: { gte: since } }
    });
    if (!shouldReplenish({ ref: order.ref, settled: true, settledCountLast24h })) {
      if (settledCountLast24h >= DEMO_REPLENISH_DAILY_CAP) {
        console.warn(`[demo-replenish] ${order.ref} hit the ${DEMO_REPLENISH_DAILY_CAP}/24h cap; leaving it discharged.`);
      }
      return "skipped";
    }
    // Re-open the same row: the walkthrough names WO-13 literally, so the ref must not change.
    const reopened = await client.workOrder.updateMany({
      where: { id: order.id, status: "discharged" },
      data: { status: "open", dischargedByIntentId: null }
    });
    return reopened.count === 1 ? "replenished" : "skipped";
  } catch (error) {
    console.warn("[demo-replenish] skipped:", error instanceof Error ? error.message : error);
    return "skipped";
  }
}
