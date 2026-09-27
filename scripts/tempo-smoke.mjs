import { randomUUID } from "node:crypto";
import "dotenv/config";

const { tempoRail, TEMPO_PATH_USD } = await import("../src/lib/rails/evm.ts");

// Usage: npm run tempo:smoke -- <recipient address>
// Requires TEMPO_TREASURY_KEY in the environment. This script does not create or store a key.
const recipientAddress = process.argv[2] ?? process.env.TEMPO_SMOKE_RECIPIENT_ADDRESS;
if (!recipientAddress) {
  throw new Error("Pass a recipient address, or set TEMPO_SMOKE_RECIPIENT_ADDRESS.");
}

const amountMicros = BigInt(process.env.TEMPO_SMOKE_AMOUNT_MICROS ?? "10000"); // 0.01 pathUSD
const intentId = `tempo-smoke-${randomUUID()}`;
const receipt = await tempoRail.send({ recipientAddress, amountMicros, intentId });

console.log(JSON.stringify({
  chain_id: process.env.TEMPO_CHAIN_ID || "42431",
  stablecoin: process.env.TEMPO_STABLECOIN_ADDRESS || TEMPO_PATH_USD,
  amount_micros: amountMicros.toString(),
  recipient_address: recipientAddress,
  digest: receipt.digest,
  explorer_url: receipt.explorerUrl
}, null, 2));
