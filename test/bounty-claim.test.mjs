import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { evaluateBeforeDebit } from "../src/lib/policy.ts";
import { reconcile } from "../src/lib/reconcile.ts";
import {
  BOUNTY_SUMMARY_MAX_LENGTH,
  BOUNTY_WORK_LINK_MAX_LENGTH,
  buildBountyPayerRecord,
  buildClaimArtifactText,
  bountyStatusAfter,
  claimTextWithinLimits,
  evaluateClaimGate,
  requiredChannelsForBounty
} from "../src/lib/bounty-claim-gate.ts";

const BOUNTY = { amountMicros: 50_000_000n, allowedClaimers: [] };
const CLOSED_BOUNTY = {
  amountMicros: 50_000_000n,
  allowedClaimers: ["4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"]
};

test("a claim within the bounty amount and open to anyone passes the gate", () => {
  assert.deepEqual(
    evaluateClaimGate(BOUNTY, { amountAskedMicros: 50_000_000n, claimerSolanaAddress: "anyone-at-all" }),
    { ok: true }
  );
});

test("a claim asking more than the bounty pays is refused before any check runs", () => {
  assert.deepEqual(
    evaluateClaimGate(BOUNTY, { amountAskedMicros: 50_000_001n, claimerSolanaAddress: "someone" }),
    { ok: false, reasonCode: "CLAIM_OVER_BOUNTY" }
  );
});

test("asking for exactly the bounty amount is not 'over'", () => {
  assert.deepEqual(
    evaluateClaimGate(BOUNTY, { amountAskedMicros: 50_000_000n, claimerSolanaAddress: "someone" }),
    { ok: true }
  );
});

test("a zero or negative ask is refused as an invalid amount", () => {
  assert.deepEqual(
    evaluateClaimGate(BOUNTY, { amountAskedMicros: 0n, claimerSolanaAddress: "someone" }),
    { ok: false, reasonCode: "INVALID_AMOUNT" }
  );
});

test("a claimer outside the allowlist is refused, even for a valid amount", () => {
  assert.deepEqual(
    evaluateClaimGate(CLOSED_BOUNTY, {
      amountAskedMicros: 10_000_000n,
      claimerSolanaAddress: "not-the-allowed-address"
    }),
    { ok: false, reasonCode: "CLAIMER_NOT_ALLOWED" }
  );
});

test("an allowed claimer on a closed bounty passes the gate", () => {
  assert.deepEqual(
    evaluateClaimGate(CLOSED_BOUNTY, {
      amountAskedMicros: 10_000_000n,
      claimerSolanaAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    }),
    { ok: true }
  );
});

test("an over-amount claim from a disallowed claimer is refused for the amount first", () => {
  // Whichever gate would refuse it, the caller only needs one reason -- amount is checked first.
  assert.deepEqual(
    evaluateClaimGate(CLOSED_BOUNTY, {
      amountAskedMicros: 999_000_000n,
      claimerSolanaAddress: "not-the-allowed-address"
    }),
    { ok: false, reasonCode: "CLAIM_OVER_BOUNTY" }
  );
});

const bountyRecord = { id: "bounty-1", title: "Ship the docs", doneCriteria: "Publish the guide" };

test("the payer record carries the exact keys the payer_record prompt requires", () => {
  const record = buildBountyPayerRecord(bountyRecord, "claim-1", 50_000_000n);
  assert.equal(record.approved_amount_micros, "50000000");
  assert.equal(record.delivery_status, "verified_complete");
  assert.equal(record.bounty_id, "bounty-1");
  assert.equal(record.claim_id, "claim-1");
});

test("the claim artifact text states the amount in USDC for the artifact channel to read", () => {
  const text = buildClaimArtifactText(bountyRecord, {
    workLink: "https://example.com/work",
    summary: "Did the thing.",
    amountAskedMicros: 50_000_000n
  });
  assert.match(text, /Amount requested: 50\.00 USDC/);
  assert.match(text, /https:\/\/example\.com\/work/);
  assert.match(text, /Did the thing\./);
});

// The full decision pipeline a passed-gate claim actually runs through -- reconcile() and
// evaluateBeforeDebit() are the real functions processPayoutIntent calls, exercised here the
// same way test/x402-buyer.test.mjs exercises them: composed directly, without a database.
function claimPipeline({ bountyAmountMicros, claimAmountMicros, workOrderId = "bounty-claim:demo" }) {
  const now = new Date("2026-09-26T00:00:00.000Z");
  const record = buildBountyPayerRecord({ id: "b1", title: "t", doneCriteria: "d" }, "claim-1", claimAmountMicros);
  const payerTuple = {
    workOrderId,
    amountMicros: BigInt(record.approved_amount_micros),
    deliveryTimestamp: now.toISOString()
  };
  const artifactTuple = { workOrderId, amountMicros: claimAmountMicros, deliveryTimestamp: now.toISOString() };
  const reconciled = reconcile("both", { artifact: artifactTuple, payer_record: payerTuple });
  if (!reconciled.ok) return reconciled;
  return evaluateBeforeDebit({
    agent: { id: "a1", ceilingMicros: 10_000_000_000n, hourCapMicros: 10_000_000_000n, dayCapMicros: 10_000_000_000n, hourCountCap: 100, dayCountCap: 100, killSwitch: false },
    workOrder: { id: "wo-1", ceilingMicros: bountyAmountMicros, status: "open", expiresAt: "2027-01-01T00:00:00.000Z" },
    recipientActive: true,
    amountMicros: reconciled.tuple.amountMicros,
    now
  });
}

test("claim -> pay: a claim asking for the bounty amount, both channels agreeing, clears every check", () => {
  const result = claimPipeline({ bountyAmountMicros: 50_000_000n, claimAmountMicros: 50_000_000n });
  assert.deepEqual(result, { ok: true });
});

test("claim -> refuse (over amount): the ceiling check refuses it even if it somehow reached the pipeline", () => {
  // Defense in depth: evaluateClaimGate is meant to catch this first, but the WorkOrder ceiling
  // (set to the bounty amount) refuses it independently if that gate were ever bypassed.
  const result = claimPipeline({ bountyAmountMicros: 50_000_000n, claimAmountMicros: 75_000_000n });
  assert.deepEqual(result, { ok: false, reasonCode: "WORK_ORDER_CEILING" });
});

test("claim -> refuse (not allowed claimer): the gate alone is the check, and it names the reason", () => {
  const result = evaluateClaimGate(
    { amountMicros: 50_000_000n, allowedClaimers: ["only-this-address"] },
    { amountAskedMicros: 40_000_000n, claimerSolanaAddress: "someone-else" }
  );
  assert.deepEqual(result, { ok: false, reasonCode: "CLAIMER_NOT_ALLOWED" });
});

test("an open-bounty claim is held even when both model checks return the same answer", async () => {
  const tuple = {
    workOrderId: "bounty-claim:claim-1",
    amountMicros: 50_000_000n,
    deliveryTimestamp: "2026-09-27T10:00:00.000Z"
  };
  const gonka = async ({ channel }) => ({ channel, tuple });
  const [artifact, payer] = await Promise.all([
    gonka({ channel: "artifact" }),
    gonka({ channel: "payer_record" })
  ]);

  assert.deepEqual(
    reconcile(requiredChannelsForBounty(BOUNTY), {
      artifact: artifact.tuple,
      payer_record: payer.tuple
    }),
    { ok: false, decisionClass: "AMBER", reasonCode: "HUMAN_REVIEW_REQUIRED" }
  );
});

test("a bounty stays locked after uncertain outcomes and only reopens after safe refusals", () => {
  assert.equal(bountyStatusAfter({ status: "settled", reasonCode: null }), "paid");
  assert.equal(bountyStatusAfter({ status: "held", reasonCode: "HUMAN_REVIEW_REQUIRED" }), "paying");
  assert.equal(bountyStatusAfter({ status: "refused", reasonCode: "QUORUM_SPLIT:amount_micros" }), "paying");
  assert.equal(bountyStatusAfter({ status: "refused", reasonCode: "SETTLEMENT_FAILED" }), "paying");
  assert.equal(bountyStatusAfter({ status: "refused", reasonCode: "CLAIM_OVER_BOUNTY" }), "open");
});

test("a passed claim atomically changes the bounty from open to paying before work begins", () => {
  const source = fs.readFileSync("src/lib/bounty-claim.ts", "utf8");
  const lockAt = source.indexOf("prisma.bounty.updateMany");
  const workOrderAt = source.indexOf("prisma.workOrder.create");
  assert.notEqual(lockAt, -1);
  assert.match(source.slice(lockAt, workOrderAt), /status: "open"[\s\S]*status: "paying"/);
  assert.ok(lockAt < workOrderAt);
});

test("claim text is bounded before the claim pipeline can write or call a model", () => {
  assert.equal(claimTextWithinLimits({
    workLink: "w".repeat(BOUNTY_WORK_LINK_MAX_LENGTH),
    summary: "s".repeat(BOUNTY_SUMMARY_MAX_LENGTH)
  }), true);
  assert.equal(claimTextWithinLimits({
    workLink: "w".repeat(BOUNTY_WORK_LINK_MAX_LENGTH + 1),
    summary: "ok"
  }), false);
  assert.equal(claimTextWithinLimits({
    workLink: "ok",
    summary: "s".repeat(BOUNTY_SUMMARY_MAX_LENGTH + 1)
  }), false);
});

test("the public claim route rate-limits before submitting a claim", () => {
  const source = fs.readFileSync("src/app/api/v1/bounties/[id]/claims/route.ts", "utf8");
  const ipLimitAt = source.indexOf("rateLimit(clientIp(request.headers))");
  const dailyLimitAt = source.indexOf("prisma.bountyClaim.count");
  const submitAt = source.indexOf("submitBountyClaim(bounty.agent");
  assert.ok(ipLimitAt !== -1 && ipLimitAt < submitAt);
  assert.ok(dailyLimitAt !== -1 && dailyLimitAt < submitAt);
  assert.match(source.slice(dailyLimitAt, submitAt), /claimsInLastDay >= 100/);
});
