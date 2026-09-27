import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { chainForRecipient } from "../src/lib/rails/index.ts";
import {
  SOLANA_DEVNET_RPC,
  SOLANA_DEVNET_RPC_WITNESS,
  buildSolanaPayoutTransaction,
  confirmPayoutQuorum,
  quorumOutcome,
  rpcEndpointsAreIndependent,
  solanaRail,
  solanaRpcEndpoints
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

test("default Solana RPC endpoints are two different devnet nodes", () => {
  const keys = ["SOLANA_RPC_URL", "SOLANA_RPC_URL_2"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.SOLANA_RPC_URL;
  delete process.env.SOLANA_RPC_URL_2;
  try {
    const endpoints = solanaRpcEndpoints();
    assert.equal(endpoints.primary, SOLANA_DEVNET_RPC);
    assert.equal(endpoints.witness, SOLANA_DEVNET_RPC_WITNESS);
    assert.equal(rpcEndpointsAreIndependent(endpoints.primary, endpoints.witness), true);
    assert.equal(rpcEndpointsAreIndependent("https://api.devnet.solana.com/", "https://api.devnet.solana.com"), false);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("rpc quorum pays only when both endpoints report the same success", () => {
  const confirmed = { err: null, confirmationStatus: "confirmed" };
  const finalized = { err: null, confirmationStatus: "finalized" };
  const rejected = { err: { InstructionError: [0, "Custom"] }, confirmationStatus: "confirmed" };
  assert.equal(quorumOutcome(confirmed, finalized), "confirmed");
  assert.equal(quorumOutcome(confirmed, null), "pending");
  assert.equal(quorumOutcome(null, null), "pending");
  assert.equal(quorumOutcome(confirmed, rejected), "split");
  assert.equal(quorumOutcome(rejected, confirmed), "split");
  assert.equal(quorumOutcome(rejected, rejected), "rejected");
  assert.equal(quorumOutcome({ err: null, confirmationStatus: "processed" }, confirmed), "pending");
});

test("confirmPayoutQuorum refuses a witness that disagrees", async () => {
  await assert.rejects(
    () => confirmPayoutQuorum(
      "sig-split",
      async (which) => which === "primary"
        ? { err: null, confirmationStatus: "confirmed" }
        : { err: "rejected", confirmationStatus: "confirmed" },
      { polls: 1, sleep: async () => {} }
    ),
    payoutError("SOLANA_RPC_QUORUM_FAILED")
  );
});

test("confirmPayoutQuorum waits until a slow witness agrees", async () => {
  let witnessReads = 0;
  await confirmPayoutQuorum(
    "sig-lag",
    async (which) => {
      if (which === "primary") return { err: null, confirmationStatus: "confirmed" };
      witnessReads += 1;
      return witnessReads < 2 ? null : { err: null, confirmationStatus: "finalized" };
    },
    { polls: 3, sleep: async () => {} }
  );
  assert.equal(witnessReads, 2);
});
