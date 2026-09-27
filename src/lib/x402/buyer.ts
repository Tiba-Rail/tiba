import { microsToUsdc } from "../money.ts";
import { decodePaymentRequired, decodeSettlementResponse, encodePaymentSignature } from "./headers.ts";
import { pickSolanaUsdcAccept } from "./required.ts";
import type {
  PaymentRequirements,
  PublicX402Intent,
  ResourceInfo,
  SettlementResponse,
  X402Agent,
  X402AuthorizeBody
} from "./types.ts";

export type X402PayInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  idempotency_key: string;
};

export type X402Obligation = { recipientRef: string; workOrderRef: string };

export type X402BuyerDeps = {
  fetch: typeof fetch;
  authorize: (agent: X402Agent, body: X402AuthorizeBody) => Promise<PublicX402Intent>;
  /**
   * Atomically mark the intent as being signed. Must return true exactly once per intent
   * (a conditional update whose row count is 1), so a retried or parallel call never signs again.
   */
  claimSignature: (intentId: string) => Promise<boolean>;
  signPayment: (accepted: PaymentRequirements) => Promise<string>;
  /**
   * Persist Tiba's own signature the moment it exists, before the seller round-trip that could
   * crash mid-flight. Without this, a crash between signing and recordSettlement leaves the
   * intent stuck at X402_SIGNING forever with no way to tell "never signed, safe to fail" apart
   * from "signed, maybe sent, needs an on-chain check" (job #379's review, REVIEW_PR31.md, gap 3).
   * A no-op is fine when expectedSignature is null (signPayment succeeded but the signature
   * couldn't be read back) -- that narrow case is no worse than before this fix.
   */
  recordSigned: (intentId: string, expectedSignature: string) => Promise<void>;
  /**
   * Record what the seller reported. `expectedSignature` is Tiba's own signature inside the
   * transaction it signed (null when it cannot be read); a settlement is only PAID when the
   * seller's transaction id is confirmed on chain and carries that signature.
   */
  recordSettlement: (
    intentId: string,
    settlement: SettlementResponse,
    expectedSignature: string | null
  ) => Promise<PublicX402Intent>;
  /** Base58 of Tiba's own signature inside the serialized transaction signPayment returned, or null. */
  treasurySignature: (serializedTransaction: string) => string | null;
  ensureObligation: (
    agent: X402Agent,
    accepted: PaymentRequirements,
    resource: ResourceInfo,
    idempotencyKey: string
  ) => Promise<X402Obligation>;
};

export type X402PayResult =
  | { kind: "free"; status: number; body: string }
  | { kind: "refused"; intent: PublicX402Intent; error?: string }
  | { kind: "paid"; intent: PublicX402Intent; status: number; body: string; settlement: SettlementResponse }
  | { kind: "error"; error: string; intent?: PublicX402Intent };

function evidenceArtifact(resource: ResourceInfo, accepted: PaymentRequirements, workOrderRef: string): string {
  return [
    "x402 resource request",
    `Work order: ${workOrderRef}`,
    `Amount: ${microsToUsdc(BigInt(accepted.amount))} (${accepted.amount} amount_micros)`,
    `payTo: ${accepted.payTo}`,
    `url: ${resource.url}`,
    resource.description ? `description: ${resource.description}` : null,
    `network: ${accepted.network}`,
    `asset: ${accepted.asset}`
  ]
    .filter(Boolean)
    .join("\n");
}

/** True only when Tiba's own engine has already cleared the payout and no signature has been produced yet. */
export function clearedToSignX402(intent: PublicX402Intent): boolean {
  return intent.x402Routed === true && intent.status === "processing" && intent.decisionClass !== "RED";
}

/**
 * Pay an x402 v2 resource as a Solana buyer. Gonka + policy run before any signature.
 * Never implements a facilitator: Tiba does not verify or broadcast anyone else's payment.
 */
export async function payX402Resource(
  agent: X402Agent,
  input: X402PayInput,
  deps: X402BuyerDeps
): Promise<X402PayResult> {
  const method = input.method ?? "GET";
  const requestInit: RequestInit = {
    method,
    headers: { ...(input.headers ?? {}) }
  };
  if (input.body != null && method !== "GET" && method !== "HEAD") {
    requestInit.body = input.body;
  }

  const first = await deps.fetch(input.url, requestInit);
  if (first.status !== 402) {
    return { kind: "free", status: first.status, body: await first.text() };
  }

  let required;
  try {
    required = decodePaymentRequired(first.headers.get("PAYMENT-REQUIRED"));
  } catch (error) {
    return { kind: "error", error: error instanceof Error ? error.message : "X402_PAYMENT_REQUIRED_INVALID" };
  }

  const accepted = pickSolanaUsdcAccept(required.accepts);
  if (!accepted) return { kind: "error", error: "X402_NO_MATCHING_ACCEPT" };

  const resource: ResourceInfo = {
    url: required.resource.url || input.url,
    description: required.resource.description,
    mimeType: required.resource.mimeType
  };

  let obligation: X402Obligation;
  try {
    obligation = await deps.ensureObligation(agent, accepted, resource, input.idempotency_key);
  } catch (error) {
    const message = error instanceof Error ? error.message : "X402_OBLIGATION_FAILED";
    return { kind: "error", error: message };
  }

  const intent = await deps.authorize(agent, {
    idempotency_key: input.idempotency_key,
    recipient_ref: obligation.recipientRef,
    artifact: evidenceArtifact(resource, accepted, obligation.workOrderRef)
  });

  if (!clearedToSignX402(intent)) {
    return { kind: "refused", intent };
  }

  // The engine returns the stored intent for a repeated idempotency key without re-running the
  // checks or the limits. So the signature must be bound to what that intent cleared: the same
  // amount, and at most one signature ever.
  if (!intent.amountMicros || !/^\d+$/.test(intent.amountMicros) || BigInt(accepted.amount) !== BigInt(intent.amountMicros)) {
    return { kind: "refused", intent, error: "X402_AMOUNT_MISMATCH" };
  }
  if (!(await deps.claimSignature(intent.id))) {
    return { kind: "refused", intent, error: "X402_ALREADY_SIGNED" };
  }

  let transaction: string;
  try {
    transaction = await deps.signPayment(accepted);
  } catch {
    // The claim was taken but no signature exists, so nothing can move: record the failure
    // rather than leaving the intent stuck as "signing".
    const recorded = await deps.recordSettlement(
      intent.id,
      { success: false, errorReason: "X402_SIGNING_FAILED", transaction: "", network: accepted.network },
      null
    );
    return { kind: "error", error: "X402_SIGNING_FAILED", intent: recorded };
  }
  const expectedSignature = deps.treasurySignature(transaction);
  if (expectedSignature) {
    // A crash from here on has real proof material to recover from: gap 3's fix.
    await deps.recordSigned(intent.id, expectedSignature);
  }
  const retryHeaders: Record<string, string> = {
    ...(input.headers ?? {}),
    "PAYMENT-SIGNATURE": encodePaymentSignature({
      x402Version: 2,
      resource,
      accepted,
      payload: { transaction }
    })
  };
  const retryInit: RequestInit = { method, headers: retryHeaders };
  if (input.body != null && method !== "GET" && method !== "HEAD") {
    retryInit.body = input.body;
  }

  let second: Response;
  try {
    second = await deps.fetch(input.url, retryInit);
  } catch {
    // A signature has left the building. The intent stays pending, never open for a second one.
    const recorded = await deps.recordSettlement(
      intent.id,
      { success: false, errorReason: "settlement_pending", transaction: "", network: accepted.network },
      expectedSignature
    );
    return { kind: "error", error: "X402_SELLER_UNREACHABLE", intent: recorded };
  }
  let settlement: SettlementResponse;
  try {
    settlement = decodeSettlementResponse(second.headers.get("PAYMENT-RESPONSE"));
  } catch (error) {
    // The seller holds a valid signature but said nothing usable about it: pending, not failed.
    const recorded = await deps.recordSettlement(
      intent.id,
      { success: false, errorReason: "settlement_pending", transaction: "", network: accepted.network },
      expectedSignature
    );
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "X402_PAYMENT_RESPONSE_INVALID",
      intent: recorded
    };
  }

  const recorded = await deps.recordSettlement(intent.id, settlement, expectedSignature);
  if (settlement.success) {
    return { kind: "paid", intent: recorded, status: second.status, body: await second.text(), settlement };
  }
  return { kind: "refused", intent: recorded, error: settlement.errorReason };
}
