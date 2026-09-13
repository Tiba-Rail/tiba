import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  createWalletChallenge,
  normalizeWalletAddress,
  verifySolanaSignature,
  verifyWalletChallenge
} from "../src/lib/wallet-auth.ts";

process.env.AUTH_SECRET = "test-secret";

function solanaKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // The raw 32-byte key is the tail of the 44-byte SPKI DER.
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  return { address: new PublicKey(raw).toBase58(), privateKey };
}

test("Solana wallet addresses are normalized without changing base58 case", () => {
  const mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  assert.equal(normalizeWalletAddress(` ${mint} `), mint);
  assert.equal(normalizeWalletAddress("0x1"), null);
  assert.equal(normalizeWalletAddress("not-an-address"), null);
});

test("a Solana challenge round-trips with the address case intact", () => {
  const { address, privateKey } = solanaKeypair();
  const challenge = createWalletChallenge(address);
  assert.ok(challenge);
  assert.equal(challenge.address, address);

  const verified = verifyWalletChallenge({
    cookieValue: challenge.cookieValue,
    addressValue: address,
    nonce: challenge.nonce,
    message: challenge.message
  });
  assert.deepEqual(verified, { address, nonce: challenge.nonce });

  const signature = sign(null, Buffer.from(challenge.message, "utf8"), privateKey).toString("base64");
  assert.equal(verifySolanaSignature(address, challenge.message, signature), true);
  assert.equal(verifySolanaSignature(address, `${challenge.message}x`, signature), false, "tampered message");
  assert.equal(verifySolanaSignature(solanaKeypair().address, challenge.message, signature), false, "other key");
  assert.equal(verifySolanaSignature(address, challenge.message, "AAAA"), false, "short signature");
});
