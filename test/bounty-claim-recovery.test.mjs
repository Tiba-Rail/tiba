import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bountyStatusAfter } from "../src/lib/bounty-claim-gate.ts";

const script = readFileSync(new URL("../scripts/recover-stuck-bounty-claims.mjs", import.meta.url), "utf8");

test("job #379's third stuck-forever gap (gap 5) has a real write-back now", () => {
  // submitBountyClaim's lock only ever fires from status "open", so nothing else can ever
  // submit against a bounty stuck at "paying" -- and nothing anywhere reopened one, confirmed
  // in job #379's review. This script is that reopen, gated on the same idempotency key
  // processPayoutIntent itself used, never a guess.
  assert.match(script, /where: \{ status: "paying", updatedAt: \{ lt: since \} \}/);
  assert.match(script, /idempotencyKey: `bounty-claim:\$\{claim\.id\}`/);
});

test("recovery reuses bountyStatusAfter directly -- it can never drift from what submitBountyClaim itself would have set", () => {
  const importLine = script.indexOf('import { bountyStatusAfter } from "../src/lib/bounty-claim-gate.ts";');
  const called = script.indexOf("const status = bountyStatusAfter(intent);");
  assert.ok(importLine > 0 && called > importLine, "must import and call the real function, not reimplement its rules");
});

test("no intent ever created for the stuck claim -> reopened, since nothing could have moved", () => {
  const noIntent = script.indexOf("if (!intent) {");
  const reopen = script.indexOf('data: { status: "open" }', noIntent);
  assert.ok(noIntent > 0 && reopen > noIntent);
});

test("an intent that's itself still unresolved leaves the bounty exactly as it is, not reopened early", () => {
  // bountyStatusAfter returns "paying" for an intent that is itself still processing (e.g. one
  // of gaps 3/4's own still-pending states) -- this must NOT be treated as "nothing happened".
  const stillPaying = script.indexOf('if (status === "paying") {');
  const leftAsIs = script.indexOf("still unresolved -- left as is", stillPaying);
  assert.ok(stillPaying > 0 && leftAsIs > stillPaying && leftAsIs < stillPaying + 200);
  // Confirmed directly against the real function: a processing/AMBER intent (any reasonCode
  // gaps 3 or 4 might leave it at) really does still read as "paying".
  assert.equal(bountyStatusAfter({ status: "processing", decisionClass: "AMBER", reasonCode: "SETTLEMENT_PENDING" }), "paying");
  assert.equal(bountyStatusAfter({ status: "processing", decisionClass: "AMBER", reasonCode: "X402_SIGNING" }), "paying");
});

test("a bounty stuck 'paying' with no unresolved claim at all is left for a human, not guessed at", () => {
  const noClaim = script.indexOf("if (inFlight.length === 0) {");
  const needsLook = script.indexOf("needs a human look", noClaim);
  assert.ok(noClaim > 0 && needsLook > noClaim);
});
