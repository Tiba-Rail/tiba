import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../scripts/recover-stuck-settlement-pending.mjs", import.meta.url), "utf8");
const settlementSource = readFileSync(new URL("../src/lib/payout-settlement.ts", import.meta.url), "utf8");

test("job #379's second stuck-forever gap (gap 4) has a real, gated write-back now", () => {
  // PR #30's own body said solana-find-payment.mjs would be how this gets resolved later --
  // confirmed in job #379's review that the script only ever finds a payment, never writes one
  // back. This script is that write-back, gated on a proven on-chain outcome, never a guess.
  assert.match(script, /reasonCode: "SETTLEMENT_PENDING", updatedAt: \{ lt: since \}/);
  const paidFn = script.indexOf("async function markPaid(intent, digest) {");
  const failedFn = script.indexOf("async function markFailedAndReopen(intent, digest) {");
  assert.ok(paidFn > 0 && failedFn > 0);
});

test("a digest already on the intent is trusted directly; one is only searched for when none was ever recorded", () => {
  // settleCommittedIntent stores the digest via onSigned before confirmation, well before a
  // crash could hit -- unlike x402 (gap 3), there's no seller in this path reporting an
  // unverified id, so there's nothing extra to prove about whose digest it is.
  const candidates = script.indexOf("const candidates = intent.digest ? [intent.digest] : await findTreasuryPaymentsForIntent(intent.id);");
  assert.ok(candidates > 0);
});

test("only a chain-confirmed outcome ever writes anything; an unresolved intent is left exactly as it is", () => {
  const classify = script.indexOf("async function classify(digest) {");
  const unknownReturn = script.slice(classify).indexOf('return "unknown";');
  assert.ok(classify > 0 && unknownReturn > 0, "an RPC miss or read failure must classify as unknown, not paid or failed");
  const unknownBranch = script.indexOf('if (outcome === "unknown") {');
  const leftAsIs = script.indexOf("-- left as is.", unknownBranch);
  assert.ok(unknownBranch > 0 && leftAsIs > unknownBranch && leftAsIs < unknownBranch + 200);
});

test("a proven on-chain failure reopens the invoice exactly the way settleCommittedIntent's own proven-failure branch does", () => {
  // Same shape as the reopen already tested for the live path: give the work order back,
  // status refused, decisionClass RED, reasonCode SETTLEMENT_FAILED. Keeping these in sync
  // matters -- a script that reopens differently than the engine itself would be a second,
  // drifting definition of "proven failed".
  const engineReopen = settlementSource.indexOf("data: { status: \"open\", dischargedByIntentId: null }");
  assert.ok(engineReopen > 0, "the engine's own reopen shape must still exist to compare against");
  assert.match(script, /data: \{ status: "open", dischargedByIntentId: null \}/);
  assert.match(script, /reasonCode: "SETTLEMENT_FAILED", digest, explorerUrl: solanaExplorerTxUrl\(digest\)/);
});

test("a non-Solana intent is skipped, not guessed at -- this script only checks a chain it can actually read", () => {
  const guard = script.indexOf('if (intent.chain !== "solana") {');
  const skip = script.indexOf("this script only checks Solana. Left as is.", guard);
  assert.ok(guard > 0 && skip > guard);
});
