import assert from "node:assert/strict";
import test from "node:test";
import { limitsStatus } from "../src/lib/receipt-status.ts";

test("a split refusal never reached the limits", () => {
  assert.equal(limitsStatus("RED", "QUORUM_SPLIT:amount_micros"), "Not reached");
});

test("a limits refusal is Blocked", () => {
  assert.equal(limitsStatus("RED", "DAY_AMOUNT_CAP"), "Blocked");
});

test("a paid intent passed the limits", () => {
  assert.equal(limitsStatus("PAID", null), "Passed");
});

test("a failed settlement had already passed the limits", () => {
  assert.equal(limitsStatus("RED", "SETTLEMENT_FAILED"), "Passed");
});

test("a hold for human review never reached the limits", () => {
  assert.equal(limitsStatus("AMBER", "HUMAN_REVIEW_REQUIRED"), "Not reached");
});
