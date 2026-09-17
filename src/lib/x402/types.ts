/** x402 v2 types used by Tiba as a buyer. Facilitator APIs are out of scope. */

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: { transaction: string };
  extensions?: Record<string, unknown>;
}

export interface SettlementResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
  extensions?: Record<string, unknown>;
}

export type PublicX402Intent = {
  id: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  digest: string | null;
  explorerUrl: string | null;
  publicToken: string;
  chain: string | null;
  signature: string | null;
  x402Routed: boolean;
};

export type X402Agent = { id: string };

export type X402AuthorizeBody = {
  idempotency_key: string;
  artifact: string;
  recipient_ref: string;
};
