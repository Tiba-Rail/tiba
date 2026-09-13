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
  | "RECIPIENT_NEEDS_SOLANA_ADDRESS"
  | "SOLANA_NETWORK_NOT_DEVNET"
  | "SOLANA_PRIVATE_KEY_MISSING"
  | "SOLANA_ADDRESS_MISMATCH"
  | "SOLANA_EXECUTION_FAILED";

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

export type Chain = "solana";

/** Solana is the only settlement path. A blank address is refused before evaluation or debit. */
export function chainForRecipient(recipient: { solanaAddress: string | null }): { chain: Chain; address: string } | null {
  const solana = recipient.solanaAddress?.trim();
  if (solana) return { chain: "solana", address: solana };
  return null;
}

/** Solana devnet is the only supported settlement chain. */
export function defaultChain(): Chain {
  return "solana";
}

/** Execution-failure code for a chain, so a missing digest reports the chain that was tried. */
export function executionFailedCode(chain: Chain): PayoutRailErrorCode {
  return "SOLANA_EXECUTION_FAILED";
}

function mockRail(): PayoutRail {
  const explorerUrl = (digest: string) => `https://explorer.solana.com/tx/${digest}?cluster=devnet`;
  return {
    async send(request) {
      const digest = `mock-testnet-${request.intentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
      return { digest, explorerUrl: explorerUrl(digest) };
    },
    async batch(requests) {
      const joinedIds = requests.map((request) => request.intentId).join("-");
      const digest = `mock-testnet-batch-${joinedIds.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
      return { digest, explorerUrl: explorerUrl(digest) };
    }
  };
}

export type RailName = "mock" | "solana" | "legacy";

const solanaRailLoader: PayoutRail = {
  async send(request) {
    const { solanaRail } = await import("./solana.ts");
    return solanaRail.send(request);
  },
  async batch(requests) {
    const { solanaRail } = await import("./solana.ts");
    return solanaRail.batch(requests);
  }
};

export const rails: Record<RailName, PayoutRail> = {
  mock: mockRail(),
  legacy: solanaRailLoader,
  solana: solanaRailLoader
};

function isMock(name: string): boolean {
  return process.env.MOCK_SETTLEMENT === "1" || name === "mock";
}

/**
 * Legacy live agents now settle on Solana too. No recipient-specific rail selection remains.
 */
export function payoutRail(name: string, chain?: Chain): PayoutRail {
  if (isMock(name)) return mockRail();
  if (name !== "legacy" && name !== "solana") {
    throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported rail: ${name}`);
  }
  return rails[chain ?? "solana"];
}

/** Value for PayoutIntent.chain: "mock" when the mock rail settles, else the recipient's chain. */
export function settledChain(name: string, chain: Chain): Chain | "mock" {
  return isMock(name) ? "mock" : chain;
}
