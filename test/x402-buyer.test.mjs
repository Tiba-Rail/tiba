import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { evaluateBeforeDebit } from "../src/lib/policy.ts";
import { reconcile } from "../src/lib/reconcile.ts";
import { SOLANA_USDC_DEVNET_MINT } from "../src/lib/rails/solana.ts";
import { decodePaymentRequired, decodeSettlementResponse, encodeBase64Json, encodePaymentSignature } from "../src/lib/x402/headers.ts";
import { pickSolanaUsdcAccept, SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2 } from "../src/lib/x402/required.ts";
import { clearedToSignX402, payX402Resource } from "../src/lib/x402/buyer.ts";
import { signExactSvmPayment } from "../src/lib/x402/svm.ts";

const MINT = SOLANA_USDC_DEVNET_MINT;
const AMOUNT = "10000";
const NOW = new Date("2026-09-17T00:00:00.000Z");
const TOMORROW = "2026-09-18T00:00:00.000Z";

function keys() {
  return {
    payer: Keypair.generate(),
    payTo: Keypair.generate(),
    feePayer: Keypair.generate()
  };
}

function acceptedFor(addresses, extra = {}) {
  return {
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    amount: AMOUNT,
    asset: MINT,
    payTo: addresses.payTo.publicKey.toBase58(),
    maxTimeoutSeconds: 60,
    extra: {
      feePayer: addresses.feePayer.publicKey.toBase58(),
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      ...extra
    }
  };
}

function resourceInfo(url) {
  return { url, description: "premium market data", mimeType: "application/json" };
}

function blankIntent(overrides) {
  return {
    id: "intent-1",
    status: "processing",
    decisionClass: "AMBER",
    reasonCode: null,
    digest: null,
    explorerUrl: null,
    publicToken: "tok-1",
    chain: "solana",
    signature: null,
    x402Routed: true,
    ...overrides
  };
}

function policyAgent(killSwitch = false) {
  return {
    id: "agent-1",
    ceilingMicros: 100_000n,
    hourCapMicros: 100_000n,
    dayCapMicros: 100_000n,
    hourCountCap: 10,
    dayCountCap: 10,
    killSwitch
  };
}

function workOrder() {
  return { id: "wo-1", ceilingMicros: 10_000n, status: "open", expiresAt: TOMORROW };
}

function matchingTuples() {
  return {
    artifact: { workOrderId: "X402-test", amountMicros: 10_000n, deliveryTimestamp: NOW.toISOString() },
    payer_record: { workOrderId: "X402-test", amountMicros: 10_000n, deliveryTimestamp: NOW.toISOString() }
  };
}

function runGate({ killSwitch = false, split = false } = {}) {
  const events = [];
  const twoChannel = split
    ? reconcile("both", {
        artifact: { ...matchingTuples().artifact, amountMicros: 99_999n },
        payer_record: matchingTuples().payer_record
      })
    : reconcile("both", matchingTuples());
  events.push({ type: "two-channel", ok: twoChannel.ok, reasonCode: twoChannel.ok ? null : twoChannel.reasonCode });
  if (!twoChannel.ok) {
    return {
      events,
      intent: blankIntent({
        status: "refused",
        decisionClass: "RED",
        reasonCode: twoChannel.reasonCode,
        x402Routed: false
      })
    };
  }
  const policy = evaluateBeforeDebit({
    agent: policyAgent(killSwitch),
    workOrder: workOrder(),
    recipientActive: true,
    amountMicros: 10_000n,
    now: NOW
  });
  events.push({ type: "policy", ok: policy.ok, reasonCode: policy.ok ? null : policy.reasonCode });
  if (!policy.ok) {
    return {
      events,
      intent: blankIntent({
        status: "refused",
        decisionClass: "RED",
        reasonCode: policy.reasonCode,
        x402Routed: false
      })
    };
  }
  return { events, intent: blankIntent() };
}

function startMock402({ accepted, resource, settle = { success: true, transaction: "x402txsig11111111111111111111111111111111111111111111111111111111", network: SOLANA_DEVNET_CAIP2 } }) {
  const signedRequests = [];
  const server = http.createServer((req, res) => {
    const signature = req.headers["payment-signature"];
    if (!signature) {
      res.writeHead(402, {
        "content-type": "application/json",
        "PAYMENT-REQUIRED": encodeBase64Json({
          x402Version: 2,
          error: "PAYMENT-SIGNATURE header is required",
          resource,
          accepts: [accepted, { scheme: "exact", network: "eip155:84532", amount: "1", asset: "0xabc", payTo: "0xdef", maxTimeoutSeconds: 60 }]
        })
      });
      res.end("{}");
      return;
    }
    signedRequests.push(String(signature));
    res.writeHead(settle.success ? 200 : 402, {
      "content-type": "application/json",
      "PAYMENT-RESPONSE": encodeBase64Json(settle)
    });
    res.end(JSON.stringify({ data: "premium" }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/premium`,
        signedRequests,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

test("PAYMENT-REQUIRED round-trips as v2 Base64 JSON", () => {
  const required = {
    x402Version: 2,
    resource: { url: "https://api.example.com/premium" },
    accepts: [{ scheme: "exact", network: SOLANA_DEVNET_CAIP2, amount: AMOUNT, asset: MINT, payTo: "Pay", maxTimeoutSeconds: 60 }]
  };
  const decoded = decodePaymentRequired(encodeBase64Json(required));
  assert.equal(decoded.x402Version, 2);
  assert.equal(decoded.resource.url, "https://api.example.com/premium");
  assert.equal(decoded.accepts.length, 1);
});

test("pickSolanaUsdcAccept takes Solana devnet USDC and skips mainnet or the wrong mint", () => {
  const addresses = keys();
  const good = acceptedFor(addresses);
  assert.equal(pickSolanaUsdcAccept([good])?.payTo, good.payTo);
  assert.equal(
    pickSolanaUsdcAccept([{ ...good, network: SOLANA_MAINNET_CAIP2 }]),
    null
  );
  assert.equal(
    pickSolanaUsdcAccept([{ ...good, asset: addresses.payTo.publicKey.toBase58() }]),
    null
  );
  assert.equal(pickSolanaUsdcAccept([{ ...good, extra: {} }]), null);
  assert.equal(pickSolanaUsdcAccept([{ ...good, network: "solana:devnet" }])?.asset, MINT);
});

test("exact SVM tx is a partially signed VersionedTransaction with facilitator as fee-payer", async () => {
  const addresses = keys();
  const accepted = acceptedFor(addresses);
  const serialized = await signExactSvmPayment(addresses.payer, accepted);
  const tx = VersionedTransaction.deserialize(Buffer.from(serialized, "base64"));
  const accountKeys = tx.message.staticAccountKeys.map((key) => key.toBase58());
  assert.equal(accountKeys[0], addresses.feePayer.publicKey.toBase58());
  assert.ok(tx.signatures[0].every((byte) => byte === 0), "facilitator has not signed");
  assert.ok(tx.signatures.some((sig) => sig.some((byte) => byte !== 0)), "buyer has signed");
  const programs = tx.message.compiledInstructions.map((ix) => accountKeys[ix.programIdIndex]);
  assert.ok(programs.includes("ComputeBudget111111111111111111111111111111"));
  assert.ok(programs.includes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"));
  assert.ok(programs.includes("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"));
  for (const ix of tx.message.compiledInstructions) {
    assert.ok(
      !ix.accountKeyIndexes.includes(0),
      "fee-payer must not appear in instruction accounts"
    );
  }
});

test("clearedToSignX402 is true only after Tiba authorized an x402 intent", () => {
  assert.equal(clearedToSignX402(blankIntent()), true);
  assert.equal(clearedToSignX402(blankIntent({ x402Routed: false })), false);
  assert.equal(clearedToSignX402(blankIntent({ status: "refused", decisionClass: "RED", reasonCode: "KILL_SWITCH", x402Routed: false })), false);
  assert.equal(clearedToSignX402(blankIntent({ status: "held", decisionClass: "AMBER", x402Routed: false })), false);
});

test("buyer pays a local mock 402 end-to-end after two-channel and policy pass", async () => {
  const addresses = keys();
  const accepted = acceptedFor(addresses);
  const mock = await startMock402({ accepted, resource: resourceInfo("http://x402.test/premium") });
  const events = [];
  let recorded;
  try {
    const result = await payX402Resource(
      { id: "agent-1" },
      { url: mock.url, idempotency_key: randomUUID() },
      {
        fetch,
        ensureObligation: async () => {
          events.push("obligation");
          return { recipientRef: "seller", workOrderRef: "X402-test" };
        },
        authorize: async (_agent, body) => {
          events.push("gate");
          assert.match(body.artifact, /x402 resource request/);
          assert.match(body.artifact, /Work order: X402-test/);
          const gated = runGate();
          events.push(...gated.events.map((row) => row.type));
          assert.equal(gated.intent.x402Routed, true);
          return gated.intent;
        },
        signPayment: async (chosen) => {
          events.push("sign");
          return signExactSvmPayment(addresses.payer, chosen);
        },
        recordSettlement: async (intentId, settlement) => {
          events.push("record");
          recorded = settlement;
          return blankIntent({
            id: intentId,
            status: "settled",
            decisionClass: "PAID",
            digest: settlement.transaction,
            signature: settlement.transaction,
            x402Routed: true
          });
        }
      }
    );

    assert.equal(result.kind, "paid");
    assert.equal(result.intent.decisionClass, "PAID");
    assert.equal(result.intent.x402Routed, true);
    assert.equal(mock.signedRequests.length, 1);
    assert.deepEqual(events, ["obligation", "gate", "two-channel", "policy", "sign", "record"]);
    assert.equal(recorded.success, true);

    const payload = JSON.parse(Buffer.from(mock.signedRequests[0], "base64").toString("utf8"));
    const tx = VersionedTransaction.deserialize(Buffer.from(payload.payload.transaction, "base64"));
    assert.equal(tx.message.staticAccountKeys[0].toBase58(), addresses.feePayer.publicKey.toBase58());
    assert.ok(tx.signatures[0].every((byte) => byte === 0));
  } finally {
    await mock.close();
  }
});

test("policy-refused x402 never reaches the signature step or the seller", async () => {
  const addresses = keys();
  const accepted = acceptedFor(addresses);
  const mock = await startMock402({ accepted, resource: resourceInfo("http://x402.test/premium") });
  const events = [];
  try {
    const result = await payX402Resource(
      { id: "agent-1" },
      { url: mock.url, idempotency_key: randomUUID() },
      {
        fetch,
        ensureObligation: async () => ({ recipientRef: "seller", workOrderRef: "X402-test" }),
        authorize: async () => {
          events.push("gate");
          const gated = runGate({ killSwitch: true });
          events.push(...gated.events.map((row) => row.type));
          assert.equal(gated.intent.reasonCode, "KILL_SWITCH");
          return gated.intent;
        },
        signPayment: async () => {
          events.push("sign");
          throw new Error("sign must not run after a policy refusal");
        },
        recordSettlement: async () => {
          events.push("record");
          throw new Error("must not record an x402 settlement after a policy refusal");
        }
      }
    );

    assert.equal(result.kind, "refused");
    assert.equal(result.intent.reasonCode, "KILL_SWITCH");
    assert.equal(result.intent.x402Routed, false);
    assert.equal(mock.signedRequests.length, 0);
    assert.deepEqual(events, ["gate", "two-channel", "policy"]);
    assert.equal(events.includes("sign"), false);
  } finally {
    await mock.close();
  }
});

test("two-channel disagreement refuses before any x402 signature", async () => {
  const addresses = keys();
  const accepted = acceptedFor(addresses);
  const mock = await startMock402({ accepted, resource: resourceInfo("http://x402.test/premium") });
  const events = [];
  try {
    const result = await payX402Resource(
      { id: "agent-1" },
      { url: mock.url, idempotency_key: randomUUID() },
      {
        fetch,
        ensureObligation: async () => ({ recipientRef: "seller", workOrderRef: "X402-test" }),
        authorize: async () => {
          events.push("gate");
          const gated = runGate({ split: true });
          events.push(...gated.events.map((row) => row.type));
          return gated.intent;
        },
        signPayment: async () => {
          throw new Error("sign must not run after a quorum split");
        },
        recordSettlement: async () => {
          throw new Error("must not settle after a quorum split");
        }
      }
    );

    assert.equal(result.kind, "refused");
    assert.match(result.intent.reasonCode, /^QUORUM_SPLIT/);
    assert.equal(mock.signedRequests.length, 0);
    assert.equal(events.includes("sign"), false);
    assert.deepEqual(events, ["gate", "two-channel"]);
  } finally {
    await mock.close();
  }
});

test("PAYMENT-RESPONSE settlement_pending is recorded without treating it as paid", () => {
  const header = encodeBase64Json({
    success: false,
    errorReason: "settlement_pending",
    transaction: "pendingdigest",
    network: SOLANA_DEVNET_CAIP2
  });
  const decoded = decodeSettlementResponse(header);
  assert.equal(decoded.errorReason, "settlement_pending");
  assert.equal(decoded.success, false);
  assert.equal(decoded.transaction, "pendingdigest");
});

test("PAYMENT-SIGNATURE encodes the chosen accept and the signed transaction", () => {
  const addresses = keys();
  const accepted = acceptedFor(addresses);
  const header = encodePaymentSignature({
    x402Version: 2,
    resource: resourceInfo("https://api.example.com/premium"),
    accepted,
    payload: { transaction: "dHh0eA==" }
  });
  const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(parsed.x402Version, 2);
  assert.equal(parsed.accepted.network, SOLANA_DEVNET_CAIP2);
  assert.equal(parsed.payload.transaction, "dHh0eA==");
});
