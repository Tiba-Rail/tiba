import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair } from "@solana/web3.js";
import {
  chainForRecipient,
  configuredRail,
  executionFailedCode,
  payoutRail,
  recipientAddressReason,
  settledChain
} from "../src/lib/rails/index.ts";
import { prepareTempoPayouts, tempoExplorerTxUrl, tempoRail } from "../src/lib/rails/evm.ts";

const RECIPIENT = `0x${"ab".repeat(20)}`;
const SOLANA_RECIPIENT = Keypair.generate().publicKey.toBase58();

function payoutError(code) {
  return (error) => {
    assert.equal(error.name, "PayoutRailError");
    assert.equal(error.code, code);
    return true;
  };
}

const TEMPO_ENV = [
  "RAIL",
  "TEMPO_CHAIN_ID",
  "TEMPO_TREASURY_KEY",
  "TEMPO_TREASURY_ADDRESS",
  "TEMPO_RPC_URL",
  "TEMPO_STABLECOIN_ADDRESS",
  "TEMPO_EXPLORER_BASE"
];

function withEnv(values, fn) {
  const saved = Object.fromEntries(TEMPO_ENV.map((key) => [key, process.env[key]]));
  for (const key of TEMPO_ENV) delete process.env[key];
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of TEMPO_ENV) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });
}

describe("tempo rail", { concurrency: false }, () => {
  test("prepareTempoPayouts rejects a non-address, a non-positive amount, and an empty batch", () => {
    for (const recipientAddress of [SOLANA_RECIPIENT, "not-an-address", "0x1234"]) {
      assert.throws(
        () => prepareTempoPayouts([{ recipientAddress, amountMicros: 1n, intentId: "bad-address" }]),
        payoutError("INVALID_PAYOUT")
      );
    }
    for (const amountMicros of [0n, -1n]) {
      assert.throws(
        () => prepareTempoPayouts([{ recipientAddress: RECIPIENT, amountMicros, intentId: "bad-amount" }]),
        payoutError("INVALID_PAYOUT")
      );
    }
    assert.throws(() => prepareTempoPayouts([]), payoutError("INVALID_PAYOUT"));
  });

  test("prepareTempoPayouts checksums the recipient and keeps amountMicros", () => {
    const [payout] = prepareTempoPayouts([{ recipientAddress: RECIPIENT, amountMicros: 10_000n, intentId: "ok" }]);
    assert.equal(payout.amount, 10_000n);
    assert.equal(payout.recipient.toLowerCase(), RECIPIENT);
    assert.equal(payout.intentId, "ok");
  });

  test("explorer link uses the configured base", () => {
    assert.equal(
      tempoExplorerTxUrl("0xabc", "https://explore.testnet.tempo.xyz/"),
      "https://explore.testnet.tempo.xyz/tx/0xabc"
    );
  });

  test("Tempo rail refuses a non-Moderato chain id before asking for a key or the network", async () => {
    await withEnv({ TEMPO_CHAIN_ID: "4217" }, async () => {
      await assert.rejects(
        () => tempoRail.send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "mainnet-guard" }),
        payoutError("TEMPO_NETWORK_NOT_MODERATO")
      );
    });
  });

  test("Tempo rail refuses a missing treasury key before the network", async () => {
    await withEnv({ TEMPO_CHAIN_ID: "42431" }, async () => {
      await assert.rejects(
        () => tempoRail.send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "missing-key" }),
        payoutError("TEMPO_TREASURY_KEY_MISSING")
      );
    });
  });

  test("RAIL selects the live rail and leaves mock and Solana refusals alone", async () => {
    await withEnv({}, async () => {
      assert.equal(configuredRail(), "solana");
      assert.equal(recipientAddressReason(), "RECIPIENT_NEEDS_SOLANA_ADDRESS");
      assert.equal(executionFailedCode("solana"), "SOLANA_EXECUTION_FAILED");
      assert.equal(settledChain("solana", "solana"), "solana");
      assert.equal(settledChain("mock", "solana"), "mock");
      assert.deepEqual(chainForRecipient({ solanaAddress: SOLANA_RECIPIENT }), { chain: "solana", address: SOLANA_RECIPIENT });
      assert.equal(chainForRecipient({ solanaAddress: "" }), null);
    });

    await withEnv({ RAIL: "tempo", TEMPO_CHAIN_ID: "1" }, async () => {
      assert.equal(configuredRail(), "tempo");
      assert.equal(recipientAddressReason(), "RECIPIENT_NEEDS_TEMPO_ADDRESS");
      assert.equal(executionFailedCode("tempo"), "TEMPO_EXECUTION_FAILED");
      assert.equal(settledChain("solana", "solana"), "tempo");
      assert.equal(settledChain("mock", "solana"), "mock");
      assert.equal(chainForRecipient({ solanaAddress: SOLANA_RECIPIENT }), null);
      assert.equal(chainForRecipient({ solanaAddress: "" }), null);
      assert.deepEqual(chainForRecipient({ solanaAddress: RECIPIENT }), { chain: "tempo", address: RECIPIENT });
      const live = payoutRail("solana", "solana");
      await assert.rejects(
        () => live.send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "rail-switch" }),
        payoutError("TEMPO_NETWORK_NOT_MODERATO")
      );
      const practice = await payoutRail("mock").send({ recipientAddress: RECIPIENT, amountMicros: 1n, intentId: "still-mock" });
      assert.match(practice.digest, /^mock-testnet-/);
    });

    await withEnv({ RAIL: "bitcoin" }, async () => {
      assert.throws(() => configuredRail(), payoutError("UNSUPPORTED_RAIL"));
    });
  });
});
