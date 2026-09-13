import { microsToUsdc } from "@/lib/money";

export type Chain = "solana";
export const defaultPublicChain: Chain = "solana";

export function chainName(_chain: Chain): string {
  return "Solana";
}

// Payout records pre-dating the Solana rail either explicitly say "sui" or have
// no chain value. This is receipt display only: neither value can reach a rail.
export function receiptNetwork(chain: string | null): string {
  if (chain === "solana") return "Solana devnet";
  if (chain === "sui" || chain === null) return "Sui testnet";
  return "Test network";
}

export function explorerTxUrl(_chain: Chain, id: string): string {
  return `https://explorer.solana.com/tx/${id}?cluster=devnet`;
}

// Shape check only; the server confirms with new PublicKey().
export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function formatDollars(micros: bigint): string {
  const value = microsToUsdc(micros).replace(" USDC", "");
  return `$${value}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
