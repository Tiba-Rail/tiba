import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { X402_NEEDS_LIVE_WALLET, x402RailRefusal } from "../src/lib/x402/gate.ts";

const routeSource = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");

function withEnv(overrides, run) {
  const saved = {};
  for (const [name, value] of Object.entries(overrides)) {
    saved[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("a practice (mock) wallet is refused by the x402 gate; a live Solana wallet is not", () => {
  withEnv({ MOCK_SETTLEMENT: undefined, RAIL: undefined }, () => {
    assert.equal(x402RailRefusal("mock"), X402_NEEDS_LIVE_WALLET, "sign-out onboarding wallets settle on mock");
    assert.equal(x402RailRefusal("solana"), null);
    assert.equal(x402RailRefusal("legacy"), null, "legacy already pays on Solana through payoutRail");
  });
});

test("MOCK_SETTLEMENT=1 and RAIL=tempo refuse every wallet: the x402 signer only pays Solana devnet USDC", () => {
  withEnv({ MOCK_SETTLEMENT: "1", RAIL: undefined }, () => {
    assert.equal(x402RailRefusal("solana"), X402_NEEDS_LIVE_WALLET);
  });
  withEnv({ MOCK_SETTLEMENT: undefined, RAIL: "tempo" }, () => {
    assert.equal(x402RailRefusal("solana"), X402_NEEDS_LIVE_WALLET);
  });
});

test("the x402 route checks the rail before it reads the body, fetches anything or signs", () => {
  const gate = routeSource.indexOf("x402RailRefusal(agent.rail)");
  const readBody = routeSource.indexOf("request.json()");
  const buyer = routeSource.indexOf("payX402Resource(");
  const signer = routeSource.indexOf("signExactSvmPayment(");
  assert.ok(gate > 0, "route no longer calls the rail gate");
  assert.ok(gate < readBody && readBody < buyer && buyer < signer, "gate must run first");
  assert.match(routeSource.slice(gate, readBody), /status: 403/);
});

test("the engine refuses a deferred (x402) authorization on any chain but Solana before the checks and the debit", () => {
  const backstop = engineSource.indexOf('settlement === "defer" && chain !== "solana"');
  const checks = engineSource.indexOf("Promise.allSettled([");
  const debit = engineSource.indexOf("debitAtomically(");
  assert.ok(backstop > 0, "engine backstop is missing");
  assert.ok(backstop < checks && checks < debit);
  assert.match(engineSource.slice(backstop, checks), /X402_NEEDS_LIVE_WALLET/);
});
