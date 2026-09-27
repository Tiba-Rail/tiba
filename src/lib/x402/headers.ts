import type { PaymentPayload, PaymentRequired, SettlementResponse } from "./types.ts";

function decodeBase64Json(value: string): unknown {
  const trimmed = value.trim();
  const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  if (!json) throw new Error("X402_HEADER_EMPTY");
  return JSON.parse(json) as unknown;
}

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodePaymentRequired(header: string | null): PaymentRequired {
  if (!header) throw new Error("X402_PAYMENT_REQUIRED_MISSING");
  const parsed = decodeBase64Json(header);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("X402_PAYMENT_REQUIRED_INVALID");
  }
  const body = parsed as Record<string, unknown>;
  if (body.x402Version !== 2) throw new Error("X402_UNSUPPORTED_VERSION");
  if (!body.resource || typeof body.resource !== "object" || Array.isArray(body.resource)) {
    throw new Error("X402_PAYMENT_REQUIRED_INVALID");
  }
  const resource = body.resource as Record<string, unknown>;
  if (typeof resource.url !== "string" || !resource.url) throw new Error("X402_PAYMENT_REQUIRED_INVALID");
  if (!Array.isArray(body.accepts)) throw new Error("X402_PAYMENT_REQUIRED_INVALID");
  return body as unknown as PaymentRequired;
}

export function decodeSettlementResponse(header: string | null): SettlementResponse {
  if (!header) throw new Error("X402_PAYMENT_RESPONSE_MISSING");
  const parsed = decodeBase64Json(header);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("X402_PAYMENT_RESPONSE_INVALID");
  }
  const body = parsed as Record<string, unknown>;
  if (typeof body.success !== "boolean") throw new Error("X402_PAYMENT_RESPONSE_INVALID");
  if (typeof body.network !== "string") throw new Error("X402_PAYMENT_RESPONSE_INVALID");
  if (typeof body.transaction !== "string") throw new Error("X402_PAYMENT_RESPONSE_INVALID");
  return body as unknown as SettlementResponse;
}

export function encodePaymentSignature(payload: PaymentPayload): string {
  return encodeBase64Json(payload);
}
