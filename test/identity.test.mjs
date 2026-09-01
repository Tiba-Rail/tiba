import assert from "node:assert/strict";
import test from "node:test";
import { MockIdentityProvider, recipientIdentityOk } from "../src/lib/identity.ts";

const now = new Date("2026-09-01T00:00:00.000Z");
const later = new Date("2027-01-01T00:00:00.000Z");
const earlier = new Date("2026-08-01T00:00:00.000Z");

test("identity gate passes only an unexpired verified verdict", () => {
  assert.equal(recipientIdentityOk({ kycStatus: "verified", kycExpiresAt: later }, now), true);
  assert.equal(recipientIdentityOk({ kycStatus: "verified", kycExpiresAt: null }, now), true, "seed data never expires");
  assert.equal(recipientIdentityOk({ kycStatus: "verified", kycExpiresAt: earlier }, now), false, "expired");
  assert.equal(recipientIdentityOk({ kycStatus: "failed", kycExpiresAt: later }, now), false);
  assert.equal(recipientIdentityOk({ kycStatus: "unverified", kycExpiresAt: null }, now), false);
  assert.equal(recipientIdentityOk({ kycStatus: "review", kycExpiresAt: null }, now), false);
});

test("mock provider fails only refs ending in -fail", async () => {
  const provider = new MockIdentityProvider();
  const input = { displayName: "x", suiAddress: "0x1" };
  assert.equal((await provider.verify({ ...input, recipientRef: "acme-fail" })).decision, "failed");
  assert.equal((await provider.verify({ ...input, recipientRef: "rafail-design" })).decision, "verified");
});
