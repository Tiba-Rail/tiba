import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { modelAnsweredWith } from "../src/lib/channel-makers.ts";
import { runGonka } from "../src/lib/gonka.ts";
import { PayerRecordCheckDetail } from "../src/lib/payer-record-receipt.ts";
import { readPayerRecordByRules, selectPayerRecordTuple } from "../src/lib/payer-record-rules.ts";
import { reconcile } from "../src/lib/reconcile.ts";

const RECEIVED = "2026-09-27T13:06:00.000Z";

function order(ref, record, ceiling = "9000000") {
  return {
    id: ref,
    ceiling_micros: ceiling,
    brief_text: "Already scoped to this recipient.",
    payer_record: record
  };
}

function messages(orders, receivedAt = RECEIVED) {
  return [
    { role: "system", content: "ignored by the rules check" },
    {
      role: "user",
      content: JSON.stringify({
        open_work_orders: orders,
        delivery_event_metadata: { received_at: receivedAt, recipient_ref: "REC-1" }
      })
    }
  ];
}

const bill = {
  workOrderId: "WO-1",
  amountMicros: 5_000_000n,
  deliveryTimestamp: RECEIVED
};

test("exactly one verified work order returns that record's tuple", async () => {
  const orders = [
    order("WO-PENDING", { delivery_status: "pending", approved_amount_micros: "1000000" }),
    order("WO-1", {
      delivery_status: "verified_complete",
      approved_amount_micros: "5000000",
      delivery_timestamp: "2020-01-01T00:00:00.000Z"
    }, "9000000")
  ];

  assert.deepEqual(selectPayerRecordTuple(orders, RECEIVED), {
    ref: "WO-1",
    approved_amount_micros: "5000000",
    received_at: RECEIVED
  });

  const calls = [];
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  try {
    const result = await runGonka({
      channel: "payer_record",
      messages: messages(orders),
      schema: { name: "unused", strict: true, schema: {} },
      fetcher: async () => {
        calls.push("called");
        throw new Error("check 2 must not call a model");
      }
    });
    assert.equal(calls.length, 0);
    assert.equal(result.ok, true);
    assert.equal(result.model, "rules");
    assert.equal(modelAnsweredWith(result), "rules");
    assert.deepEqual(JSON.parse(result.content), {
      work_order_id: "WO-1",
      amount_micros: "5000000",
      delivery_timestamp: RECEIVED,
      record_basis: "verified_complete"
    });
    const split = reconcile("both", {
      artifact: { workOrderId: "WO-1", amountMicros: 9_000_000n, deliveryTimestamp: RECEIVED },
      payer_record: { workOrderId: "WO-1", amountMicros: 5_000_000n, deliveryTimestamp: RECEIVED }
    });
    assert.equal(split.ok, false);
    assert.equal(split.decisionClass, "RED");
    assert.equal(split.reasonCode, "QUORUM_SPLIT:amount_micros");
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});

test("a verified work order with no approved amount uses the ceiling", () => {
  const fromMessage = selectPayerRecordTuple(
    [order("WO-CEILING", { delivery_status: "verified_complete" }, "180000000")],
    RECEIVED
  );
  assert.deepEqual(fromMessage, {
    ref: "WO-CEILING",
    approved_amount_micros: "180000000",
    received_at: RECEIVED
  });

  const fromRow = selectPayerRecordTuple(
    [{
      ref: "WO-BIGINT",
      ceilingMicros: 180_000_000n,
      payerRecord: { delivery_status: "verified_complete", approved_amount_micros: "" }
    }],
    RECEIVED
  );
  assert.equal(fromRow.approved_amount_micros, "180000000");
  assert.equal(fromRow.ref, "WO-BIGINT");
});

test("zero verified work orders return no tuple and the payment is held", () => {
  const orders = [
    order("WO-A", { delivery_status: "pending", approved_amount_micros: "5000000" }),
    order("WO-B", { delivery_status: "awaiting_delivery", approved_amount_micros: "5000000" }),
    order("WO-C", { delivery_status: "Verified_Complete", approved_amount_micros: "5000000" })
  ];
  assert.equal(selectPayerRecordTuple(orders, RECEIVED), null);
  assert.equal(selectPayerRecordTuple([], RECEIVED), null);

  const read = readPayerRecordByRules(messages(orders));
  assert.equal(read.model, "rules");
  assert.equal(read.ok, false);
  assert.equal(read.content, undefined);

  const held = reconcile("both", { artifact: bill });
  assert.equal(held.ok, false);
  assert.equal(held.decisionClass, "AMBER");
  assert.equal(held.reasonCode, "MISSING_REQUIRED_CHANNEL");
});

test("several verified work orders return no tuple and the payment is held", () => {
  const orders = [
    order("WO-1", { delivery_status: "verified_complete", approved_amount_micros: "5000000" }),
    order("WO-2", { delivery_status: "verified_complete", approved_amount_micros: "5000000" }),
    order("WO-3", { delivery_status: "pending", approved_amount_micros: "1000" })
  ];
  assert.equal(selectPayerRecordTuple(orders, RECEIVED), null);

  const read = readPayerRecordByRules(messages(orders));
  assert.equal(read.model, "rules");
  assert.equal(read.ok, false);
  assert.equal(read.content, undefined);
  assert.equal(modelAnsweredWith(read), "rules");

  const held = reconcile("both", { artifact: bill });
  assert.equal(held.ok, false);
  assert.equal(held.decisionClass, "AMBER");
});

test("the receipt renders Check 2: rules, no AI for a rules payer row", () => {
  const html = renderToStaticMarkup(
    PayerRecordCheckDetail({ model: "rules", requestId: null, latencyMs: 0 })
  );
  assert.equal(html.includes("Check 2: rules, no AI"), true);
  assert.equal(html.includes("Model used"), false);
  assert.equal(html.includes("request ID"), false);
});

test("an AI payer row on the receipt still names the model", () => {
  const html = renderToStaticMarkup(
    PayerRecordCheckDetail({
      model: "qwen/qwen3.8-27b",
      requestId: "req-123",
      latencyMs: 40
    })
  );
  assert.equal(html.includes("Model used: "), true);
  assert.equal(html.includes("qwen/qwen3.8-27b"), true);
  assert.equal(html.includes("req-123"), true);
  assert.equal(html.includes("40ms"), true);
  assert.equal(html.includes("rules, no AI"), false);
});

test("the bill check still calls a model", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  const calls = [];
  try {
    const result = await runGonka({
      channel: "artifact",
      messages: [{ role: "user", content: "bill" }],
      schema: {
        name: "artifact_decision",
        strict: true,
        schema: {
          type: "object",
          required: ["work_order_id", "amount_micros"],
          properties: {
            work_order_id: { type: "string" },
            amount_micros: { type: "string", pattern: "^[0-9]+$" }
          }
        }
      },
      fetcher: async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.model);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ work_order_id: "WO-1", amount_micros: "5000000" }) } }]
          })
        };
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.model, "openai/gpt-oss-120b");
    assert.equal(calls.includes("openai/gpt-oss-120b"), true);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});
