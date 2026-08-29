import assert from "node:assert/strict";
import test from "node:test";
import { boundedLossMicros, debitInMemory, evaluateBeforeDebit } from "../src/lib/policy.ts";

function state() {
  return {
    id: "agent-1", ceilingMicros: 100n, hourCapMicros: 100n, dayCapMicros: 100n,
    hourCountCap: 1, dayCountCap: 1, killSwitch: false,
    spentMicrosHour: 0n, spentMicrosDay: 0n, countHour: 0, countDay: 0,
    windowStartedAt: new Date("2026-08-29T00:00:00.000Z"),
    dayStartedAt: new Date("2026-08-29T00:00:00.000Z")
  };
}

test("bounded loss is capped by the lower of the daily cap and registered obligations", () => {
  const agent = state();
  assert.equal(boundedLossMicros(agent, [80n, 50n]), 100n);
  assert.equal(boundedLossMicros(agent, [30n, 20n]), 50n);
});

test("two parallel debits against one cap permit exactly one", async () => {
  const agent = state();
  const results = await Promise.all([
    debitInMemory(agent, 100n, new Date("2026-08-29T00:00:01.000Z")),
    debitInMemory(agent, 100n, new Date("2026-08-29T00:00:01.000Z"))
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(agent.spentMicrosDay, 100n);
});

test("an unparseable expiry timestamp fails closed", () => {
  const result = evaluateBeforeDebit({
    agent: state(), recipientActive: true, amountMicros: 1n,
    workOrder: { id: "wo-1", ceilingMicros: 10n, status: "open", expiresAt: "not-a-timestamp" },
    now: new Date("2026-08-29T00:00:00.000Z")
  });
  assert.deepEqual(result, { ok: false, reasonCode: "INVALID_TIMESTAMP" });
});
