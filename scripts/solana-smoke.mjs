import { randomUUID } from "node:crypto";
import "dotenv/config";

const { solanaRail } = await import("../src/lib/rails/solana.ts");

// Usage: npm run solana:smoke -- <recipient address>   (defaults to the treasury itself)
const recipientAddress = process.argv[2] ?? process.env.SOLANA_SMOKE_RECIPIENT_ADDRESS ?? process.env.SOLANA_ADDRESS;
if (!recipientAddress) {
  throw new Error("Pass a recipient address, or set SOLANA_SMOKE_RECIPIENT_ADDRESS or SOLANA_ADDRESS.");
}

const amountMicros = BigInt(process.env.SOLANA_SMOKE_AMOUNT_MICROS ?? "10000"); // 0.01 USDC
const intentId = `solana-smoke-${randomUUID()}`;
const receipt = await solanaRail.send({ recipientAddress, amountMicros, intentId });

console.log(JSON.stringify({
  network: process.env.SOLANA_NETWORK,
  mint: process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  amount_micros: amountMicros.toString(),
  recipient_address: recipientAddress,
  memo: `Tiba payout ${intentId}`,
  signature: receipt.digest,
  explorer_url: receipt.explorerUrl
}, null, 2));
