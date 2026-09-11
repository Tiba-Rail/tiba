import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { chainForRecipient } from "../src/lib/rails/index.ts";
import { buildSolanaPayoutTransaction, solanaRail } from "../src/lib/rails/solana.ts";

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

test("chainForRecipient picks Solana, then Sui, then null, and treats empty as absent", () => {
  const sui = "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef";
  assert.deepEqual(chainForRecipient({ solanaAddress: RECIPIENT, suiAddress: sui }), { chain: "solana", address: RECIPIENT });
  assert.deepEqual(chainForRecipient({ solanaAddress: null, suiAddress: sui }), { chain: "sui", address: sui });
  assert.deepEqual(chainForRecipient({ solanaAddress: "", suiAddress: sui }), { chain: "sui", address: sui });
  assert.equal(chainForRecipient({ solanaAddress: "", suiAddress: "" }), null);
  assert.equal(chainForRecipient({ solanaAddress: null, suiAddress: null }), null);
});
