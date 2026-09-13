import { microsToUsdc } from "@/lib/money";

export type Chain = "solana";
export const defaultPublicChain: Chain = "solana";

export function chainName(_chain: Chain): string {
  return "Solana";
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
