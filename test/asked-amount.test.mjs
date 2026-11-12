import assert from "node:assert/strict";
import test from "node:test";
import { amountAskedMicros, receiptAmountLines } from "../src/lib/asked-amount.ts";

const bill = (amount) => [
  {
    channel: "artifact",
    tupleJson: { work_order_id: "WO-SOL-2", amount_micros: amount, delivery_timestamp: "2026-09-11T00:00:00.000Z" }
  },
  {
    channel: "payer_record",
    tupleJson: { work_order_id: "WO-SOL-2", amount_micros: "10000", delivery_timestamp: "2026-09-11T00:00:00.000Z" }
  }
];

test("a refused receipt uses the bill amount when the stored amount is 0", () => {
  const lines = receiptAmountLines({
    paid: false,
    amountMicros: 0n,
    adjudications: bill("999999999")
  });
  assert.equal(lines.label, "Bill asked for");
  assert.equal(lines.digits, "999.999999");
  assert.equal(lines.unread, false);
  assert.equal(lines.micros, 999999999n);
});

test("a numeric bill amount is read the same way as a string", () => {
  assert.equal(amountAskedMicros(0, bill(5_000_000)), 5_000_000n);
  const lines = receiptAmountLines({ paid: false, amountMicros: "0", adjudications: bill(5_000_000) });
  assert.equal(lines.digits, "5.00");
});

test("a paid receipt keeps the stored amount", () => {
  const lines = receiptAmountLines({
    paid: true,
    amountMicros: 10_000n,
    adjudications: bill("999999999")
  });
  assert.equal(lines.label, "Amount");
  assert.equal(lines.digits, "0.01");
});

test("a refusal with no bill amount is not shown as 0", () => {
  const lines = receiptAmountLines({ paid: false, amountMicros: 0n, adjudications: [] });
  assert.equal(lines.unread, true);
  assert.equal(lines.digits, "Not read");
  assert.equal(lines.micros, null);
});
