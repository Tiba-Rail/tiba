// Read-only: finds the treasury transaction whose memo is "Tiba payout <intentId>".
// Use it when an intent was recorded as SETTLEMENT_FAILED but may have paid on chain.
// Usage: node scripts/solana-find-payment.mjs <intentId>
import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

const intentId = process.argv[2];
if (!intentId) {
  console.error("Usage: node scripts/solana-find-payment.mjs <intentId>");
  process.exit(1);
}
const address = process.env.SOLANA_ADDRESS?.trim();
if (!address) throw new Error("SOLANA_ADDRESS is required.");

const connection = new Connection(process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com", "confirmed");
const needle = `Tiba payout ${intentId}`;
const entries = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 1000 });
const matches = entries.filter((entry) => entry.memo?.includes(needle));

if (matches.length === 0) {
  console.log(`No transaction with memo "${needle}" in the treasury's last ${entries.length} transactions.`);
}
for (const entry of matches) {
  console.log(JSON.stringify({
    signature: entry.signature,
    err: entry.err,
    confirmation_status: entry.confirmationStatus,
    block_time: entry.blockTime,
    explorer_url: `https://explorer.solana.com/tx/${entry.signature}?cluster=devnet`
  }));
}
