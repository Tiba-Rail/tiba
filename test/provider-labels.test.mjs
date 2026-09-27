import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("visitor-facing Telegram and receipt copy does not claim Gonka or GNK", () => {
  const telegram = fs.readFileSync("src/lib/telegram-agent.ts", "utf8");
  const receipt = fs.readFileSync("src/app/r/[token]/page.tsx", "utf8");

  assert.equal(telegram.includes("GonkaRouter"), false);
  assert.equal(receipt.includes("GNK/USD"), false);
  assert.equal(receipt.includes("Verification cost"), false);
});

test("sandbox receipts do not fetch or store a retired GNK price", () => {
  const source = fs.readFileSync("src/lib/fool-it-store.ts", "utf8");
  assert.equal(source.includes("getGnkUsdRate"), false);
  assert.match(source, /gnkUsd: null/);
  assert.match(source, /pricingUpdatedAt: null/);
});

test("the example environment names the inference key the Groq client reads", () => {
  const example = fs.readFileSync(".env.example", "utf8");
  assert.match(example, /^GROQ_API_KEY=/m);
  assert.doesNotMatch(example, /^GONKA_API_KEY=/m);
});
