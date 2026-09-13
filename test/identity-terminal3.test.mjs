import assert from "node:assert/strict";
import test from "node:test";
import { Terminal3IdentityProvider, terminal3FromEnv } from "../src/lib/identity-terminal3.ts";

// The branch that must never fail open. A recipient with no Terminal 3 identity has
// delegated Tiba nothing, so there is nothing to verify and no network call to make.
// If this ever returned "verified", Tiba would pay a stranger on no evidence at all.
test("a recipient with no Terminal 3 identity is refused, without calling out", async () => {
  const provider = new Terminal3IdentityProvider("unused-key", "http://127.0.0.1:1", 3600);
  for (const t3nDid of [null, undefined, ""]) {
    const result = await provider.verify({
      recipientRef: "someone", displayName: "Someone", walletAddress: "wallet", t3nDid
    });
    assert.equal(result.decision, "failed");
    assert.equal(result.expiresAt, null);
  }
});

test("check ids are stable per recipient and differ between recipients", async () => {
  const provider = new Terminal3IdentityProvider("unused-key", "http://127.0.0.1:1", 3600);
  const one = await provider.verify({ recipientRef: "a", displayName: "A", walletAddress: "wallet", t3nDid: null });
  const again = await provider.verify({ recipientRef: "a", displayName: "A", walletAddress: "wallet", t3nDid: null });
  const other = await provider.verify({ recipientRef: "b", displayName: "B", walletAddress: "wallet", t3nDid: null });
  assert.equal(one.checkId, again.checkId);
  assert.notEqual(one.checkId, other.checkId);
});

test("terminal3FromEnv returns null when no agent key is configured", () => {
  const saved = process.env.T3_AGENT_API_KEY;
  delete process.env.T3_AGENT_API_KEY;
  try {
    assert.equal(terminal3FromEnv(), null);
  } finally {
    if (saved !== undefined) process.env.T3_AGENT_API_KEY = saved;
  }
});

// Know Your Agent must fail closed. An unreachable node, a revoked key or a garbage
// key all have to come back null, because the caller treats null as "refuse". If this
// ever threw instead, a crash in the identity check could be mistaken for a pass.
test("whoIsThisAgent returns null rather than throwing when Terminal 3 cannot answer", async () => {
  const { whoIsThisAgent } = await import("../src/lib/identity-terminal3.ts");
  assert.equal(await whoIsThisAgent("garbage-key", "http://127.0.0.1:1"), null);
});
