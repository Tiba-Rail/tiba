import { randomUUID } from "node:crypto";
import "dotenv/config";

const { suiRail } = await import("../src/lib/rails/sui.ts");

const recipientAddress = process.env.SUI_SMOKE_RECIPIENT_ADDRESS ?? process.env.SUI_ADDRESS;
if (!recipientAddress) {
  throw new Error("SUI_ADDRESS or SUI_SMOKE_RECIPIENT_ADDRESS is required.");
}

const amountMicros = BigInt(process.env.SUI_SMOKE_AMOUNT_MIST ?? "1000000");
const receipt = await suiRail.send({
  recipientAddress,
  amountMicros,
  intentId: `sui-smoke-${randomUUID()}`
});

console.log(JSON.stringify({
  network: process.env.SUI_NETWORK,
  coin_type: process.env.SUI_USDC_TYPE || "0x2::sui::SUI",
  amount_mist: amountMicros.toString(),
  recipient_address: recipientAddress,
  digest: receipt.digest,
  explorer_url: receipt.explorerUrl
}, null, 2));
