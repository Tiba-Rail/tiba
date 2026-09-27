import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Keypair, Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { afterSettlementFailure, committedPendingData, settleCommittedIntent } from "../src/lib/payout-settlement.ts";
import { notSent, PayoutRailError, settlementProvenFailed } from "../src/lib/rails/index.ts";
import { confirmPayoutQuorum, signedTransactionId } from "../src/lib/rails/solana.ts";

const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");
const overrideSource = readFileSync(new URL("../src/app/api/v1/intents/[id]/override/route.ts", import.meta.url), "utf8");

const PRICING = { gnkUsd: null, pricingUpdatedAt: null };
const TARGET = { chain: "solana", address: Keypair.generate().publicKey.toBase58() };

/** In-memory stand-in for the two tables settlement touches, starting from a committed step 1. */
function database() {
  const workOrders = new Map([["wo-1", { id: "wo-1", ref: "WO-1", status: "discharged", dischargedByIntentId: "intent-1" }]]);
  const intents = new Map([
    ["intent-1", { id: "intent-1", ...committedPendingData({ workOrderId: "wo-1", amountMicros: 5_000_000n, chain: "solana", pricing: PRICING }) }]
  ]);
  const writes = [];
  return {
    intents,
    workOrders,
    writes,
    payoutIntent: {
      async update({ where, data }) {
        writes.push({ table: "payoutIntent", data });
        const row = { ...intents.get(where.id), ...data };
        intents.set(where.id, row);
        return row;
      },
      async count() {
        return 0;
      }
    },
    workOrder: {
      async findUnique({ where }) {
        const row = workOrders.get(where.id);
        return row ? { id: row.id, ref: row.ref } : null;
      },
      async updateMany({ where, data }) {
        writes.push({ table: "workOrder", where, data });
        const row = workOrders.get(where.id);
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(where)) {
          if (key !== "id" && row[key] !== value) return { count: 0 };
        }
        workOrders.set(where.id, { ...row, ...data });
        return { count: 1 };
      }
    }
  };
}

const SIGNATURE = bs58.encode(Buffer.alloc(64, 7));

/** A rail that stores the id first (like the Solana rail) and then ends the way the test says. */
function rail(ending) {
  return {
    async send(request) {
      await request.onSigned?.(SIGNATURE);
      if (ending instanceof Error) throw ending;
      return { digest: SIGNATURE, explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet` };
    },
    async batch() {
      throw new Error("not used");
    }
  };
}

function settle(db, ending) {
  return settleCommittedIntent(db, {
    intentId: "intent-1",
    workOrderId: "wo-1",
    amountMicros: 5_000_000n,
    target: TARGET,
    rail: rail(ending),
    paidReasonCode: null,
    pricing: PRICING,
    log: () => {}
  });
}

test("step 1 commits the intent as pending, with the invoice and amount, before any broadcast", () => {
  const data = committedPendingData({ workOrderId: "wo-1", amountMicros: 5_000_000n, chain: "solana", pricing: PRICING });
  assert.equal(data.status, "processing");
  assert.equal(data.decisionClass, "AMBER");
  assert.equal(data.reasonCode, "SETTLEMENT_PENDING");
  assert.equal(data.workOrderId, "wo-1");
  assert.equal(data.amountMicros, 5_000_000n);
  assert.equal(data.digest, null);
});

test("when the witness RPC lags (confirmation timeout), the invoice stays discharged and the intent stays pending with its id", async () => {
  const db = database();
  const timeout = new PayoutRailError("SOLANA_EXECUTION_FAILED", "did not confirm on both RPC endpoints", { outcome: "unknown" });
  const row = await settle(db, timeout);

  assert.equal(row.status, "processing");
  assert.equal(row.decisionClass, "AMBER");
  assert.equal(row.reasonCode, "SETTLEMENT_PENDING");
  assert.equal(row.digest, SIGNATURE, "the transaction id was stored before the broadcast");
  assert.match(row.explorerUrl, new RegExp(SIGNATURE));
  assert.equal(db.workOrders.get("wo-1").status, "discharged", "the invoice is not reopened: the transfer may have landed");
  assert.equal(db.workOrders.get("wo-1").dischargedByIntentId, "intent-1");
  assert.equal(db.writes.some((write) => write.table === "workOrder"), false, "no write touched the invoice");
  assert.equal(db.writes.some((write) => write.data.status === "refused"), false, "never written refused");
});

test("an RPC split, a send that threw, and a plain Error are all 'unknown': pending, invoice closed", async () => {
  for (const ending of [
    new PayoutRailError("SOLANA_RPC_QUORUM_FAILED", "endpoints disagreed", { outcome: "unknown" }),
    new PayoutRailError("SOLANA_EXECUTION_FAILED", "could not be sent", { outcome: "unknown" }),
    new PayoutRailError("SOLANA_EXECUTION_FAILED", "no outcome given"),
    new Error("socket hang up")
  ]) {
    const db = database();
    const row = await settle(db, ending);
    assert.equal(row.reasonCode, "SETTLEMENT_PENDING", ending.message);
    assert.equal(db.workOrders.get("wo-1").status, "discharged", ending.message);
  }
});

test("only a proven failure reopens the invoice: chain rejection or nothing sent", async () => {
  for (const ending of [
    new PayoutRailError("SOLANA_EXECUTION_FAILED", "was rejected", { outcome: "rejected" }),
    notSent(new PayoutRailError("SOLANA_PRIVATE_KEY_MISSING", "no key"), "SOLANA_EXECUTION_FAILED"),
    notSent(new Error("dns"), "SOLANA_EXECUTION_FAILED")
  ]) {
    const db = database();
    const row = await settle(db, ending);
    assert.equal(row.status, "refused", ending.message);
    assert.equal(row.decisionClass, "RED");
    assert.equal(row.reasonCode, "SETTLEMENT_FAILED");
    assert.equal(db.workOrders.get("wo-1").status, "open", "the invoice is given back");
    assert.equal(db.workOrders.get("wo-1").dischargedByIntentId, null);
  }
  const reopen = db => db.writes.find((write) => write.table === "workOrder");
  const db = database();
  await settle(db, new PayoutRailError("SOLANA_EXECUTION_FAILED", "was rejected", { outcome: "rejected" }));
  assert.deepEqual(reopen(db).where, { id: "wo-1", dischargedByIntentId: "intent-1" }, "only this intent's own discharge is undone");
});

test("both RPCs confirming marks the committed intent PAID with the same id that was stored first", async () => {
  const db = database();
  const row = await settle(db, null);
  assert.equal(row.status, "settled");
  assert.equal(row.decisionClass, "PAID");
  assert.equal(row.reasonCode, null);
  assert.equal(row.digest, SIGNATURE);
  const order = db.writes.filter((write) => write.table === "payoutIntent").map((write) => write.data.status ?? `stored:${write.data.digest}`);
  assert.deepEqual(order, [`stored:${SIGNATURE}`, "settled"], "id stored, then paid");
});

test("afterSettlementFailure and settlementProvenFailed treat anything unproven as 'the money may have moved'", () => {
  assert.equal(settlementProvenFailed(new Error("x")), false);
  assert.equal(settlementProvenFailed(new PayoutRailError("SOLANA_EXECUTION_FAILED", "x")), false);
  assert.equal(settlementProvenFailed(new PayoutRailError("SOLANA_EXECUTION_FAILED", "x", { outcome: "rejected" })), true);
  assert.equal(settlementProvenFailed(new PayoutRailError("SOLANA_EXECUTION_FAILED", "x", { outcome: "not_sent" })), true);
  assert.deepEqual(afterSettlementFailure(new Error("x")), {
    reopenInvoice: false, status: "processing", decisionClass: "AMBER", reasonCode: "SETTLEMENT_PENDING"
  });
  assert.deepEqual(afterSettlementFailure(new PayoutRailError("SOLANA_EXECUTION_FAILED", "x", { outcome: "rejected" })), {
    reopenInvoice: true, status: "refused", decisionClass: "RED", reasonCode: "SETTLEMENT_FAILED"
  });
});

test("confirmPayoutQuorum says what each failure proves", async () => {
  const confirmed = { err: null, confirmationStatus: "confirmed" };
  const rejected = { err: { InstructionError: [1, "Custom"] }, confirmationStatus: "confirmed" };
  const outcomeOf = (readStatus, options) =>
    confirmPayoutQuorum("sig", readStatus, { polls: 2, sleep: async () => {}, ...options }).then(
      () => "confirmed",
      (error) => error.outcome
    );

  assert.equal(await outcomeOf(async () => confirmed), "confirmed");
  assert.equal(await outcomeOf(async () => rejected), "rejected", "both endpoints report a chain error");
  assert.equal(await outcomeOf(async (which) => (which === "primary" ? confirmed : rejected)), "unknown", "a split proves nothing");
  assert.equal(await outcomeOf(async () => null), "unknown", "a timeout while the blockhash is still valid: it may still land");
  assert.equal(await outcomeOf(async (which) => (which === "primary" ? confirmed : null)), "unknown", "one endpoint sees it");
  assert.equal(await outcomeOf(async () => null, { blockhashExpired: () => true }), "rejected", "expired and never seen by either endpoint");
  assert.equal(
    await outcomeOf(async (which) => (which === "primary" ? { err: null, confirmationStatus: "processed" } : null), { blockhashExpired: () => true }),
    "unknown",
    "expired but one endpoint has seen it: not proof"
  );
});

test("the Solana rail's stored transaction id is the signature the chain will know it by", () => {
  const payer = Keypair.generate();
  const tx = new Transaction();
  tx.add(new TransactionInstruction({ keys: [], programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), data: Buffer.from("x") }));
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  assert.equal(signedTransactionId(tx), bs58.encode(tx.signature));
  assert.throws(() => signedTransactionId(new Transaction()), (error) => error.outcome === "not_sent");
});

test("neither the engine nor the override route sends money inside a database transaction any more", () => {
  for (const [name, source] of [["engine", engineSource], ["override", overrideSource]]) {
    const commit = source.indexOf("committedPendingData(");
    const settle = source.indexOf("settleCommittedIntent(prisma");
    assert.ok(commit > 0 && settle > commit, `${name}: commit first, then settle`);
    assert.doesNotMatch(source, /\.send\(\{/, `${name}: no direct rail send`);
    assert.doesNotMatch(source, /timeout: 120_000/, `${name}: no 120 s transaction window for a network call`);
  }
});
