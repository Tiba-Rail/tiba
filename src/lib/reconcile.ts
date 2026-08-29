export type RequiredChannels = "payer_record" | "both" | "human";

export interface DecisionTuple {
  workOrderId: string;
  amountMicros: bigint;
  deliveryTimestamp?: string;
}

export interface ChannelProposal {
  channel: "artifact" | "payer_record";
  tuple: DecisionTuple;
}

export type Reconciliation =
  | { ok: true; tuple: DecisionTuple }
  | { ok: false; decisionClass: "AMBER" | "RED"; reasonCode: string };

export function requiredChannelsForAmount(amountMicros: bigint): RequiredChannels {
  if (amountMicros < 50_000_000n) return "payer_record";
  if (amountMicros <= 250_000_000n) return "both";
  return "human";
}

export function reconcile(
  requiredChannels: RequiredChannels,
  proposals: Partial<Record<"artifact" | "payer_record", DecisionTuple>>
): Reconciliation {
  const payer = proposals.payer_record;
  const artifact = proposals.artifact;
  if (!payer && !artifact) return { ok: false, decisionClass: "AMBER", reasonCode: "INFERENCE_UNAVAILABLE" };
  if (requiredChannels === "payer_record") {
    return payer ? { ok: true, tuple: payer } : { ok: false, decisionClass: "AMBER", reasonCode: "MISSING_PAYER_RECORD" };
  }
  if (requiredChannels === "human") {
    return { ok: false, decisionClass: "AMBER", reasonCode: "HUMAN_REVIEW_REQUIRED" };
  }
  if (!payer || !artifact) return { ok: false, decisionClass: "AMBER", reasonCode: "MISSING_REQUIRED_CHANNEL" };
  if (payer.workOrderId !== artifact.workOrderId) {
    return { ok: false, decisionClass: "RED", reasonCode: "QUORUM_SPLIT:work_order_id" };
  }
  if (payer.amountMicros !== artifact.amountMicros) {
    return { ok: false, decisionClass: "RED", reasonCode: "QUORUM_SPLIT:amount_micros" };
  }
  if ((payer.deliveryTimestamp ?? "") !== (artifact.deliveryTimestamp ?? "")) {
    return { ok: false, decisionClass: "RED", reasonCode: "QUORUM_SPLIT:delivery_timestamp" };
  }
  return { ok: true, tuple: payer };
}
