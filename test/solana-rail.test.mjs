import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { chainForRecipient, settlementFromReceipt } from "../src/lib/rails/index.ts";
import {
  assertTreasuryMatchesKey,
  buildSolanaPayoutTransaction,
  createSolanaRail,
  isRetryableRpcError,
  quorumResult,
  reconcileSignatureQuorum,
  solanaRail,
  solanaRpcUrls
} from "../src/lib/rails/solana.ts";

const RECIPIENT = Keypair.generate().publicKey.toBase58();

function payoutError(code) {
  return (error) => {
    assert.equal(error.name, "PayoutRailError");
    assert.equal(error.code, code);
    return true;
  };
}

test("Solana rail refuses to run outside devnet before network access", async () => {
  const keys = ["SOLANA_NETWORK", "SOLANA_CLUSTER", "SOLANA_PRIVATE_KEY"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.SOLANA_NETWORK = "mainnet-beta";
  delete process.env.SOLANA_CLUSTER;
  delete process.env.SOLANA_PRIVATE_KEY;
  try {
    await assert.rejects(
      () => solanaRail.send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "network-guard-test" }),
      payoutError("SOLANA_NETWORK_NOT_DEVNET")
    );
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("Solana transaction builder rejects a non-base58 recipient", () => {
  const payer = Keypair.generate().publicKey;
  for (const recipientAddress of ["0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef", "not-an-address"]) {
    assert.throws(
      () => buildSolanaPayoutTransaction([{ recipientAddress, amountMicros: 1n, intentId: "bad-address" }], payer),
      payoutError("INVALID_PAYOUT")
    );
  }
});

test("Solana transaction builder rejects amountMicros <= 0n", () => {
  const payer = Keypair.generate().publicKey;
  for (const amountMicros of [0n, -1n]) {
    assert.throws(
      () => buildSolanaPayoutTransaction([{ recipientAddress: RECIPIENT, amountMicros, intentId: "bad-amount" }], payer),
      payoutError("INVALID_PAYOUT")
    );
  }
});

test("Solana transaction has one memo plus an ATA create and a transfer per payout", () => {
  const payer = Keypair.generate().publicKey;
  const tx = buildSolanaPayoutTransaction([
    { recipientAddress: RECIPIENT, amountMicros: 10_000n, intentId: "intent-a" },
    { recipientAddress: Keypair.generate().publicKey.toBase58(), amountMicros: 2_000n, intentId: "intent-b" }
  ], payer);

  assert.equal(tx.instructions.length, 5);
  const [memo, ...rest] = tx.instructions;
  assert.equal(memo.programId.toBase58(), "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  assert.equal(memo.data.toString("utf-8"), "Tiba payout intent-a; Tiba payout intent-b");
  const ataProgram = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  assert.deepEqual(rest.map((ix) => ix.programId.toBase58()), [ataProgram, tokenProgram, ataProgram, tokenProgram]);
});

test("chainForRecipient requires a Solana address", () => {
  assert.deepEqual(chainForRecipient({ solanaAddress: RECIPIENT }), { chain: "solana", address: RECIPIENT });
  assert.equal(chainForRecipient({ solanaAddress: "" }), null);
  assert.equal(chainForRecipient({ solanaAddress: null }), null);
});

function withEnv(vars, fn) {
  const keys = Object.keys(vars);
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

async function withEnvAsync(vars, fn) {
  const keys = Object.keys(vars);
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function confirmedStatus() {
  return { err: null, confirmationStatus: "confirmed" };
}

function retryable(message = "fetch failed") {
  return Object.assign(new Error(message), { code: "ECONNREFUSED" });
}

function mockRpc(url, options = {}) {
  let sendCalls = 0;
  const client = {
    url,
    sendCalls: () => sendCalls,
    async getLatestBlockhash() {
      if (options.blockhashError) throw options.blockhashError;
      return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 };
    },
    async sendRawTransaction() {
      sendCalls += 1;
      if (options.sendError) throw options.sendError;
      return options.sendSignature ?? `sig-${url}`;
    },
    async confirmTransaction() {
      return { value: { err: null } };
    },
    async getSignatureStatuses() {
      if (options.statusError) throw options.statusError;
      return { value: [options.status === undefined ? confirmedStatus() : options.status] };
    }
  };
  return client;
}

function signingEnv(keypair, extra = {}) {
  return {
    SOLANA_NETWORK: "devnet",
    SOLANA_CLUSTER: undefined,
    SOLANA_PRIVATE_KEY: JSON.stringify(Array.from(keypair.secretKey)),
    SOLANA_ADDRESS: keypair.publicKey.toBase58(),
    TREASURY_ADDRESS: keypair.publicKey.toBase58(),
    ...extra
  };
}

test("SOLANA_RPC_URLS is the list and SOLANA_RPC_URL is the single-entry fallback", () => {
  withEnv({
    SOLANA_RPC_URLS: "https://a.example, https://b.example, https://a.example/",
    SOLANA_RPC_URL: "https://ignored.example"
  }, () => {
    assert.deepEqual(solanaRpcUrls(), ["https://a.example", "https://b.example"]);
  });
  withEnv({ SOLANA_RPC_URLS: undefined, SOLANA_RPC_URL: "https://one.example" }, () => {
    assert.deepEqual(solanaRpcUrls(), ["https://one.example"]);
  });
});

test("quorum needs two confirmed endpoints to mark paid", () => {
  assert.equal(quorumResult(2), "confirmed");
  assert.equal(quorumResult(1), "pending");
  assert.equal(quorumResult(0), "unconfirmed");
  assert.equal(isRetryableRpcError(retryable()), true);
  assert.equal(isRetryableRpcError(Object.assign(new Error("insufficient funds"), { code: "ERR_INSUFFICIENT" })), false);
});

test("two RPCs both confirm the signature -> paid", async () => {
  const keypair = Keypair.generate();
  const a = mockRpc("https://rpc-a.test", { sendSignature: "sig-both" });
  const b = mockRpc("https://rpc-b.test", { sendSignature: "sig-unused" });
  await withEnvAsync(signingEnv(keypair), async () => {
    const receipt = await createSolanaRail([a, b]).send({
      recipientAddress: RECIPIENT,
      amountMicros: 1n,
      intentId: "quorum-both"
    });
    assert.equal(receipt.digest, "sig-both");
    assert.equal(receipt.confirmation, "confirmed");
    assert.equal(a.sendCalls(), 1);
    assert.equal(b.sendCalls(), 0);
    assert.equal(settlementFromReceipt(receipt).status, "settled");
    assert.equal(settlementFromReceipt(receipt).decisionClass, "PAID");
  });
});

test("one RPC confirms the signature -> pending confirmation, not paid", async () => {
  const keypair = Keypair.generate();
  const a = mockRpc("https://rpc-a.test", { sendSignature: "sig-one", status: confirmedStatus() });
  const b = mockRpc("https://rpc-b.test", { status: null });
  await withEnvAsync(signingEnv(keypair), async () => {
    const receipt = await createSolanaRail([a, b]).send({
      recipientAddress: RECIPIENT,
      amountMicros: 1n,
      intentId: "quorum-one"
    });
    assert.equal(receipt.digest, "sig-one");
    assert.equal(receipt.confirmation, "pending");
    const settlement = settlementFromReceipt(receipt);
    assert.equal(settlement.status, "pending_confirmation");
    assert.equal(settlement.decisionClass, "AMBER");
    assert.equal(settlement.reasonCode, "PENDING_RPC_QUORUM");
    assert.equal(await reconcileSignatureQuorum("sig-one", [a, b]), "pending");
  });
});

test("primary send fails on network error then fallback send works", async () => {
  const keypair = Keypair.generate();
  const a = mockRpc("https://rpc-a.test", { sendError: retryable(), status: confirmedStatus() });
  const b = mockRpc("https://rpc-b.test", { sendSignature: "sig-fallback", status: confirmedStatus() });
  await withEnvAsync(signingEnv(keypair), async () => {
    const receipt = await createSolanaRail([a, b]).send({
      recipientAddress: RECIPIENT,
      amountMicros: 1n,
      intentId: "fallback-send"
    });
    assert.equal(receipt.digest, "sig-fallback");
    assert.equal(a.sendCalls(), 1);
    assert.equal(b.sendCalls(), 1);
    assert.equal(receipt.confirmation, "confirmed");
  });
});

test("all RPC sends fail -> SOLANA_EXECUTION_FAILED as today", async () => {
  const keypair = Keypair.generate();
  const a = mockRpc("https://rpc-a.test", { sendError: retryable() });
  const b = mockRpc("https://rpc-b.test", { sendError: Object.assign(new Error("bad gateway"), { status: 502 }) });
  await withEnvAsync(signingEnv(keypair), async () => {
    await assert.rejects(
      () => createSolanaRail([a, b]).send({
        recipientAddress: RECIPIENT,
        amountMicros: 1n,
        intentId: "all-fail"
      }),
      payoutError("SOLANA_EXECUTION_FAILED")
    );
  });
});

test("send lands but no RPC confirms -> SOLANA_EXECUTION_FAILED", async () => {
  const keypair = Keypair.generate();
  const a = mockRpc("https://rpc-a.test", { sendSignature: "sig-ghost", status: null });
  const b = mockRpc("https://rpc-b.test", { status: null });
  await withEnvAsync(signingEnv(keypair), async () => {
    await assert.rejects(
      () => createSolanaRail([a, b]).send({
        recipientAddress: RECIPIENT,
        amountMicros: 1n,
        intentId: "unconfirmed"
      }),
      payoutError("SOLANA_EXECUTION_FAILED")
    );
  });
});

test("treasury address mismatch fails loudly before send", async () => {
  const keypair = Keypair.generate();
  const other = Keypair.generate().publicKey.toBase58();
  await withEnvAsync({
    ...signingEnv(keypair),
    SOLANA_ADDRESS: other,
    TREASURY_ADDRESS: other
  }, async () => {
    assert.throws(() => assertTreasuryMatchesKey(), payoutError("SOLANA_ADDRESS_MISMATCH"));
    await assert.rejects(
      () => solanaRail.send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "mismatch" }),
      payoutError("SOLANA_ADDRESS_MISMATCH")
    );
  });
});

test("TREASURY_ADDRESS and SOLANA_ADDRESS must agree with each other", () => {
  const keypair = Keypair.generate();
  withEnv({
    ...signingEnv(keypair),
    TREASURY_ADDRESS: Keypair.generate().publicKey.toBase58()
  }, () => {
    assert.throws(() => assertTreasuryMatchesKey(), payoutError("SOLANA_ADDRESS_MISMATCH"));
  });
});
