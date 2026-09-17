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
  signPayment: (accepted: PaymentRequirements) => Promise<string>;
  recordSettlement: (intentId: string, settlement: SettlementResponse) => Promise<PublicX402Intent>;
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

  const transaction = await deps.signPayment(accepted);
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

  const second = await deps.fetch(input.url, retryInit);
  let settlement: SettlementResponse;
  try {
    settlement = decodeSettlementResponse(second.headers.get("PAYMENT-RESPONSE"));
  } catch (error) {
    const recorded = await deps.recordSettlement(intent.id, {
      success: false,
      errorReason: "X402_PAYMENT_RESPONSE_MISSING",
      transaction: "",
      network: accepted.network
    });
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "X402_PAYMENT_RESPONSE_INVALID",
      intent: recorded
    };
  }

  const recorded = await deps.recordSettlement(intent.id, settlement);
  if (settlement.success) {
    return { kind: "paid", intent: recorded, status: second.status, body: await second.text(), settlement };
  }
  return { kind: "refused", intent: recorded, error: settlement.errorReason };
}
