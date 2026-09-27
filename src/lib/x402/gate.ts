import { settledChain } from "../rails/index.ts";

/** Returned (as a 403) when a workspace that does not settle on Solana devnet calls the x402 buyer. */
export const X402_NEEDS_LIVE_WALLET = "X402_NEEDS_LIVE_WALLET";

/**
 * The x402 buyer signs Solana devnet USDC out of the shared treasury. Only a workspace whose own
 * payments settle on Solana may use it: a practice (mock) wallet, any wallet while
 * MOCK_SETTLEMENT=1, and every wallet when RAIL=tempo are refused before anything is fetched.
 */
export function x402RailRefusal(rail: string): string | null {
  return settledChain(rail, "solana") === "solana" ? null : X402_NEEDS_LIVE_WALLET;
}
