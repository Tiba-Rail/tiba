export interface PayoutRequest {
  recipientAddress: string;
  amountMicros: bigint;
  intentId: string;
  coinType?: string;
  /**
   * Called with the transaction id after signing and before broadcast, so the caller can store
   * it first. If it throws, the rail must not broadcast.
   */
  onSigned?: (signature: string) => Promise<void> | void;
}

/**
 * What a rail failure proves about the money.
 * - "not_sent": nothing was broadcast (bad key, bad address, RPC unreachable before sending).
 * - "rejected": the chain itself reported the transaction failed or its blockhash expired unseen.
 * - "unknown": a broadcast may have happened and the outcome is not known (timeout, RPC split,
 *   send threw). Callers must treat the transfer as possibly landed.
 */
export type PayoutOutcome = "not_sent" | "rejected" | "unknown";

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
  | "RECIPIENT_NEEDS_TEMPO_ADDRESS"
  | "SOLANA_NETWORK_NOT_DEVNET"
  | "SOLANA_PRIVATE_KEY_MISSING"
  | "SOLANA_ADDRESS_MISMATCH"
  | "SOLANA_RPC_QUORUM_FAILED"
  | "SOLANA_EXECUTION_FAILED"
  | "TEMPO_NETWORK_NOT_MODERATO"
  | "TEMPO_TREASURY_KEY_MISSING"
  | "TEMPO_ADDRESS_MISMATCH"
  | "TEMPO_EXECUTION_FAILED"
  | "ZCASH_NETWORK_NOT_TESTNET"
  | "ZCASH_EXECUTION_FAILED";

export class PayoutRailError extends Error {
  readonly code: PayoutRailErrorCode;
  /** Defaults to "unknown": a rail that has not said otherwise may have moved the money. */
  readonly outcome: PayoutOutcome;

  constructor(code: PayoutRailErrorCode, message: string, options?: { cause?: unknown; outcome?: PayoutOutcome }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PayoutRailError";
    this.code = code;
    this.outcome = options?.outcome ?? "unknown";
  }
}

export function isPayoutRailError(error: unknown): error is PayoutRailError {
  return error instanceof PayoutRailError;
}

/** Re-label an error thrown before any broadcast so callers know nothing was sent. */
export function notSent(error: unknown, fallbackCode: PayoutRailErrorCode): PayoutRailError {
  if (isPayoutRailError(error)) {
    return new PayoutRailError(error.code, error.message, { cause: error.cause, outcome: "not_sent" });
  }
  return new PayoutRailError(fallbackCode, "Settlement failed before anything was sent.", { cause: error, outcome: "not_sent" });
}

/**
 * True only when the rail has proven the transfer did not and cannot happen. Everything else,
 * including plain Errors, is treated as "the money may have moved".
 */
export function settlementProvenFailed(error: unknown): boolean {
  return isPayoutRailError(error) && (error.outcome === "not_sent" || error.outcome === "rejected");
}

export type Chain = "solana" | "tempo";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Live settlement chain for this deployment. Unset means Solana, so existing payouts stay put. */
export function configuredRail(): "solana" | "tempo" {
  const rail = (process.env.RAIL ?? "solana").trim().toLowerCase();
  if (rail === "" || rail === "solana") return "solana";
  if (rail === "tempo") return "tempo";
  throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported RAIL: ${process.env.RAIL}`);
}

/**
 * Where this payout can be sent. A blank or wrong-chain address is refused before evaluation or debit.
 * Tempo reads the same saved address field, and it must be an Ethereum address.
 */
export function chainForRecipient(recipient: { solanaAddress: string | null }): { chain: Chain; address: string } | null {
  const address = recipient.solanaAddress?.trim() ?? "";
  if (!address) return null;
  if (configuredRail() === "tempo") {
    if (!EVM_ADDRESS.test(address)) return null;
    return { chain: "tempo", address };
  }
  return { chain: "solana", address };
}

/** Reason when chainForRecipient finds nowhere to send the money. Solana copy stays the default. */
export function recipientAddressReason(): "RECIPIENT_NEEDS_SOLANA_ADDRESS" | "RECIPIENT_NEEDS_TEMPO_ADDRESS" {
  return configuredRail() === "tempo" ? "RECIPIENT_NEEDS_TEMPO_ADDRESS" : "RECIPIENT_NEEDS_SOLANA_ADDRESS";
}

/** Solana devnet is the default settlement chain. */
export function defaultChain(): Chain {
  return configuredRail();
}

/** Execution-failure code for a chain, so a missing digest reports the chain that was tried. */
export function executionFailedCode(chain: Chain): PayoutRailErrorCode {
  return chain === "tempo" ? "TEMPO_EXECUTION_FAILED" : "SOLANA_EXECUTION_FAILED";
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

export type RailName = "mock" | "solana" | "legacy" | "zcash";

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

const tempoRailLoader: PayoutRail = {
  async send(request) {
    const { tempoRail } = await import("./evm.ts");
    return tempoRail.send(request);
  },
  async batch(requests) {
    const { tempoRail } = await import("./evm.ts");
    return tempoRail.batch(requests);
  }
};

const zcashRailLoader: PayoutRail = {
  async send(request) {
    const { zcashRail } = await import("./zcash.ts");
    return zcashRail.send(request);
  },
  async batch(requests) {
    const { zcashRail } = await import("./zcash.ts");
    return zcashRail.batch(requests);
  }
};

export const rails: Record<RailName, PayoutRail> = {
  mock: mockRail(),
  legacy: solanaRailLoader,
  solana: solanaRailLoader,
  zcash: zcashRailLoader
};

function isMock(name: string): boolean {
  return process.env.MOCK_SETTLEMENT === "1" || name === "mock";
}

/**
 * Live agents follow RAIL. Mock stays mock, including when RAIL=tempo, so a practice wallet never moves money.
 * Zcash is selected only when the rail name is "zcash". It does not replace Solana or Tempo.
 */
export function payoutRail(name: string, chain?: Chain): PayoutRail {
  if (isMock(name)) return mockRail();
  if (name === "zcash") return rails.zcash;
  const selected = configuredRail();
  if (selected === "tempo" || chain === "tempo") return tempoRailLoader;
  if (name !== "legacy" && name !== "solana") {
    throw new PayoutRailError("UNSUPPORTED_RAIL", `Unsupported rail: ${name}`);
  }
  return rails.solana;
}

/** Value for PayoutIntent.chain: "mock" when the mock rail settles, else the chain that was asked to pay. */
export function settledChain(name: string, chain: Chain): Chain | "mock" {
  if (isMock(name)) return "mock";
  return configuredRail() === "tempo" ? "tempo" : chain;
}
