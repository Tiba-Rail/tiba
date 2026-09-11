import { microsToUsdc } from "@/lib/money";

export type Chain = "sui" | "solana";

// Anything that is not "solana" reads as Sui: old intents have chain null, mock rows say "mock".
export function chainOf(value: string | null | undefined): Chain {
  return value === "solana" ? "solana" : "sui";
}

// Default chain for new recipients, new workspaces and the fund page. Never decides where an
// existing recipient is paid: that follows the recipient's saved address.
export const defaultPublicChain: Chain = chainOf(process.env.NEXT_PUBLIC_SETTLEMENT_CHAIN);

export function chainName(chain: Chain): string {
  return chain === "solana" ? "Solana" : "Sui";
}

export function explorerTxUrl(chain: Chain, id: string): string {
  return chain === "solana"
    ? `https://explorer.solana.com/tx/${id}?cluster=devnet`
    : `https://suiscan.xyz/testnet/tx/${id}`;
}

export function isSuiAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());
}

// Shape check only; the server confirms with new PublicKey().
export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function formatDollars(micros: bigint): string {
  const value = microsToUsdc(micros).replace(" USDC", "");
  return `$${value}`;
}

// Works for both a 0x Sui address and a base58 Solana address.
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function suiToMist(sui: string): bigint | null {
  const trimmed = sui.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const mist = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  return mist;
}
