import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  X402_SIGNING,
  X402_SIGNING_CLAIMED,
  expectedSignatureFromReasonCode,
  x402SigningReasonCode
} from "../src/lib/x402/signing-recovery.ts";

const buyerSource = readFileSync(new URL("../src/lib/x402/buyer.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");
const recoverScript = readFileSync(new URL("../scripts/recover-stuck-x402-signing.mjs", import.meta.url), "utf8");

test("a claimed-but-unsigned intent carries no proof material", () => {
  assert.equal(expectedSignatureFromReasonCode(X402_SIGNING_CLAIMED), null);
  assert.equal(expectedSignatureFromReasonCode(null), null);
  assert.equal(expectedSignatureFromReasonCode("SOMETHING_ELSE"), null);
});

test("a signed intent's reasonCode round-trips the signature exactly", () => {
  const encoded = x402SigningReasonCode("5nR7f...fakeSig...9zQ");
  assert.equal(encoded.startsWith(X402_SIGNING), true, "still recognizably an X402_SIGNING state");
  assert.equal(expectedSignatureFromReasonCode(encoded), "5nR7f...fakeSig...9zQ");
});

test(
  "job #379's stuck-forever gap (gap 3) is closed: a signature is persisted before the seller round-trip, not only after it",
  () => {
    // Without this, a crash between signPayment succeeding and the retry fetch completing left
    // reasonCode at bare X402_SIGNING forever, with nothing anywhere to tell "never signed, safe
    // to fail" apart from "signed, maybe sent, needs an on-chain check" (REVIEW_PR31.md).
    const expectedSig = buyerSource.indexOf("const expectedSignature = deps.treasurySignature(transaction);");
    const recordSigned = buyerSource.indexOf("await deps.recordSigned(intent.id, expectedSignature);", expectedSig);
    const retryFetch = buyerSource.indexOf("second = await deps.fetch(input.url, retryInit);");
    assert.ok(expectedSig > 0, "the signature must be derived right after signing");
    assert.ok(recordSigned > expectedSig, "recordSigned must be called once the signature exists");
    assert.ok(recordSigned < retryFetch, "and before the round-trip that could crash mid-flight");
  }
);

test("recordSigned is scoped exactly like the claim it follows, and only overwrites the bare claimed state", () => {
  const recordSigned = routeSource.indexOf("recordSigned: async (intentId, expectedSignature) => {");
  const nextDep = routeSource.indexOf("treasurySignature: (transaction) =>", recordSigned);
  assert.ok(recordSigned > 0 && nextDep > recordSigned);
  const block = routeSource.slice(recordSigned, nextDep);
  assert.match(block, /x402Routed: true, status: "processing", reasonCode: X402_SIGNING_CLAIMED/);
  assert.match(block, /data: \{ reasonCode: x402SigningReasonCode\(expectedSignature\) \}/);
});

test("the recovery script tells 'never signed' apart from 'signed, needs proof' and never guesses PAID without an on-chain match", () => {
  assert.match(recoverScript, /reasonCode: \{ startsWith: X402_SIGNING_CLAIMED \}/, "must catch both the bare and signed shapes");
  const neverSigned = recoverScript.indexOf("if (!expectedSignature) {");
  const failedWrite = recoverScript.indexOf('reasonCode: "SETTLEMENT_FAILED"', neverSigned);
  assert.ok(neverSigned > 0 && failedWrite > neverSigned, "an intent with no signature is the only one ever marked failed");

  const provenCheck = recoverScript.indexOf("x402SettlementProven(digest, expectedSignature, readSolanaTransaction)");
  const provenWrite = recoverScript.indexOf('decisionClass: "PAID"', provenCheck);
  const notProven = recoverScript.indexOf("if (!proven) {");
  assert.ok(provenCheck > 0, "must run the same, already-tested proof function -- never invent a new one");
  assert.ok(provenWrite > provenCheck, "PAID is only written once that function returns true");
  assert.ok(notProven > 0 && notProven < provenWrite, "an unproven signed intent is left alone, not guessed at either way");
});
