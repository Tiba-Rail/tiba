import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { encodeBase58, isBase58Signature } from "../src/lib/rails/base58.ts";
import { solanaExplorerTxUrl } from "../src/lib/rails/solana.ts";
import { SOLANA_DEVNET_CAIP2 } from "../src/lib/x402/required.ts";
import { treasurySignatureOf, x402SettlementProven } from "../src/lib/x402/settlement-proof.ts";
import { signExactSvmPayment } from "../src/lib/x402/svm.ts";

const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");

function accepted(payer, payTo, feePayer) {
  return {
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    amount: "10000",
    asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    payTo: payTo.publicKey.toBase58(),
    maxTimeoutSeconds: 60,
    extra: { feePayer: feePayer.publicKey.toBase58(), recentBlockhash: Keypair.generate().publicKey.toBase58() }
  };
}

test("encodeBase58 matches the reference encoder, including leading zeros", () => {
  for (const bytes of [
    Uint8Array.from([0]),
    Uint8Array.from([0, 0, 1]),
    Uint8Array.from([255]),
    randomBytes(64),
    randomBytes(32),
    Uint8Array.from(randomBytes(64)).fill(0, 0, 3)
  ]) {
    assert.equal(encodeBase58(bytes), bs58.encode(bytes));
  }
  assert.equal(isBase58Signature(bs58.encode(randomBytes(64))), true);
  assert.equal(isBase58Signature("x402txsig11111111111111111111111111111111111111111111111111111111"), false, "'0' is not base58");
  assert.equal(isBase58Signature("pendingdigest"), false, "too short");
  assert.equal(isBase58Signature("0OIl" + "1".repeat(60)), false, "0, O, I and l are not base58");
  assert.equal(isBase58Signature("javascript:alert(1)//" + "1".repeat(50)), false);
});

test("treasurySignatureOf reads Tiba's own signature out of the partially signed transaction", async () => {
  const payer = Keypair.generate();
  const payTo = Keypair.generate();
  const feePayer = Keypair.generate();
  const serialized = await signExactSvmPayment(payer, accepted(payer, payTo, feePayer));
  const tx = VersionedTransaction.deserialize(Buffer.from(serialized, "base64"));
  const payerIndex = tx.message.staticAccountKeys.findIndex((key) => key.equals(payer.publicKey));
  assert.ok(payerIndex > 0, "the fee payer, not Tiba, is the first signer");

  assert.equal(treasurySignatureOf(serialized, payer.publicKey), bs58.encode(tx.signatures[payerIndex]));
  assert.equal(treasurySignatureOf(serialized, feePayer.publicKey), null, "the facilitator has not signed yet");
  assert.equal(treasurySignatureOf(serialized, Keypair.generate().publicKey), null, "a stranger is not in the transaction");
  assert.equal(treasurySignatureOf("not base64 at all", payer.publicKey), null);
});

test("a seller's PAYMENT-RESPONSE alone never proves a settlement", async () => {
  const ours = bs58.encode(randomBytes(64));
  const txid = bs58.encode(randomBytes(64));
  const calls = [];
  const chain = (answer) => async (signature) => {
    calls.push(signature);
    return typeof answer === "function" ? answer() : answer;
  };

  // The seller's id is not on chain.
  assert.equal(await x402SettlementProven(txid, ours, chain(null)), false);
  // On chain, but it failed.
  assert.equal(await x402SettlementProven(txid, ours, chain({ err: { InstructionError: [2, "Custom"] }, signatures: [txid, ours] })), false);
  // On chain and fine, but it is someone else's transaction: Tiba never signed it.
  assert.equal(await x402SettlementProven(txid, ours, chain({ err: null, signatures: [txid, bs58.encode(randomBytes(64))] })), false);
  // The RPC is down: not proof either.
  assert.equal(await x402SettlementProven(txid, ours, chain(() => { throw new Error("rpc down"); })), false);
  // A made-up id never reaches the chain at all.
  assert.equal(await x402SettlementProven("made-up-transaction", ours, chain({ err: null, signatures: [ours] })), false);
  assert.equal(await x402SettlementProven(txid, null, chain({ err: null, signatures: [txid, ours] })), false, "no expected signature, no proof");
  assert.equal(calls.includes("made-up-transaction"), false);

  // The only way to PAID: confirmed, no error, and Tiba's signature is one of the signers.
  assert.equal(await x402SettlementProven(txid, ours, chain({ err: null, signatures: [txid, ours] })), true);
});

test("finalizeX402Settlement marks PAID only when the chain proves it, and links only base58 ids", () => {
  const start = engineSource.indexOf("export async function finalizeX402Settlement");
  const body = engineSource.slice(start);
  assert.ok(start > 0);
  assert.match(body, /x402SettlementProven\(digest, expectedSignature, readTransaction\)/);
  assert.match(body, /if \(proven\) \{/, "the PAID branch is gated on proof, not on settlement.success");
  assert.match(body, /isBase58Signature\(reported\)/);
  assert.doesNotMatch(body.slice(0, body.indexOf("if (proven)")), /if \(settlement\.success\)/);
  assert.equal(
    solanaExplorerTxUrl("x402txsig11111111111111111111111111111111111111111111111111111111"),
    "https://explorer.solana.com/tx/x402txsig11111111111111111111111111111111111111111111111111111111?cluster=devnet"
  );
  assert.doesNotMatch(solanaExplorerTxUrl("../../evil?x=1#"), /\.\.\/|\?x=1#/);
});
