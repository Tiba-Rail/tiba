// Dev tool: register one more cheap both-channel work order for KL Translator on the LIVE
// site, so a demo can be re-run without wiping the ledger (demo:reset clears it).
//   node scripts/register-demo-order.mjs [REF]      default ref: WO-13
import { readFileSync } from "node:fs";

const base = process.env.DEMO_BASE_URL ?? "https://tiba-omega.vercel.app";
const ref = process.argv[2] ?? "WO-13";
const token = (readFileSync(".env", "utf8").match(/^OPERATOR_TOKEN=(.+)$/m) || [])[1]?.trim();
if (!token) throw new Error("OPERATOR_TOKEN missing from .env");

const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const res = await fetch(`${base}/api/v1/work-orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({
    ref,
    recipient_ref: "translator-kl",
    ceiling_usdc: "5",
    expires_at: expiresAt,
    required_channels: "both",
    brief_text: "Translate four product documents; pay exactly 5.00 USDC on an accepted delivery note.",
    payer_record: {
      approved_amount_micros: "5000000",
      delivery_status: "verified_complete",
      source: "operator-upload"
    }
  })
});
console.log(res.status, (await res.text()).slice(0, 300));
