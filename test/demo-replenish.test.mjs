import assert from "node:assert/strict";
import test from "node:test";
import { shouldReplenish, demoReplenishRefs, DEMO_REPLENISH_DAILY_CAP, replenishDemoWorkOrder } from "../src/lib/demo-replenish.ts";

test("the documented demo order is the default, and only it", () => {
  assert.deepEqual(demoReplenishRefs({}), ["WO-13"]);
  assert.deepEqual(demoReplenishRefs({ DEMO_REPLENISH_REFS: "WO-13, WO-99" }), ["WO-13", "WO-99"]);
  assert.deepEqual(demoReplenishRefs({ DEMO_REPLENISH_REFS: "" }), []);
});

test("a settled payment against the demo order replenishes it", () => {
  assert.equal(shouldReplenish({ ref: "WO-13", settled: true, settledCountLast24h: 0 }), true);
});

test("a real customer order is never replenished", () => {
  assert.equal(shouldReplenish({ ref: "WO-3", settled: true, settledCountLast24h: 0 }), false);
});

test("a refusal never replenishes, even on the demo order", () => {
  assert.equal(shouldReplenish({ ref: "WO-13", settled: false, settledCountLast24h: 0 }), false);
});

test("the rolling 24h cap is a hard boundary", () => {
  assert.equal(shouldReplenish({ ref: "WO-13", settled: true, settledCountLast24h: DEMO_REPLENISH_DAILY_CAP - 1 }), true);
  assert.equal(shouldReplenish({ ref: "WO-13", settled: true, settledCountLast24h: DEMO_REPLENISH_DAILY_CAP }), false);
});

test("re-opens the same row rather than creating a new ref", async () => {
  const calls = [];
  const client = {
    workOrder: {
      findUnique: async () => ({ id: "wo-uuid", ref: "WO-13" }),
      updateMany: async (args) => { calls.push(args); return { count: 1 }; }
    },
    payoutIntent: { count: async () => 0 }
  };
  assert.equal(await replenishDemoWorkOrder(client, { workOrderId: "wo-uuid", settled: true }), "replenished");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].data, { status: "open", dischargedByIntentId: null });
  assert.equal(calls[0].where.id, "wo-uuid");
});

test("a database failure is swallowed so it can never undo a settled payment", async () => {
  const client = {
    workOrder: { findUnique: async () => { throw new Error("connection lost"); }, updateMany: async () => ({ count: 0 }) },
    payoutIntent: { count: async () => 0 }
  };
  assert.equal(await replenishDemoWorkOrder(client, { workOrderId: "wo-uuid", settled: true }), "skipped");
});
