// Tiba x Terminal 3 -- live demo. `npm run t3:demo`
//
// Everything here runs against the real Terminal 3 testnet, every run:
//   - human auth (WASM handshake + Ethereum signature)
//   - org + org-owned agent provisioning
//   - a one-function, one-hour delegation grant
//   - proof of that grant evaluated AS THE AGENT, with its own opaque api key:
//     one call it is allowed to make and one it is not
//   - Tiba's own Terminal3IdentityProvider (src/lib/identity-terminal3.ts),
//     the same class the /api/v1/recipients/:ref/verify route uses in production,
//     driving a real pay-or-refuse decision on a recipient from Tiba's database
//   - the append-only activity log Terminal 3 recorded for the org
//
// The one thing that is not real: the recipient's identity is Faris's own DID.
// `tee:user::kyc-status` is self-only on Terminal 3, and there is no second live
// account to point it at. See README, "Terminal 3 identity".
import fs from "node:fs";
import "dotenv/config";
import {
  T3nClient, loadWasmComponent, createEthAuthInput, eth_get_address,
  metamask_sign, fetchTrustedManifest, NODE_URLS, discoverCheckDelegation,
} from "@terminal3/t3n-sdk";

const STATE_FILE = new URL("./.t3-agent-state.json", import.meta.url);
const baseUrl = process.env.T3_NODE_URL || NODE_URLS.testnet;

let step = 0;
const say = (s) => console.log(`\n[${++step}] ${s}`);
const line = (s = "") => console.log(s);

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const pk = process.env.T3_API_KEY;
if (!pk) throw new Error("T3_API_KEY is not set. It is the account private key; keep it in .env, never in git.");

// ---------------------------------------------------------------------------
say("Authenticating as the operator (WASM handshake + Ethereum signature)");
const address = eth_get_address(pk);
const client = new T3nClient({
  baseUrl,
  trustAnchor: await fetchTrustedManifest("testnet", { baseUrl }),
  wasmComponent: await loadWasmComponent(),
  handlers: { EthSign: metamask_sign(address, undefined, pk) },
});
await client.handshake();
// authenticate() / createOrganisation() / createAgent() return a Did object
// ({value, toString()}), not a string. Coerce with String() or the wire request
// nests it as a map and the node 400s: "parse input: invalid type: map, expected a string".
const ownerDid = String(await client.authenticate(createEthAuthInput(address)));
line(`    authenticated as ${ownerDid}`);

// ---------------------------------------------------------------------------
say("Getting Tiba a payment agent on Terminal 3 (org + org-owned agent)");
let state = loadState();
if (state?.orgDid && state?.agentDid && state?.apiKey) {
  line(`    reusing the org and agent an earlier run created:`);
  line(`    org:   ${state.orgDid}`);
  line(`    agent: ${state.agentDid}`);
} else {
  let orgDid = state?.orgDid;
  if (!orgDid) {
    orgDid = String(await client.createOrganisation("Tiba Payments"));
    line(`    createOrganisation("Tiba Payments") -> ${orgDid}`);
    saveState((state = { orgDid })); // keep the org DID even if agent creation below fails
  } else {
    line(`    reusing the org from an earlier run: ${orgDid}`);
  }
  const created = await client.createAgent(orgDid, "tiba-payment-agent", { defaultCard: false });
  line(`    createAgent(org, "tiba-payment-agent") -> ${String(created.agentDid)}`);
  line(`    one-time apiKey captured. It is written to scripts/.t3-agent-state.json, which is gitignored.`);
  saveState((state = { orgDid, agentDid: String(created.agentDid), apiKey: created.apiKey }));
}
const { orgDid, agentDid, apiKey } = state;

// getActivityLog's scope resolves to "every org the caller belongs to" and refuses
// once that is more than one. A crashed run can leave a second, agent-less org behind.
for (const stray of (await client.myOrgs()).map(String).filter((o) => o !== orgDid)) {
  try {
    await client.deleteOrganisation(stray);
    line(`    removed a stray empty org left by an earlier crashed run: ${stray}`);
  } catch (e) {
    line(`    left stray org ${stray} in place (${e.message})`);
  }
}

// ---------------------------------------------------------------------------
say("Granting the agent EXACTLY one function, for one hour: kyc-status on tee:user/contracts");
const now = Math.floor(Date.now() / 1000);
const grant = {
  grantee: agentDid,
  contract_id: "tee:user/contracts",
  functions: ["kyc-status"],
  scopes: [], read_scopes: [], allowed_hosts: [],
  window: { valid_from_secs: now, valid_until_secs: now + 3600 },
};
await client.updateMemberDelegation(grant);
line(`    committed. The agent may call ${JSON.stringify(grant.functions)} and nothing else, for 1h.`);

// ---------------------------------------------------------------------------
say("Proving the grant -- asked AS THE AGENT, with its own api key, not the owner session");
const allowed = await discoverCheckDelegation({ baseUrl, apiKey },
  { contract: "tee:user/contracts", pii_did: ownerDid, functions: ["kyc-status"], scopes: [] });
const denied = await discoverCheckDelegation({ baseUrl, apiKey },
  { contract: "tee:user/contracts", pii_did: ownerDid, functions: ["otp-request"], scopes: [] }); // never granted
line(`    "can I call kyc-status?"  -> authorised: ${allowed.authorised}`);
line(`    "can I call otp-request?" -> authorised: ${denied.authorised}`);
line(`    Same key, same contract, two different answers. Terminal 3 enforces the scope, not Tiba.`);

// ---------------------------------------------------------------------------
say("Running Tiba's own identity provider against a recipient from Tiba's payout queue");
let recipient = null;
try {
  const { prisma } = await import("../src/lib/db.ts");
  recipient = await prisma.recipient.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
} catch (e) {
  line(`    (database not reachable: ${e.message.split("\n")[0]})`);
}
if (!recipient) {
  recipient = { ref: "TIBA-0091", displayName: "Ali Hassan (contractor invoice)", suiAddress: "0x0", t3nDid: null };
  line(`    no recipient in the database, using a stand-in so the decision path still runs`);
}
// tee:user::kyc-status is self-only, so the only live identity this sandbox can be
// asked about is the operator's own. That DID stands in for "a recipient who did
// their own Terminal 3 KYC and delegated Tiba the right to check it".
const t3nDid = recipient.t3nDid ?? ownerDid;
line(`    recipient: ${recipient.displayName}  (ref ${recipient.ref})`);
line(`    terminal 3 identity used for the check: ${t3nDid}${recipient.t3nDid ? "" : "  <- stand-in, see README"}`);

const { Terminal3IdentityProvider } = await import("../src/lib/identity-terminal3.ts");
const provider = new Terminal3IdentityProvider(apiKey, baseUrl, 3600);
const verdict = await provider.verify({
  recipientRef: recipient.ref, displayName: recipient.displayName,
  suiAddress: recipient.suiAddress, t3nDid,
});
line(`    provider "${provider.name}" returned: ${JSON.stringify(verdict)}`);

// ---------------------------------------------------------------------------
say("The same provider, on a recipient who never delegated anything to Tiba");
// A DID that exists in the right shape but has granted this agent nothing. Terminal 3
// answers for it, and the answer is no. This is the case that has to refuse, because
// it is the one an attacker would want to pass.
const strangerDid = "did:t3n:0000000000000000000000000000000000000000";
const strangerVerdict = await provider.verify({
  recipientRef: "unknown-payee", displayName: "Unlinked payee", suiAddress: "0x0", t3nDid: strangerDid,
});
line(`    ${strangerDid}`);
line(`    provider returned: ${JSON.stringify(strangerVerdict)}`);
const noIdentity = await provider.verify({
  recipientRef: "no-identity", displayName: "Payee with no Terminal 3 identity", suiAddress: "0x0", t3nDid: null,
});
line(`    a payee with no Terminal 3 identity at all: ${JSON.stringify(noIdentity)}`);

// ---------------------------------------------------------------------------
say("Tiba decides: pay only on a live verified answer, refuse on anything else");
const pay = verdict.decision === "verified";
line(`    ${recipient.displayName.padEnd(34)} -> ${pay ? "PAY" : "REFUSE"}`);
line(`    ${"Unlinked payee".padEnd(34)} -> ${strangerVerdict.decision === "verified" ? "PAY" : "REFUSE"}`);
line(`    ${"Payee with no T3 identity".padEnd(34)} -> ${noIdentity.decision === "verified" ? "PAY" : "REFUSE"}`);
line(`    Same code, same agent key, three recipients. Terminal 3 decides which one gets paid.`);

// ---------------------------------------------------------------------------
say("Pulling the org's audit trail back from Terminal 3 -- hash-stamped and append-only");
const agentLog = await client.getActivityLog({ did: agentDid, limit: 10 });
line(`    entries attributed to the agent DID itself: ${agentLog.entries.length}`);
line(`    (expected zero: a delegation check is a read, and this agent has no z: contract to`);
line(`     dispatch through invoke(). Nothing it has DONE yet, only what it is AUTHORIZED to do.)`);
const orgLog = await client.getActivityLog({ limit: 8 });
line(`    last ${orgLog.entries.length} entries for this org, newest first -- this run, on the ledger:`);
for (const e of orgLog.entries) {
  line(`      seq ${e.seq_no}  ${e.caller_type.padEnd(6)} ${e.contract}::${e.function}  -> ${e.outcome}  hash ${e.hash.slice(0, 12)}...`);
}

// ---------------------------------------------------------------------------
line();
line("=".repeat(74));
line(`Tiba receipt: ${pay ? "PAY" : "REFUSE"} ${recipient.displayName} (${recipient.ref})`);
line(`Org:   ${orgDid}`);
line(`Agent: ${agentDid}`);
line();
line("To make the running app use this, set these two and redeploy:");
line("  IDENTITY_PROVIDER=terminal3");
line("  T3_AGENT_API_KEY=<the apiKey in scripts/.t3-agent-state.json>");
line("The account private key is NOT one of them. The server never needs it.");
line("=".repeat(74));
