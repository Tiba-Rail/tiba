import { microsToUsdc } from "./money.ts";

// Payout records pre-dating the Solana rail explicitly say "sui" -- that is a real
// legacy signal. A null chain means no settlement was attempted at all (an early
// refusal, gate refusal, or sandbox try): it never touched any chain, Sui included.
// This is receipt display only: none of these values can reach a rail.
export function receiptNetwork(chain: string | null): string {
  if (chain === "solana") return "Solana devnet";
  if (chain === "tempo") return "Tempo testnet";
  if (chain === "zcash") return "Zcash testnet";
  if (chain === "mock") return "Simulated, no transfer";
  if (chain === "sandbox") return "Sandbox try, nothing sent";
  if (chain === "sui") return "Sui testnet";
  if (chain === null) return "No transfer attempted";
  return "Test network";
}

/** Shielded Zcash receipts do not make the memo public. The auditor gets the key on request. */
export function receiptViewingKeyNote(chain: string | null): string | null {
  if (chain === "zcash") return "viewing key available on request";
  return null;
}

/** The coin actually paid out. Every rail settles in its own coin, not USDC:
 *  Tempo test payments are pathUSD, Zcash test payments are TAZ. Solana (and every
 *  chain-less case: not yet settled, simulated, or a legacy row) stays USDC. */
export function coinSymbol(chain: string | null): string {
  if (chain === "tempo") return "pathUSD";
  if (chain === "zcash") return "TAZ";
  return "USDC";
}

/** microsToUsdc's digits, in the coin the chain actually settles in. */
export function microsToCoin(micros: bigint | number | string, chain: string | null): string {
  return `${microsToUsdc(micros).replace(/ USDC$/, "")} ${coinSymbol(chain)}`;
}
