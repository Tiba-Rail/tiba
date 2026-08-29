import assert from "node:assert/strict";
import test from "node:test";
import { reconcile, requiredChannelsForAmount } from "../src/lib/reconcile.ts";

test("matching independently sourced tuples reconcile", () => {
  const tuple = { workOrderId: "WO-3", amountMicros: 180_000_000n, deliveryTimestamp: "2026-08-29T00:00:00Z" };
  assert.deepEqual(reconcile("both", { artifact: tuple, payer_record: tuple }), { ok: true, tuple });
});

test("a tuple mismatch names the differing field", () => {
  const result = reconcile("both", {
    artifact: { workOrderId: "WO-7", amountMicros: 4_800_000_000n, deliveryTimestamp: "2026-08-29T00:00:00Z" },
    payer_record: { workOrderId: "WO-3", amountMicros: 180_000_000n, deliveryTimestamp: "2026-08-29T00:00:00Z" }
  });
  assert.deepEqual(result, { ok: false, decisionClass: "RED", reasonCode: "QUORUM_SPLIT:work_order_id" });
});

test("verification bands select one channel, two channels, then human review", () => {
  assert.equal(requiredChannelsForAmount(49_999_999n), "payer_record");
  assert.equal(requiredChannelsForAmount(50_000_000n), "both");
  assert.equal(requiredChannelsForAmount(250_000_001n), "human");
});
