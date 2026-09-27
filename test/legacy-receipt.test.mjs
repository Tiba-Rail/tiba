import assert from "node:assert/strict";
import test from "node:test";
import { coinSymbol, microsToCoin, receiptNetwork } from "../src/lib/receipt-network.ts";

test("legacy receipt network is derived from the stored chain without enabling a legacy rail", () => {
  assert.equal(receiptNetwork("solana"), "Solana devnet");
  assert.equal(receiptNetwork("tempo"), "Tempo testnet");
  assert.equal(receiptNetwork("zcash"), "Zcash testnet");
  assert.equal(receiptNetwork("sui"), "Sui testnet");
  assert.equal(receiptNetwork(null), "No transfer attempted");
  assert.equal(receiptNetwork("mock"), "Simulated, no transfer");
  assert.equal(receiptNetwork("sandbox"), "Sandbox try, nothing sent");
});

test("the coin shown is the one the rail actually settles in, not always USDC", () => {
  assert.equal(coinSymbol("solana"), "USDC");
  assert.equal(coinSymbol("tempo"), "pathUSD");
  assert.equal(coinSymbol("zcash"), "TAZ");
  assert.equal(coinSymbol("mock"), "USDC");
  assert.equal(coinSymbol(null), "USDC");
});

test("microsToCoin keeps microsToUsdc's digits but swaps in the right coin name", () => {
  assert.equal(microsToCoin(10_000n, "tempo"), "0.01 pathUSD");
  assert.equal(microsToCoin(1_000n, "zcash"), "0.001 TAZ");
  assert.equal(microsToCoin(1_000_000n, "solana"), "1.00 USDC");
});
