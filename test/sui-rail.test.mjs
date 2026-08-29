import assert from "node:assert/strict";
import test from "node:test";
import { suiRail } from "../src/lib/rails/sui.ts";

test("Sui rail refuses to run outside testnet before network access", async () => {
  const originalNetwork = process.env.SUI_NETWORK;
  const originalPrivateKey = process.env.SUI_PRIVATE_KEY;
  process.env.SUI_NETWORK = "devnet";
  delete process.env.SUI_PRIVATE_KEY;

  try {
    await assert.rejects(
      () => suiRail.send({
        recipientAddress: "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef",
        amountMicros: 1n,
        intentId: "network-guard-test"
      }),
      (error) => {
        assert.equal(error.name, "PayoutRailError");
        assert.equal(error.code, "SUI_NETWORK_NOT_TESTNET");
        return true;
      }
    );
  } finally {
    if (originalNetwork === undefined) {
      delete process.env.SUI_NETWORK;
    } else {
      process.env.SUI_NETWORK = originalNetwork;
    }
    if (originalPrivateKey === undefined) {
      delete process.env.SUI_PRIVATE_KEY;
    } else {
      process.env.SUI_PRIVATE_KEY = originalPrivateKey;
    }
  }
});

