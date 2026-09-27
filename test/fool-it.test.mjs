import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CANDIDATES } from "../src/lib/gonka.ts";
import { artifactDecisionSchema, artifactSystemPrompt, payerRecordDecisionSchema, payerRecordSystemPrompt } from "../src/lib/prompts.ts";
import { readSandboxChannels } from "../src/lib/fool-it-read.ts";
import {
  SANDBOX_AMOUNT_MICROS,
  SANDBOX_AMOUNT_USDC,
  SANDBOX_WORK_ORDER_ID,
  SANDBOX_WRONG_AMOUNT_USDC,
  SANDBOX_WRONG_WORK_ORDER_ID,
  sandboxBillText
} from "../src/lib/fool-it-sample.ts";
import {
  FOOL_IT_DEPLOYMENT_TRIES_PER_DAY,
  FOOL_IT_TRIES_PER_DAY,
  FOOL_IT_TRIES_PER_WINDOW,
  FOOL_IT_WINDOW_MS,
  foolItResponseBody,
  refusalRecord,
  runFoolItAttempt,
  sandboxChannelRequests,
  sandboxWorkspacePlan
} from "../src/lib/fool-it.ts";

const RECEIVED = "2026-09-26T12:00:00.000Z";

function channel(tuple, extra = {}) {
  return {
    ok: true,
    model: "openai/gpt-oss-120b",
    requestId: "req-test",
    latencyMs: 5,
    content: JSON.stringify({
      work_order_id: tuple.workOrderId,
      amount_micros: tuple.amountMicros,
      delivery_timestamp: RECEIVED,
      evidence: "test",
      ...extra
    }),
    ...extra
  };
}

function recordChannel() {
  return channel({ workOrderId: SANDBOX_WORK_ORDER_ID, amountMicros: SANDBOX_AMOUNT_MICROS });
}

function attempt(overrides) {
  const persisted = [];
  const calls = { reads: 0 };
  const run = (more = {}) =>
    runFoolItAttempt({
      visitorId: "visitor-a",
      workOrderId: SANDBOX_WRONG_WORK_ORDER_ID,
      amount: SANDBOX_WRONG_AMOUNT_USDC,
      now: Date.parse("2026-09-26T12:00:00.000Z"),
      store: overrides.store,
      readChannels: async () => {
        calls.reads += 1;
        return overrides.read();
      },
      persistRefusal: async (draft) => {
        persisted.push(draft);
        return { publicToken: "receipt-token" };
      },
      ...more
    });
  return { persisted, calls, run };
}

test("mismatch -> refused receipt", async () => {
  const store = new Map();
  const { persisted, calls, run } = attempt({
    store,
    read: () => ({
      artifact: channel({ workOrderId: SANDBOX_WRONG_WORK_ORDER_ID, amountMicros: "9000000" }),
      payer: recordChannel()
    })
  });
  const result = await run({ workOrderId: SANDBOX_WRONG_WORK_ORDER_ID, amount: "9.00" });
  assert.equal(result.outcome, "refused");
  assert.equal(result.moneySent, false);
  assert.equal(result.paid, false);
  assert.equal(result.reasonCode, "QUORUM_SPLIT:work_order_id");
  assert.equal(result.receiptPath, "/r/receipt-token");
  assert.match(result.mismatch, /WO-FAKE-999/);
  assert.match(result.mismatch, /WO-TRY-FOOL-1/);
  assert.match(result.mismatch, /9\.00 USDC/);
  assert.match(result.mismatch, /1\.00 USDC/);
  assert.match(result.mismatch, /refused/i);
  assert.equal(calls.reads, 1);
  assert.equal(persisted.length, 1);

  const draft = persisted[0];
  assert.equal(draft.bill.workOrderId, SANDBOX_WRONG_WORK_ORDER_ID);
  assert.equal(draft.record.workOrderId, SANDBOX_WORK_ORDER_ID);
  assert.equal(draft.record.amount, `${SANDBOX_AMOUNT_USDC} USDC`);
  assert.match(draft.billText, /WO-FAKE-999/);
  assert.match(draft.billText, /9\.00 USDC/);
  const artifact = draft.adjudications.find((row) => row.channel === "artifact");
  const payer = draft.adjudications.find((row) => row.channel === "payer_record");
  assert.equal(artifact.tupleJson.work_order_id, "WO-FAKE-999");
  assert.equal(artifact.tupleJson.amount_micros, "9000000");
  assert.equal(payer.tupleJson.work_order_id, SANDBOX_WORK_ORDER_ID);
  assert.equal(payer.tupleJson.amount_micros, SANDBOX_AMOUNT_MICROS);

  const row = refusalRecord(draft, "receipt-token", "fool-it-receipt-token");
  assert.equal(row.intent.status, "refused");
  assert.equal(row.intent.decisionClass, "RED");
  assert.equal(row.intent.reasonCode, "QUORUM_SPLIT:work_order_id");
  assert.equal(row.intent.digest, null);
  assert.equal(row.intent.explorerUrl, null);
  assert.equal(row.intent.chain, "sandbox");
  assert.equal(row.intent.x402Routed, false);
  assert.equal(row.intent.amountMicros, 9_000_000n);
  assert.equal(row.artifact.rawText, draft.billText);
  assert.equal(row.artifact.sha256, createHash("sha256").update(draft.billText).digest("hex"));
  assert.equal(row.adjudications.length, 2);

  const body = foolItResponseBody(result);
  assert.equal(body.money_sent, false);
  assert.equal(body.paid, false);
  assert.equal(body.receipt_url, "/r/receipt-token");
  assert.equal(body.outcome, "refused");
});

test("a changed amount on the real work order is still a refused receipt", async () => {
  const store = new Map();
  const { persisted, run } = attempt({
    store,
    read: () => ({
      artifact: channel({ workOrderId: SANDBOX_WORK_ORDER_ID, amountMicros: "9000000" }),
      payer: recordChannel()
    })
  });
  const result = await run({ workOrderId: SANDBOX_WORK_ORDER_ID, amount: "9" });
  assert.equal(result.outcome, "refused");
  assert.equal(result.reasonCode, "QUORUM_SPLIT:amount_micros");
  assert.equal(result.moneySent, false);
  assert.equal(persisted.length, 1);
  assert.equal(refusalRecord(persisted[0], "t", "k").intent.status, "refused");
  assert.equal(refusalRecord(persisted[0], "t", "k").intent.digest, null);
});

test("match -> no payment", async () => {
  const store = new Map();
  const { persisted, calls, run } = attempt({
    store,
    read: () => ({ artifact: recordChannel(), payer: recordChannel() })
  });
  const result = await run({ workOrderId: SANDBOX_WORK_ORDER_ID, amount: SANDBOX_AMOUNT_USDC });
  assert.equal(result.outcome, "would_pay");
  assert.equal(result.moneySent, false);
  assert.equal(result.paid, false);
  assert.equal(result.receiptPath, undefined);
  assert.match(result.message, /Would pay/);
  assert.match(result.message, /sandbox/i);
  assert.match(result.message, /Nothing was sent/);
  assert.equal(calls.reads, 1);
  assert.equal(persisted.length, 0);
  const body = foolItResponseBody(result);
  assert.equal(body.money_sent, false);
  assert.equal(body.paid, false);
  assert.equal(body.receipt_url, undefined);
  assert.equal(body.outcome, "would_pay");
});

test("a model failure writes no receipt and sends nothing", async () => {
  const store = new Map();
  const { persisted, run } = attempt({
    store,
    read: () => ({
      artifact: { ok: false, model: "openai/gpt-oss-120b", latencyMs: 1, errorCode: "INFERENCE_UNAVAILABLE" },
      payer: recordChannel()
    })
  });
  const result = await run();
  assert.equal(result.outcome, "unavailable");
  assert.equal(result.moneySent, false);
  assert.equal(result.paid, false);
  assert.equal(persisted.length, 0);
});

test("rate limit: five tries in ten minutes, then a daily cap", async () => {
  const start = Date.parse("2026-09-26T12:00:00.000Z");
  const store = new Map();
  const { calls, run } = attempt({
    store,
    read: () => ({ artifact: recordChannel(), payer: recordChannel() })
  });
  for (let i = 0; i < FOOL_IT_TRIES_PER_WINDOW; i += 1) {
    const result = await run({ now: start, workOrderId: SANDBOX_WORK_ORDER_ID, amount: "1.00" });
    assert.equal(result.outcome, "would_pay");
  }
  const blocked = await run({ now: start + 9 * 60 * 1000, workOrderId: SANDBOX_WORK_ORDER_ID, amount: "1.00" });
  assert.equal(blocked.outcome, "rate_limited");
  assert.equal(blocked.moneySent, false);
  assert.match(blocked.message, /5 tries every 10 minutes/);
  assert.match(blocked.message, /Nothing was sent/);
  assert.equal(calls.reads, FOOL_IT_TRIES_PER_WINDOW);

  const again = await run({
    now: start + FOOL_IT_WINDOW_MS + 1,
    workOrderId: SANDBOX_WORK_ORDER_ID,
    amount: "1.00"
  });
  assert.equal(again.outcome, "would_pay");

  const other = await run({
    visitorId: "visitor-b",
    now: start,
    workOrderId: SANDBOX_WORK_ORDER_ID,
    amount: "1.00"
  });
  assert.equal(other.outcome, "would_pay");

  const dayStore = new Map();
  let dayReads = 0;
  for (let i = 0; i < FOOL_IT_TRIES_PER_DAY; i += 1) {
    const result = await runFoolItAttempt({
      visitorId: "day-visitor",
      workOrderId: SANDBOX_WORK_ORDER_ID,
      amount: "1.00",
      now: start + i * (FOOL_IT_WINDOW_MS + 1),
      store: dayStore,
      readChannels: async () => {
        dayReads += 1;
        return { artifact: recordChannel(), payer: recordChannel() };
      },
      persistRefusal: async () => {
        throw new Error("a matching bill must not write a receipt");
      }
    });
    assert.equal(result.outcome, "would_pay");
  }
  const dayBlocked = await runFoolItAttempt({
    visitorId: "day-visitor",
    workOrderId: SANDBOX_WORK_ORDER_ID,
    amount: "1.00",
    now: start + FOOL_IT_TRIES_PER_DAY * (FOOL_IT_WINDOW_MS + 1),
    store: dayStore,
    readChannels: async () => {
      dayReads += 1;
      return { artifact: recordChannel(), payer: recordChannel() };
    },
    persistRefusal: async () => {
      throw new Error("a capped try must not write a receipt");
    }
  });
  assert.equal(dayBlocked.outcome, "rate_limited");
  assert.match(dayBlocked.message, /daily cap/);
  assert.equal(dayBlocked.moneySent, false);
  assert.equal(dayReads, FOOL_IT_TRIES_PER_DAY);

  const crowd = new Map();
  let crowdReads = 0;
  for (let i = 0; i < FOOL_IT_DEPLOYMENT_TRIES_PER_DAY; i += 1) {
    const result = await runFoolItAttempt({
      visitorId: `crowd-${i}`,
      workOrderId: SANDBOX_WORK_ORDER_ID,
      amount: "1.00",
      now: start,
      store: crowd,
      readChannels: async () => {
        crowdReads += 1;
        return { artifact: recordChannel(), payer: recordChannel() };
      },
      persistRefusal: async () => {
        throw new Error("a matching bill must not write a receipt");
      }
    });
    assert.equal(result.outcome, "would_pay");
  }
  const crowdBlocked = await runFoolItAttempt({
    visitorId: "crowd-new",
    workOrderId: SANDBOX_WORK_ORDER_ID,
    amount: "1.00",
    now: start,
    store: crowd,
    readChannels: async () => {
      crowdReads += 1;
      return { artifact: recordChannel(), payer: recordChannel() };
    },
    persistRefusal: async () => {
      throw new Error("a capped try must not write a receipt");
    }
  });
  assert.equal(crowdBlocked.outcome, "rate_limited");
  assert.equal(crowdBlocked.moneySent, false);
  assert.equal(crowdReads, FOOL_IT_DEPLOYMENT_TRIES_PER_DAY);
});

test("a bad bill does not use up a try or call the model", async () => {
  const store = new Map();
  let reads = 0;
  const bad = await runFoolItAttempt({
    visitorId: "visitor-a",
    workOrderId: "OK",
    amount: "not-money",
    now: Date.parse("2026-09-26T12:00:00.000Z"),
    store,
    readChannels: async () => {
      reads += 1;
      throw new Error("should not read");
    },
    persistRefusal: async () => {
      throw new Error("should not persist");
    }
  });
  assert.equal(bad.outcome, "invalid");
  assert.equal(reads, 0);
});

test("the sandbox reader uses the live prompts and keeps the bill off the payer record", async () => {
  const seen = [];
  await readSandboxChannels({ billText: "BILL-MARK-9.50", receivedAt: RECEIVED }, async (request) => {
    seen.push(request);
    return { ok: false, model: request.channel, latencyMs: 1, errorCode: "INFERENCE_UNAVAILABLE" };
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].channel, "artifact");
  assert.equal(seen[1].channel, "payer_record");
  assert.equal(seen[0].schema, artifactDecisionSchema);
  assert.equal(seen[1].schema, payerRecordDecisionSchema);
  assert.equal(seen[0].messages[0].content, artifactSystemPrompt);
  assert.equal(seen[1].messages[0].content, payerRecordSystemPrompt);
  assert.match(seen[0].messages[1].content, /BILL-MARK-9\.50/);
  assert.doesNotMatch(seen[1].messages[1].content, /BILL-MARK/);
  assert.match(seen[1].messages[1].content, /1000000/);
  assert.match(seen[1].messages[1].content, /verified_complete/);

  const messages = sandboxChannelRequests({ billText: "BILL-MARK-9.50", receivedAt: RECEIVED });
  assert.deepEqual(messages.artifact, seen[0].messages);
  assert.deepEqual(messages.payer, seen[1].messages);
});

test("sandbox reader failures name the configured Groq candidates, not retired models", async () => {
  const result = await readSandboxChannels(
    { billText: "BILL-MARK-9.50", receivedAt: RECEIVED },
    async () => {
      throw new Error("reader unavailable");
    }
  );

  assert.equal(result.artifact.model, CANDIDATES.artifact[0]);
  assert.equal(result.payer.model, CANDIDATES.payer_record[0]);
});

test("the sandbox workspace cannot be a payable wallet", () => {
  const plan = sandboxWorkspacePlan(new Date("2026-09-26T00:00:00.000Z"), "hash-only");
  assert.equal(plan.agent.rail, "mock");
  assert.equal(plan.agent.ceilingMicros, 0n);
  assert.equal(plan.agent.dayCapMicros, 0n);
  assert.equal(plan.agent.killSwitch, false);
  assert.equal(plan.recipient.solanaAddress, null);
  assert.equal(plan.workOrder.status, "open");
  assert.equal(plan.workOrder.dischargedByIntentId, null);
  assert.equal(plan.workOrder.requiredChannels, "both");
  assert.equal(plan.workOrder.ref, SANDBOX_WORK_ORDER_ID);
  assert.equal(plan.workOrder.payerRecord.approved_amount_micros, SANDBOX_AMOUNT_MICROS);
  const packed = JSON.stringify(plan, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
  assert.equal(packed.includes("PRIVATE"), false);
  assert.equal(packed.includes("SECRET"), false);
});

test("the sandbox path does not call a payout rail", () => {
  const files = [
    "src/lib/fool-it.ts",
    "src/lib/fool-it-read.ts",
    "src/lib/fool-it-store.ts",
    "src/lib/fool-it-sample.ts",
    "src/app/api/try/fool/route.ts",
    "src/app/try/fool-it.tsx"
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("payoutRail"), false, file);
    assert.equal(source.includes("processPayoutIntent"), false, file);
    assert.equal(source.includes("PRIVATE_KEY"), false, file);
    assert.equal(source.includes("SOLANA_PRIVATE_KEY"), false, file);
  }
});

test("the bill text states the work order on its own labelled line", () => {
  const text = sandboxBillText("WO-FAKE-999", "9.00");
  assert.match(text, /^Work order: WO-FAKE-999$/m);
  assert.match(text, /^Amount due: 9\.00 USDC$/m);
});

test("a blank work order read from a changed bill is named, not left blank", async () => {
  const store = new Map();
  const { run } = attempt({
    store,
    read: () => ({
      // The reading model returned a tuple, but couldn't find a work order in the edited bill --
      // a real, if unhelpful, answer, not the same as the channel failing outright.
      artifact: channel({ workOrderId: "", amountMicros: "9000000" }),
      payer: recordChannel()
    })
  });
  const result = await run({ workOrderId: SANDBOX_WRONG_WORK_ORDER_ID, amount: "9.00" });
  assert.equal(result.outcome, "refused");
  assert.equal(result.bill.workOrderId, "not found on the bill");
  assert.match(result.mismatch, /not found on the bill/);
  assert.doesNotMatch(result.mismatch, /saw invoice ,/);
});

test("a blank work order read from the payer record is named on that side instead", async () => {
  const store = new Map();
  const { run } = attempt({
    store,
    read: () => ({
      artifact: channel({ workOrderId: SANDBOX_WRONG_WORK_ORDER_ID, amountMicros: "9000000" }),
      payer: channel({ workOrderId: "", amountMicros: SANDBOX_AMOUNT_MICROS })
    })
  });
  const result = await run({ workOrderId: SANDBOX_WRONG_WORK_ORDER_ID, amount: "9.00" });
  assert.equal(result.outcome, "refused");
  assert.equal(result.record.workOrderId, "not found on the record");
});
