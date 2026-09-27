import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertDatabaseWipeAllowed,
  databaseHost,
  requireSeedAgentKey
} from "../scripts/db-wipe-guard.mjs";

test("destructive database work requires the exact non-local host as confirmation", () => {
  assert.equal(databaseHost("postgresql://user:pass@db.example.test:5432/tiba"), "db.example.test");
  assert.throws(
    () => assertDatabaseWipeAllowed({
      DATABASE_URL: "postgresql://user:pass@db.example.test:5432/tiba"
    }),
    /Refusing to empty every table on db\.example\.test/
  );
  assert.equal(
    assertDatabaseWipeAllowed({
      DATABASE_URL: "postgresql://user:pass@db.example.test:5432/tiba",
      ALLOW_DB_WIPE: "db.example.test"
    }),
    "db.example.test"
  );
  assert.doesNotThrow(() => assertDatabaseWipeAllowed({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/tiba"
  }));
});

test("the seed key is mandatory and the public repository key is blocked off localhost", () => {
  assert.throws(() => requireSeedAgentKey({}, ""), /SEED_AGENT_KEY must be set/);
  assert.throws(
    () => requireSeedAgentKey({ SEED_AGENT_KEY: "tiba_testnet_demo_key" }, "db.example.test"),
    /public demo agent key/
  );
  assert.equal(
    requireSeedAgentKey({ SEED_AGENT_KEY: "local-only-test-key" }, "db.example.test"),
    "local-only-test-key"
  );
});

test("seed and eval run the wipe guard before importing Prisma", () => {
  for (const path of ["scripts/seed.mjs", "scripts/eval.mjs"]) {
    const source = fs.readFileSync(path, "utf8");
    const guardAt = source.indexOf("assertDatabaseWipeAllowed()");
    const prismaAt = source.indexOf('await import("../src/lib/db.ts")');
    assert.ok(guardAt !== -1 && guardAt < prismaAt, path);
  }
});

test("seed defaults to the simulated rail and the example env has no public key", () => {
  const seed = fs.readFileSync("scripts/seed.mjs", "utf8");
  const example = fs.readFileSync(".env.example", "utf8");
  assert.match(seed, /SEED_AGENT_RAIL === "solana" \? "solana" : "mock"/);
  assert.match(example, /^SEED_AGENT_KEY=""$/m);
  assert.equal(example.includes('SEED_AGENT_KEY="tiba_testnet_demo_key"'), false);
});
