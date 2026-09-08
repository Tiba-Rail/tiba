// Re-issue the kyc-status delegation so the recipient row stays verifiable.
//
//   node scripts/t3-regrant.mjs [days]        default 30
//
// WHY THIS EXISTS. `npm run t3:demo` grants the agent one function for ONE HOUR,
// which is the right thing for a demo and the wrong thing for a row sitting in the
// database. An hour after the demo, `POST /api/v1/recipients/creator-lagos/verify`
// starts returning "failed" and it looks like the identity wiring broke. It did not;
// the grant lapsed. This re-issues it with a window long enough to survive judging,
// and then proves the grant from the agent's side before exiting.
//
// It reuses the org and agent in scripts/.t3-agent-state.json and never creates one,
// so it cannot leave a stray org behind the way the demo can.
import fs from "node:fs";
import "dotenv/config";
import {
  T3nClient, loadWasmComponent, createEthAuthInput, eth_get_address,
  metamask_sign, fetchTrustedManifest, NODE_URLS, discoverCheckDelegation,
} from "@terminal3/t3n-sdk";

const DAYS = Number(process.argv[2]) || 30;
const STATE_FILE = new URL("./.t3-agent-state.json", import.meta.url);
const baseUrl = process.env.T3_NODE_URL || NODE_URLS.testnet;

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
if (!state?.agentDid || !state?.apiKey) {
  throw new Error("scripts/.t3-agent-state.json has no agent. Run `npm run t3:demo` once first.");
}

const pk = process.env.T3_API_KEY;
if (!pk) throw new Error("T3_API_KEY is not set. It is the account private key; .env only, never git.");

const address = eth_get_address(pk);
const client = new T3nClient({
  baseUrl,
  trustAnchor: await fetchTrustedManifest("testnet", { baseUrl }),
  wasmComponent: await loadWasmComponent(),
  handlers: { EthSign: metamask_sign(address, undefined, pk) },
});
await client.handshake();
const ownerDid = String(await client.authenticate(createEthAuthInput(address)));
console.log("owner   " + ownerDid);
console.log("agent   " + state.agentDid);

const now = Math.floor(Date.now() / 1000);
const until = now + DAYS * 86400;
await client.updateMemberDelegation({
  grantee: state.agentDid,
  contract_id: "tee:user/contracts",
  functions: ["kyc-status"],
  scopes: [], read_scopes: [], allowed_hosts: [],
  window: { valid_from_secs: now, valid_until_secs: until },
});
console.log(`granted kyc-status until ${new Date(until * 1000).toISOString()} (${DAYS} days)`);

// Prove it from the agent's side, with its own opaque key, not the owner session.
const allowed = await discoverCheckDelegation(
  { baseUrl, apiKey: state.apiKey },
  { contract: "tee:user/contracts", pii_did: ownerDid, functions: ["kyc-status"], scopes: [] },
);
const denied = await discoverCheckDelegation(
  { baseUrl, apiKey: state.apiKey },
  { contract: "tee:user/contracts", pii_did: ownerDid, functions: ["otp-request"], scopes: [] },
);
console.log("as the agent, kyc-status  -> authorised:", allowed.authorised);
console.log("as the agent, otp-request -> authorised:", denied.authorised, "(never granted)");

if (!allowed.authorised || denied.authorised) {
  throw new Error("ABORT: the grant did not take, or the scope is wider than one function.");
}
console.log("\nOK. Recipients carrying " + ownerDid + " now verify through the app API.");
