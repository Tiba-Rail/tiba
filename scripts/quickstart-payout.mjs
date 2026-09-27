#!/usr/bin/env node
// Solana devnet USDC only. Prints "<status> <receipt url>".
import { pathToFileURL } from "node:url";
export function payoutIntentRequest(env = process.env) {
  const base = String(env.TIBA_BASE ?? "https://tiba.rizqey.com").replace(/\/$/, "");
  const key = env.TIBA_AGENT_KEY, recipient = env.TIBA_RECIPIENT_REF, workOrder = env.TIBA_WORK_ORDER_REF;
  if (!key || !recipient || !workOrder) throw new Error("Set TIBA_AGENT_KEY, TIBA_RECIPIENT_REF, and TIBA_WORK_ORDER_REF.");
  const body = {
    idempotency_key: env.TIBA_IDEMPOTENCY_KEY ?? `quickstart-${Date.now()}`,
    recipient_ref: recipient,
    artifact: `DELIVERY NOTE\nWork order: ${workOrder}\nDelivered: first invoice, accepted.\nAmount due: 5.00 USDC\nSigned: onboarding`
  };
  return { url: `${base}/api/v1/intents`, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const call = payoutIntentRequest();
  const response = await fetch(call.url, { method: call.method, headers: call.headers, body: call.body });
  const payload = await response.json();
  const origin = call.url.replace(/\/api\/v1\/intents$/, "");
  console.log(payload.public_token ? `${payload.status} ${origin}/r/${payload.public_token}` : JSON.stringify(payload));
  if (!response.ok) process.exitCode = 1;
}
