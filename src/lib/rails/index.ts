export interface PayoutRequest {
  recipientAddress: string;
  amountMicros: bigint;
  intentId: string;
  coinType?: string;
}

export interface PayoutReceipt {
  digest: string;
  explorerUrl: string;
}

export interface PayoutRail {
  send(request: PayoutRequest): Promise<PayoutReceipt>;
  batch(requests: PayoutRequest[]): Promise<PayoutReceipt>;
}

export type PayoutRailErrorCode =
  | "UNSUPPORTED_RAIL"
  | "INVALID_PAYOUT"
  | "SUI_NETWORK_NOT_TESTNET"
  | "SUI_PRIVATE_KEY_MISSING"
  | "SUI_ADDRESS_MISMATCH"
  | "SUI_EXECUTION_FAILED";

export class PayoutRailError extends Error {
  readonly code: PayoutRailErrorCode;

  constructor(code: PayoutRailErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PayoutRailError";
    this.code = code;
  }
}

export function isPayoutRailError(error: unknown): error is PayoutRailError {
  return error instanceof PayoutRailError;
}

const mockRail: PayoutRail = {
  async send(request) {
    const digest = `mock-testnet-${request.intentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
    return { digest, explorerUrl: `https://explorer.sui.io/txblock/${digest}?network=testnet` };
  },
  async batch(requests) {
    const joinedIds = requests.map((request) => request.intentId).join("-");
    const digest = `mock-testnet-batch-${joinedIds.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
    return { digest, explorerUrl: `https://explorer.sui.io/txblock/${digest}?network=testnet` };
  }
};

export type RailName = "mock" | "sui";

const suiRailLoader: PayoutRail = {
  async send(request) {
    const { suiRail } = await import("./sui.ts");
    return suiRail.send(request);
  },
  async batch(requests) {
    const { suiRail } = await import("./sui.ts");
    return suiRail.batch(requests);
  }
};

export const rails: Record<RailName, PayoutRail> = {
  mock: mockRail,
  sui: suiRailLoader
};

export function payoutRail(name: string): PayoutRail {
  if (name !== "mock" && name !== "sui") {
    throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported rail: ${name}`);
  }
  const rail = rails[name];
  return rail;
}
