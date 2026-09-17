import { SOLANA_USDC_DEVNET_MINT } from "../rails/solana.ts";
import type { PaymentRequirements } from "./types.ts";

/** Solana devnet genesis hash, CAIP-2. */
export const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export function heldUsdcMint(): string {
  return process.env.SOLANA_USDC_MINT?.trim() || SOLANA_USDC_DEVNET_MINT;
}

export function isSolanaDevnetNetwork(network: string): boolean {
  const value = network.trim();
  if (!value.startsWith("solana:")) return false;
  if (value === SOLANA_MAINNET_CAIP2) return false;
  if (value === SOLANA_DEVNET_CAIP2) return true;
  if (value === "solana:devnet") return true;
  return /devnet/i.test(value);
}

function extraFeePayer(extra: Record<string, unknown> | undefined): string | null {
  const feePayer = extra?.feePayer;
  return typeof feePayer === "string" && feePayer.trim() ? feePayer.trim() : null;
}

/**
 * First `accepts[]` entry Tiba can actually pay: exact scheme, Solana devnet, the USDC mint
 * we already hold, and a facilitator fee-payer for the SVM exact layout.
 */
export function pickSolanaUsdcAccept(accepts: PaymentRequirements[]): PaymentRequirements | null {
  const mint = heldUsdcMint();
  for (const entry of accepts) {
    if (entry.scheme !== "exact") continue;
    if (!isSolanaDevnetNetwork(entry.network)) continue;
    if (entry.asset !== mint) continue;
    if (!entry.payTo?.trim()) continue;
    if (typeof entry.amount !== "string" || !/^[1-9]\d*$/.test(entry.amount)) continue;
    if (!extraFeePayer(entry.extra)) continue;
    return entry;
  }
  return null;
}

export function feePayerOf(accepted: PaymentRequirements): string {
  const feePayer = extraFeePayer(accepted.extra);
  if (!feePayer) throw new Error("X402_FEE_PAYER_REQUIRED");
  return feePayer;
}
