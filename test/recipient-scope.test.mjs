import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { planRecipientOwners } from "../scripts/recipients-preflight.mjs";

// PGlite is an in-memory Postgres (no network, no real database). It is already in the lockfile as
// a Prisma dev dependency; skip rather than fail if an install left it out.
const PGlite = await import("@electric-sql/pglite").then((module) => module.PGlite, () => null);
const skip = PGlite ? false : "PGlite is not installed";

const dir = new URL("../prisma/migrations/", import.meta.url);
const migrations = readdirSync(dir).filter((name) => /^\d/.test(name)).sort();
const migrationSql = (name) => readFileSync(new URL(`${name}/migration.sql`, dir), "utf8");
const mockSql = readFileSync(new URL("../scripts/sql/anonymous-live-wallets-to-mock.sql", import.meta.url), "utf8");

// Production-shaped rows, inserted just before migration 1. "demo" is the oldest workspace.
const SEED = `
  INSERT INTO agents (id, name, api_key_hash, api_key_prefix, ceiling_micros, hour_cap_micros, day_cap_micros, hour_count_cap, day_count_cap, rail, user_id, created_at, updated_at) VALUES
    ('demo',   'demo',   'h-demo',   'p', 1, 1, 1, 1, 1, 'solana', NULL, '2026-08-29 00:00:00',     now()),
    ('onb',    'onb',    'h-onb',    'p', 1, 1, 1, 1, 1, 'solana', NULL, '2026-09-10 10:00:00.100', now()),
    ('payer',  'payer',  'h-payer',  'p', 1, 1, 1, 1, 1, 'solana', NULL, '2026-09-11 00:00:00',     now()),
    ('twin-a', 'twin-a', 'h-twin-a', 'p', 1, 1, 1, 1, 1, 'solana', NULL, '2026-09-12 10:00:00',     now()),
    ('twin-b', 'twin-b', 'h-twin-b', 'p', 1, 1, 1, 1, 1, 'mock',   NULL, '2026-09-12 10:00:01',     now()),
    ('signed', 'signed', 'h-signed', 'p', 1, 1, 1, 1, 1, 'solana', 'u1', '2026-09-13 00:00:00',     now());
  INSERT INTO recipients (id, ref, display_name, created_at, updated_at) VALUES
    ('r1', 'translator-kl', 'x', '2026-08-29 00:00:00',     now()),
    ('r2', 'creator-lagos', 'x', '2026-08-29 00:00:00',     now()),
    ('r3', 'owner-old',     'x', '2026-09-02 00:00:00',     now()),
    ('r4', 'owner-abcd',    'x', '2026-09-10 10:00:00.150', now()),
    ('r5', 'owner-stolen',  'x', '2026-09-10 10:00:00.160', now()),
    ('r6', 'r-paid',        'x', '2026-09-11 12:00:00',     now()),
    ('r7', 'owner-twin',    'x', '2026-09-12 10:00:01.500', now()),
    ('r8', 'late-unpaid',   'x', '2026-09-12 00:00:00',     now());
  INSERT INTO payout_intents (id, agent_id, recipient_id, status, decision_class, idempotency_key, public_token, created_at, updated_at) VALUES
    ('i1', 'demo',  'r1', 'settled', 'PAID', 'k1', 't1', '2026-09-01 00:00:00', now()),
    ('i2', 'payer', 'r1', 'settled', 'PAID', 'k2', 't2', '2026-09-11 01:00:00', now()),
    ('i3', 'payer', 'r5', 'settled', 'PAID', 'k3', 't3', '2026-09-11 02:00:00', now()),
    ('i4', 'payer', 'r6', 'settled', 'PAID', 'k4', 't4', '2026-09-11 12:01:00', now()),
    ('i5', 'demo',  'r6', 'refused', 'RED',  'k5', 't5', '2026-09-11 12:05:00', now());`;

const EXPECTED = {
  "translator-kl": "demo", // first payer, even though "payer" paid it later
  "creator-lagos": "demo", // never paid, before 6 Sep: the oldest workspace
  "owner-old": "demo", // no workspace created with it, before 6 Sep: the oldest workspace
  "owner-abcd": "onb", // created in the same moment as exactly one workspace
  "owner-stolen": "payer", // a payment is stronger evidence than a timestamp
  "r-paid": "payer", // first payer
  "owner-twin": null, // two workspaces created that close together: ambiguous, after 6 Sep
  "late-unpaid": null // after 6 Sep with no evidence: nobody gets it
};

async function rows(db, query) {
  const result = await db.query(query);
  return result.rows.map(({ ms, ...row }) => ({ ...row, createdAt: new Date(ms) }));
}

test("migration 1 gives each recipient the workspace the read-only preview predicts", { skip }, async () => {
  const db = new PGlite();
  let predicted;
  for (const name of migrations) {
    if (name.startsWith("20260915000000")) {
      await db.exec(SEED);
      const epoch = "(extract(epoch FROM created_at) * 1000)::float8 AS ms";
      predicted = planRecipientOwners(
        await rows(db, `SELECT id, ref, ${epoch} FROM recipients`),
        await rows(db, `SELECT id, ${epoch} FROM agents`),
        await rows(db, `SELECT id, recipient_id AS "recipientId", agent_id AS "agentId", ${epoch} FROM payout_intents`)
      );
    }
    await db.exec(migrationSql(name));
  }
  const actual = (await db.query("SELECT ref, agent_id FROM recipients")).rows;
  assert.deepEqual(Object.fromEntries(actual.map((row) => [row.ref, row.agent_id])), EXPECTED, "the migration");
  assert.deepEqual(Object.fromEntries(predicted.map((row) => [row.ref, row.agentId])), EXPECTED, "the preview");

  // The #5 data step. Left unedited, it changes nothing.
  const live = async () => (await db.query("SELECT id FROM agents WHERE rail = 'solana' ORDER BY id")).rows.map((row) => row.id);
  await db.exec(mockSql);
  assert.deepEqual(await live(), ["demo", "onb", "payer", "signed", "twin-a"]);
  // With the demo wallet id pasted in (here "payer"), only anonymous live wallets go simulated;
  // the demo wallet, the oldest workspace and signed-in wallets stay live.
  await db.exec(mockSql.replace("PASTE_THE_DEMO_WALLET_ID_HERE", "payer"));
  assert.deepEqual(await live(), ["demo", "payer", "signed"]);
  await db.close();
});

test("every migration applies to an empty database", { skip }, async () => {
  const db = new PGlite();
  for (const name of migrations) await db.exec(migrationSql(name));
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'telegram_chats' ORDER BY column_name")).rows;
  assert.deepEqual(columns.map((row) => row.column_name), ["agent_id", "chat_id", "updated_at"]);
  await db.close();
});
