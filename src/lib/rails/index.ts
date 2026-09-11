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
  | "RECIPIENT_NO_CHAIN_ADDRESS"
  | "SUI_NETWORK_NOT_TESTNET"
  | "SUI_PRIVATE_KEY_MISSING"
  | "SUI_ADDRESS_MISMATCH"
  | "SUI_EXECUTION_FAILED"
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

export type Chain = "sui" | "solana";

/** The chain a recipient is paid on: a saved Solana address wins, else Sui, else none. "" counts as absent. */
export function chainForRecipient(recipient: { solanaAddress: string | null; suiAddress: string | null }): { chain: Chain; address: string } | null {
  const solana = recipient.solanaAddress?.trim();
  if (solana) return { chain: "solana", address: solana };
  const sui = recipient.suiAddress?.trim();
  if (sui) return { chain: "sui", address: sui };
  return null;
}

/** SETTLEMENT_CHAIN, default sui. Only for new-recipient/workspace defaults and the treasury display. */
export function defaultChain(): Chain {
  const value = process.env.SETTLEMENT_CHAIN?.trim() || "sui";
  if (value === "sui" || value === "solana") return value;
  throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported SETTLEMENT_CHAIN: ${value}`);
}

/** Execution-failure code for a chain, so a missing digest reports the chain that was tried. */
export function executionFailedCode(chain: Chain): PayoutRailErrorCode {
  return chain === "solana" ? "SOLANA_EXECUTION_FAILED" : "SUI_EXECUTION_FAILED";
}

function mockRail(chain: Chain): PayoutRail {
  const explorerUrl = (digest: string) => chain === "solana"
    ? `https://explorer.solana.com/tx/${digest}?cluster=devnet`
    : `https://explorer.sui.io/txblock/${digest}?network=testnet`;
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

export type RailName = "mock" | Chain;

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
  mock: mockRail("sui"),
  sui: suiRailLoader,
  solana: solanaRailLoader
};

function isMock(name: string): boolean {
  return process.env.MOCK_SETTLEMENT === "1" || name === "mock";
}

/**
 * The stored agent rail "sui" means "live": the chain comes from the recipient (chainForRecipient).
 * Without a chain, a live rail name is taken literally.
 */
export function payoutRail(name: string, chain?: Chain): PayoutRail {
  if (isMock(name)) return mockRail(chain ?? "sui");
  if (name !== "sui" && name !== "solana") {
    throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported rail: ${name}`);
  }
  return rails[chain ?? name];
}

/** Value for PayoutIntent.chain: "mock" when the mock rail settles, else the recipient's chain. */
export function settledChain(name: string, chain: Chain): Chain | "mock" {
  return isMock(name) ? "mock" : chain;
}
