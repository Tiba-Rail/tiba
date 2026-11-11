import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { assertRotateDevnet, envChangeLines, writeDevnetKeypair } from "../scripts/rotate-key.mjs";

test("rotate-key refuses anything but devnet", () => {
  assert.throws(() => assertRotateDevnet("mainnet-beta"), /devnet/);
  assert.throws(() => assertRotateDevnet("testnet"), /devnet/);
  assert.throws(() => assertRotateDevnet(""), /devnet/);
  assert.throws(() => assertRotateDevnet(undefined), /devnet/);
  assert.doesNotThrow(() => assertRotateDevnet("devnet"));
});

test("rotate-key writes a keypair file and prints only the public env change", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiba-rotate-"));
  const { publicKey, path } = writeDevnetKeypair(dir);
  const secret = JSON.parse(readFileSync(path, "utf8"));
  const derived = Keypair.fromSecretKey(Uint8Array.from(secret)).publicKey.toBase58();
  assert.equal(derived, publicKey);
  const lines = envChangeLines(publicKey).join("\n");
  assert.match(lines, new RegExp(`SOLANA_ADDRESS=${publicKey}`));
  assert.match(lines, new RegExp(`TREASURY_ADDRESS=${publicKey}`));
  assert.doesNotMatch(lines, /\[(\d+,\s*){8}/);
  assert.equal(JSON.stringify(secret).includes(publicKey), false);
});
