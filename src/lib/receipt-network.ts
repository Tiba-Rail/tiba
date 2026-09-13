// Payout records pre-dating the Solana rail either explicitly say "sui" or have
// no chain value. This is receipt display only: neither value can reach a rail.
export function receiptNetwork(chain: string | null): string {
  if (chain === "solana") return "Solana devnet";
  if (chain === "sui" || chain === null) return "Sui testnet";
  return "Test network";
}
