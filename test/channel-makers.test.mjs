import assert from "node:assert/strict";
import test from "node:test";
import { CANDIDATES, runGonka } from "../src/lib/gonka.ts";
import { reconcile, requiredChannelsForAmount } from "../src/lib/reconcile.ts";
import {
  modelAnsweredWith,
  receiptMakerSentences,
  receiptSameModelNote,
  sameMakerFallback
} from "../src/lib/channel-makers.ts";

const OPENAI = "openai/gpt-oss-120b";
const ALIBABA = "qwen/qwen3.8-27b";

const schema = {
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
};

function jsonResponse(content, delayMs = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 }
        })
      });
    }, delayMs);
  });
}

test("channel primaries differ", () => {
  assert.equal(CANDIDATES.artifact[0], OPENAI);
  assert.equal(CANDIDATES.artifact[1], ALIBABA);
  assert.equal(CANDIDATES.payer_record[0], ALIBABA);
  assert.equal(CANDIDATES.payer_record[1], OPENAI);
  assert.notEqual(CANDIDATES.artifact[0], CANDIDATES.payer_record[0]);
});

test("the adjudication stores the model that answered", () => {
  assert.equal(modelAnsweredWith({ model: ALIBABA }), ALIBABA);
  assert.equal(modelAnsweredWith({ model: OPENAI }), OPENAI);
  assert.notEqual(modelAnsweredWith({ model: ALIBABA }), CANDIDATES.artifact[0]);
});

test("same-maker fallback in the two-check band is recorded and does not hold the payment", () => {
  const band = requiredChannelsForAmount(100_000_000n);
  assert.equal(band, "both");
  assert.equal(requiredChannelsForAmount(50_000_000n), "both");
  assert.equal(requiredChannelsForAmount(250_000_000n), "both");

  const bothAlibaba = sameMakerFallback({
    requiredChannels: band,
    artifactModel: CANDIDATES.artifact[1],
    payerModel: CANDIDATES.payer_record[0],
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: CANDIDATES.artifact[0],
    payerPrimary: CANDIDATES.payer_record[0]
  });
  assert.equal(bothAlibaba, true);

  const bothOpenAI = sameMakerFallback({
    requiredChannels: requiredChannelsForAmount(50_000_000n),
    artifactModel: CANDIDATES.artifact[0],
    payerModel: CANDIDATES.payer_record[1],
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: CANDIDATES.artifact[0],
    payerPrimary: CANDIDATES.payer_record[0]
  });
  assert.equal(bothOpenAI, true);

  const matched = { workOrderId: "WO-3", amountMicros: 100_000_000n, deliveryTimestamp: "2026-08-29T00:00:00Z" };
  assert.deepEqual(reconcile("both", { artifact: matched, payer_record: matched }), { ok: true, tuple: matched });
  const split = reconcile("both", {
    artifact: { workOrderId: "WO-7", amountMicros: 100_000_000n, deliveryTimestamp: "2026-08-29T00:00:00Z" },
    payer_record: matched
  });
  assert.equal(split.ok, false);
  assert.equal(split.reasonCode, "QUORUM_SPLIT:work_order_id");

  assert.equal(
    receiptSameModelNote(true),
    "This time both checks used the same model because the other was unavailable."
  );
  assert.equal(receiptSameModelNote(false), null);
});

test("under $50 a same-maker fallback is not recorded", () => {
  const band = requiredChannelsForAmount(49_999_999n);
  assert.equal(band, "payer_record");
  assert.equal(sameMakerFallback({
    requiredChannels: band,
    artifactModel: ALIBABA,
    payerModel: ALIBABA,
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: CANDIDATES.artifact[0],
    payerPrimary: CANDIDATES.payer_record[0]
  }), false);
});

test("different makers in the two-check band are not recorded as the same model", () => {
  assert.equal(sameMakerFallback({
    requiredChannels: "both",
    artifactModel: OPENAI,
    payerModel: ALIBABA,
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: OPENAI,
    payerPrimary: ALIBABA
  }), false);

  assert.equal(sameMakerFallback({
    requiredChannels: "both",
    artifactModel: ALIBABA,
    payerModel: OPENAI,
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: OPENAI,
    payerPrimary: ALIBABA
  }), false);

  assert.equal(sameMakerFallback({
    requiredChannels: "human",
    artifactModel: ALIBABA,
    payerModel: ALIBABA,
    artifactAnswered: true,
    payerAnswered: true,
    artifactPrimary: OPENAI,
    payerPrimary: ALIBABA
  }), false);
});

test("receipts show the makers", () => {
  assert.equal(
    receiptMakerSentences({ artifactModel: OPENAI, payerModel: ALIBABA }),
    "The bill was read by OpenAI's model. Your record was read by Alibaba's model."
  );
  assert.equal(
    receiptMakerSentences({ artifactModel: ALIBABA, payerModel: OPENAI }),
    "The bill was read by Alibaba's model. Your record was read by OpenAI's model."
  );
  assert.equal(
    receiptMakerSentences({ artifactModel: ALIBABA, payerModel: ALIBABA }),
    "The bill was read by Alibaba's model. Your record was read by Alibaba's model."
  );
  assert.equal(receiptMakerSentences({ payerModel: ALIBABA }), "Your record was read by Alibaba's model.");
});

test("a channel keeps its primary when that model also answers", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  const valid = JSON.stringify({ work_order_id: "WO-1", amount_micros: "100" });
  try {
    const artifact = await runGonka({
      channel: "artifact",
      messages: [{ role: "user", content: "bill" }],
      schema,
      fetcher: async (_url, init) => {
        const model = JSON.parse(init.body).model;
        return jsonResponse(valid, model === OPENAI ? 40 : 0);
      }
    });
    assert.equal(artifact.ok, true);
    assert.equal(artifact.model, OPENAI);

    const payer = await runGonka({
      channel: "payer_record",
      messages: [{ role: "user", content: "record" }],
      schema,
      fetcher: async (_url, init) => {
        const model = JSON.parse(init.body).model;
        return jsonResponse(valid, model === ALIBABA ? 40 : 0);
      }
    });
    assert.equal(payer.ok, true);
    assert.equal(payer.model, ALIBABA);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});

test("a channel records the fallback model when the primary does not validate", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  const valid = JSON.stringify({ work_order_id: "WO-1", amount_micros: "100" });
  try {
    const artifact = await runGonka({
      channel: "artifact",
      messages: [{ role: "user", content: "bill" }],
      schema,
      fetcher: async (_url, init) => {
        const model = JSON.parse(init.body).model;
        return jsonResponse(model === OPENAI ? "not json" : valid);
      }
    });
    assert.equal(artifact.ok, true);
    assert.equal(modelAnsweredWith(artifact), ALIBABA);

    const calls = [];
    const repaired = await runGonka({
      channel: "payer_record",
      messages: [{ role: "user", content: "record" }],
      schema,
      fetcher: async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.model);
        const repair = body.messages.some((message) => String(message.content).includes("Return only valid JSON"));
        return jsonResponse(repair ? valid : "not json");
      }
    });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.model, ALIBABA);
    assert.ok(calls.includes(ALIBABA));
    assert.ok(calls.includes(OPENAI));
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});
