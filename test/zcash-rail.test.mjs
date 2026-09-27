import assert from "node:assert/strict";
import test from "node:test";
import { payoutRail } from "../src/lib/rails/index.ts";
import { zcashExplorerTxUrl, zcashPayoutMemo, zcashRail } from "../src/lib/rails/zcash.ts";
import { receiptNetwork, receiptViewingKeyNote } from "../src/lib/receipt-network.ts";

function payoutError(code) {
  return (error) => {
    assert.equal(error.name, "PayoutRailError");
    assert.equal(error.code, code);
    return true;
  };
}

test("Zcash explorer link points at the testnet transaction", () => {
  const txid = "6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac";
  assert.equal(zcashExplorerTxUrl(txid), `https://testnet.cipherscan.app/tx/${txid}`);
});

test("Zcash memo carries the work-order id the way the Solana memo does", () => {
  assert.equal(zcashPayoutMemo("WO-ZCASH-SPIKE-1"), "Tiba payout WO-ZCASH-SPIKE-1");
});

test("Zcash receipt says the viewing key is available on request", () => {
  assert.equal(receiptNetwork("zcash"), "Zcash testnet");
  assert.equal(receiptViewingKeyNote("zcash"), "viewing key available on request");
  assert.equal(receiptViewingKeyNote("solana"), null);
});

test("Zcash rail refuses to run off testnet before it looks for a wallet", async () => {
  const saved = process.env.ZCASH_NETWORK;
  process.env.ZCASH_NETWORK = "mainnet";
  try {
    await assert.rejects(
      () => zcashRail.send({ recipientAddress: "utest1example", amountMicros: 1n, intentId: "network-guard" }),
      payoutError("ZCASH_NETWORK_NOT_TESTNET")
    );
    await assert.rejects(
      () => payoutRail("zcash").send({ recipientAddress: "utest1example", amountMicros: 1n, intentId: "network-guard" }),
      payoutError("ZCASH_NETWORK_NOT_TESTNET")
    );
  } finally {
    if (saved === undefined) delete process.env.ZCASH_NETWORK;
    else process.env.ZCASH_NETWORK = saved;
  }
});

test("Zcash rail rejects a transparent address and a non-positive amount before sending", async () => {
  const saved = process.env.ZCASH_NETWORK;
  process.env.ZCASH_NETWORK = "testnet";
  try {
    await assert.rejects(
      () => zcashRail.send({ recipientAddress: "tmRa4oc5E8c9hC6oNXA1cCrLp6HLURsDkZC", amountMicros: 1n, intentId: "transparent" }),
      payoutError("INVALID_PAYOUT")
    );
    await assert.rejects(
      () => zcashRail.send({ recipientAddress: "utest1recipient", amountMicros: 0n, intentId: "zero" }),
      payoutError("INVALID_PAYOUT")
    );
  } finally {
    if (saved === undefined) delete process.env.ZCASH_NETWORK;
    else process.env.ZCASH_NETWORK = saved;
  }
});

test("Zcash rail sends one payment at a time", async () => {
  await assert.rejects(() => zcashRail.batch([]), payoutError("INVALID_PAYOUT"));
});
