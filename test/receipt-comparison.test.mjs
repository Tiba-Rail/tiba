import assert from "node:assert/strict";
import test from "node:test";
import { explainDecision } from "../src/app/console/types.ts";
import {
  GROWTH_LINE,
  growthHref,
  homepageRefusedCard,
  receiptComparisonFromStored,
  receiptShareLines
} from "../src/lib/receipt-comparison.ts";

const bill = {
  tupleJson: {
    work_order_id: "WO-BILL",
    amount_micros: "5000000",
    delivery_timestamp: "2026-09-01T00:00:00.000Z"
  }
};

const record = {
  tupleJson: {
    work_order_id: "WO-RECORD",
    amount_micros: "1000000",
    delivery_timestamp: "2026-09-02T15:30:00.000Z"
  }
};

test("refused receipt renders bill, record, and mismatch from stored data", () => {
  const view = receiptComparisonFromStored({ artifact: bill, payerRecord: record });

  assert.equal(view.bill.title, "The bill");
  assert.equal(view.bill.intro, "What the evidence said.");
  assert.equal(view.bill.workOrderId, "WO-BILL");
  assert.equal(view.bill.amount, "5.00 USDC");

  assert.equal(view.record.title, "The record");
  assert.equal(view.record.intro, "What your own record said.");
  assert.equal(view.record.workOrderId, "WO-RECORD");
  assert.equal(view.record.amount, "1.00 USDC");

  assert.deepEqual(
    view.fields.map((field) => field.label),
    ["Work order", "Amount", "Delivery date"]
  );
  assert.deepEqual(view.fields[0], { label: "Work order", bill: "WO-BILL", record: "WO-RECORD" });
  assert.deepEqual(view.fields[1], { label: "Amount", bill: "5.00 USDC", record: "1.00 USDC" });
  assert.equal(view.fields[2].bill, "1 Sep 2026, 00:00 UTC");
  assert.equal(view.fields[2].record, "2 Sep 2026, 15:30 UTC");
  assert.equal(view.mismatchedField, "work order, amount, and delivery date");
  assert.equal(view.mismatchNote, null);

  const share = receiptShareLines({
    decisionClass: "RED",
    amount: "5.00 USDC",
    chain: "tempo",
    comparison: view
  });
  assert.deepEqual(share, {
    outcome: "REFUSED",
    amount: "5.00 USDC",
    network: "Tempo testnet",
    mismatch: "work order, amount, and delivery date"
  });
});

test("share lines and decision copy identify a simulated payment without claiming a transfer", () => {
  const comparison = receiptComparisonFromStored({ artifact: bill, payerRecord: bill });
  const share = receiptShareLines({
    decisionClass: "PAID",
    amount: "5.00 USDC",
    chain: "mock",
    comparison
  });

  assert.equal(share.network, "Simulated, no transfer");
  assert.equal(
    explainDecision("PAID", null, "mock"),
    "Both checks agreed and the limits passed. Simulated: nothing was sent."
  );
});

test("a channel that did not run says so", () => {
  const view = receiptComparisonFromStored({ artifact: null, payerRecord: record });
  assert.equal(view.bill.note, "This check did not run.");
  assert.equal(view.bill.workOrderId, null);
  assert.equal(view.record.workOrderId, "WO-RECORD");
  assert.deepEqual(view.fields, []);
  assert.equal(view.mismatchNote, "A check did not run, so the bill and the record cannot be compared.");
  assert.equal(view.mismatchedField, null);
});

test("homepage shows nothing when no refusal exists", () => {
  assert.equal(homepageRefusedCard(null), null);
  assert.equal(homepageRefusedCard(undefined), null);

  const card = homepageRefusedCard({
    publicToken: "11111111-1111-4111-8111-111111111111",
    adjudications: [
      { channel: "artifact", tupleJson: bill.tupleJson },
      { channel: "payer_record", tupleJson: record.tupleJson }
    ]
  });
  assert.equal(card.href, "/r/11111111-1111-4111-8111-111111111111");
  assert.equal(card.comparison.bill.workOrderId, "WO-BILL");
  assert.equal(card.comparison.record.amount, "1.00 USDC");
  assert.equal(card.comparison.fields[0].bill, "WO-BILL");
  assert.equal(card.comparison.fields[0].record, "WO-RECORD");
});

test("a tuple with a blank work order is named, not shown as nothing", () => {
  const blankBill = {
    tupleJson: {
      work_order_id: "",
      amount_micros: "9000000",
      delivery_timestamp: "2026-09-01T00:00:00.000Z"
    }
  };
  const view = receiptComparisonFromStored({ artifact: blankBill, payerRecord: record });

  // The channel view itself: the receipt's "Bill" panel would otherwise show an empty line.
  assert.equal(view.bill.note, null, "the channel ran and returned a tuple -- it is not the 'did not run' case");
  assert.equal(view.bill.workOrderId, "not found on the bill");

  // The side-by-side mismatch table: same gap, same fix.
  const workOrderField = view.fields.find((field) => field.label === "Work order");
  assert.deepEqual(workOrderField, { label: "Work order", bill: "not found on the bill", record: "WO-RECORD" });
});

test("every receipt links onward with its own token", () => {
  assert.equal(
    GROWTH_LINE,
    "Pay your own contributors with Tiba. Every payment checked, every outcome on a receipt like this one."
  );
  assert.equal(growthHref("abc"), "/start?ref=abc");
});
