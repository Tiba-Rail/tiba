import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTIFACT_TOO_LARGE,
  assertArtifactSize,
  assertReplayBelongsTo,
  effectiveChannels,
  IDEMPOTENCY_KEY_IN_USE,
  INTENT_RATE_LIMITED,
  INTENTS_PER_DEPLOYMENT_PER_HOUR,
  INTENTS_PER_WORKSPACE_PER_HOUR,
  intentBudgetExceeded,
  MAX_ARTIFACT_BYTES
} from "../src/lib/payout-guards.ts";
import { WORKSPACES_PER_DEPLOYMENT_PER_HOUR, workspaceBudgetExceeded } from "../src/lib/rate-limit.ts";
import { reconcile } from "../src/lib/reconcile.ts";

const engineSource = readFileSync(new URL("../src/lib/payout-intent.ts", import.meta.url), "utf8");
const workspacesRoute = readFileSync(new URL("../src/app/api/v1/workspaces/route.ts", import.meta.url), "utf8");
const limitsPage = readFileSync(new URL("../src/app/policies/limits-client.tsx", import.meta.url), "utf8");
const intentsRoute = readFileSync(new URL("../src/app/api/v1/intents/route.ts", import.meta.url), "utf8");
const x402Route = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");
const telegram = readFileSync(new URL("../src/lib/telegram-agent.ts", import.meta.url), "utf8");

test("a replayed idempotency key is only answered for the workspace that used it", () => {
  const mine = { agentId: "ws-a", publicToken: "secret-receipt-token" };
  assert.doesNotThrow(() => assertReplayBelongsTo(mine, { id: "ws-a" }));
  assert.throws(() => assertReplayBelongsTo(mine, { id: "ws-b" }), { message: IDEMPOTENCY_KEY_IN_USE });
});

test("the engine checks ownership before it returns a stored intent, and the routes answer 409", () => {
  const lookup = engineSource.indexOf("findUnique({ where: { idempotencyKey: body.idempotency_key } })");
  const ownership = engineSource.indexOf("assertReplayBelongsTo(existing, agent)");
  const replay = engineSource.indexOf("return toPublicIntent(existing)");
  assert.ok(lookup > 0 && ownership > lookup && replay > ownership, "ownership must be checked between the lookup and the replay");
  for (const source of [intentsRoute, x402Route]) {
    const mapped = source.indexOf("IDEMPOTENCY_KEY_IN_USE }, { status: 409 }");
    assert.ok(mapped > 0, "route must map IDEMPOTENCY_KEY_IN_USE to 409");
  }
});

test("the amount rule cannot be turned off: a work order's stored choice only ever adds strictness", () => {
  // $100 stored as 'your own record only' still takes both checks.
  assert.equal(effectiveChannels("payer_record", 100_000_000n), "both");
  // $250.000001 stored as 'both' still goes to a person.
  assert.equal(effectiveChannels("both", 250_000_001n), "human");
  assert.equal(effectiveChannels("payer_record", 400_000_000n), "human");
  // Stricter is kept; the amount never loosens what the owner asked for.
  assert.equal(effectiveChannels("both", 1_000_000n), "both");
  assert.equal(effectiveChannels("human", 1_000_000n), "human");
  assert.equal(effectiveChannels("payer_record", 49_999_999n), "payer_record");
  assert.equal(effectiveChannels("both", 250_000_000n), "both", "$250 exactly is still two checks");

  // And what that means for the payment: a $400 bill that both checks agree on is held for a person.
  const tuple = { workOrderId: "WO-7", amountMicros: 400_000_000n, deliveryTimestamp: "2026-09-27T00:00:00Z" };
  assert.deepEqual(reconcile(effectiveChannels("both", tuple.amountMicros), { artifact: tuple, payer_record: tuple }), {
    ok: false, decisionClass: "AMBER", reasonCode: "HUMAN_REVIEW_REQUIRED"
  });
});

test("the engine applies the amount rule on the payment path, from the payer-record amount", () => {
  const stored = engineSource.indexOf("const storedChannels = channelPolicyWorkOrder");
  const applied = engineSource.indexOf("effectiveChannels(storedChannels, payerTuple.amountMicros)");
  const reconciled = engineSource.indexOf("reconcile(requiredChannels,");
  assert.ok(stored > 0 && applied > stored && reconciled > applied);
  assert.match(limitsPage, /Over \$250: a person decides, whatever the work order says\. This cannot be turned off\./);
  assert.match(limitsPage, /Under \$50: at least one check/);
});

test("a bill over 16 KB is refused before anything is stored; a normal one passes", () => {
  assert.doesNotThrow(() => assertArtifactSize("DELIVERY NOTE\nWork order: WO-13\nAmount due: 5.00 USDC"));
  assert.doesNotThrow(() => assertArtifactSize("a".repeat(MAX_ARTIFACT_BYTES)));
  assert.throws(() => assertArtifactSize("a".repeat(MAX_ARTIFACT_BYTES + 1)), { message: ARTIFACT_TOO_LARGE });
  // Counted in bytes, not characters.
  assert.throws(() => assertArtifactSize("€".repeat(MAX_ARTIFACT_BYTES / 3 + 1)), { message: ARTIFACT_TOO_LARGE });
});

test("the hourly budget counts every intent, refused ones included, per workspace and deployment-wide", () => {
  assert.equal(intentBudgetExceeded({ mine: 0, all: 0 }), false);
  assert.equal(intentBudgetExceeded({ mine: INTENTS_PER_WORKSPACE_PER_HOUR - 1, all: 100 }), false);
  assert.equal(intentBudgetExceeded({ mine: INTENTS_PER_WORKSPACE_PER_HOUR, all: 100 }), true, "one workspace at its cap");
  assert.equal(intentBudgetExceeded({ mine: 1, all: INTENTS_PER_DEPLOYMENT_PER_HOUR }), true, "many throwaway workspaces together");
});

test("the engine checks size first and the budget before any row is written; the routes answer 413 and 429", () => {
  const size = engineSource.indexOf("assertArtifactSize(body.artifact)");
  const replay = engineSource.indexOf("findUnique({ where: { idempotencyKey: body.idempotency_key } })");
  const budget = engineSource.indexOf("await assertIntentBudget(agent.id)");
  const firstWrite = engineSource.indexOf("tx.payoutIntent.create(");
  assert.ok(size > 0 && size < replay, "size is checked before the replay lookup");
  assert.ok(budget > replay && budget < firstWrite, "budget is checked after the replay lookup and before the first write");
  const counted = engineSource.slice(engineSource.indexOf("export async function assertIntentBudget"), size);
  assert.match(counted, /payoutIntent\.count\(\{ where: \{ agentId, createdAt: \{ gte: since \} \} \}\)/);
  assert.match(counted, /payoutIntent\.count\(\{ where: \{ createdAt: \{ gte: since \} \} \}\)/);
  assert.match(counted, new RegExp(INTENT_RATE_LIMITED));
  assert.match(intentsRoute, /ARTIFACT_TOO_LARGE, max_bytes: MAX_ARTIFACT_BYTES \}, \{ status: 413 \}/);
  assert.match(intentsRoute, /INTENT_RATE_LIMITED \}, \{ status: 429 \}/);
  assert.match(x402Route, /INTENT_RATE_LIMITED \}, \{ status: 429 \}/);
});

test("job #379's rate-limit race (S20) is closed: the real write recounts and inserts inside one locked transaction", () => {
  // assertIntentBudget's own count-then-insert is a fast pre-check only -- two calls arriving
  // together could both pass it before either wrote a row. The fix isn't there: it's a second,
  // authoritative recheck that happens atomically with the actual insert, so nothing can slip
  // through between the two. REVIEW_PR31.md, gap 1.
  const txStart = engineSource.indexOf("prisma.$transaction(async (tx) =>");
  const lock = engineSource.indexOf("pg_advisory_xact_lock");
  const recount = engineSource.indexOf(
    "tx.payoutIntent.count({ where: { agentId: agent.id, createdAt: { gte: since } } })"
  );
  const recheck = engineSource.indexOf("if (intentBudgetExceeded({ mine, all })) throw new Error(INTENT_RATE_LIMITED);", txStart);
  const write = engineSource.indexOf("tx.payoutIntent.create(");
  assert.ok(txStart > 0, "the create must run inside a transaction, not a bare prisma call");
  assert.ok(lock > txStart, "the lock must be taken inside that transaction");
  assert.ok(recount > lock, "the count must be re-read after the lock is held, not reused from the pre-check");
  assert.ok(recheck > recount && recheck < write, "the recheck must run, and must run before the write it's guarding");
  // Two callers can't both hold the same lock key at once, so this is the same key every time --
  // a per-request key (e.g. hashed from agentId) would only serialize one workspace against
  // itself and leave the deployment-wide half of the cap racing exactly as before.
  assert.match(engineSource.slice(lock, lock + 40), /pg_advisory_xact_lock\(\d+\)/);
});

test("two calls racing on a brand-new idempotency key both get a real intent back, not a raw 500 (gap 2)", () => {
  // The earlier findUnique can't see a row that doesn't exist yet, so two simultaneous calls
  // with the same never-before-used key can both reach the insert. Only the database's own
  // @unique constraint on idempotency_key stops the second one -- this test checks the loser is
  // then handed the SAME graceful reply an ordinary replay gets, not an unhandled exception.
  const txTry = engineSource.indexOf("try {\n    intent = await prisma.$transaction");
  const catchBlock = engineSource.indexOf("} catch (error) {", txTry);
  assert.ok(txTry > 0 && catchBlock > txTry, "the transaction that inserts the intent must be wrapped in try/catch");
  const p2002 = engineSource.indexOf('error.code === "P2002"', catchBlock);
  const scopedToKey = engineSource.indexOf('.includes("idempotency_key")', p2002);
  const rethrow = engineSource.indexOf("if (!isIdempotencyKeyConflict) throw error;", catchBlock);
  const refetch = engineSource.indexOf("findUniqueOrThrow({ where: { idempotencyKey: body.idempotency_key } })", rethrow);
  const ownership = engineSource.indexOf("assertReplayBelongsTo(winner, agent)", refetch);
  const reply = engineSource.indexOf("return toPublicIntent(winner)", ownership);
  assert.ok(p2002 > catchBlock, "must check for Prisma's own unique-violation code");
  assert.ok(scopedToKey > p2002, "must be scoped to the idempotency-key constraint specifically, not any P2002");
  assert.ok(rethrow > scopedToKey, "an unrelated write failure must still be rethrown, not swallowed");
  assert.ok(refetch > rethrow, "the winner's own row must be re-read after losing the race");
  assert.ok(ownership > refetch, "the loser still gets ownership-checked before anything is handed back");
  assert.ok(reply > ownership, "and gets the same public shape a normal replay gets");
});

test("workspace creation has a deployment-wide hourly cap read from the database, not a per-instance map", () => {
  assert.equal(workspaceBudgetExceeded(0), false);
  assert.equal(workspaceBudgetExceeded(WORKSPACES_PER_DEPLOYMENT_PER_HOUR - 1), false);
  assert.equal(workspaceBudgetExceeded(WORKSPACES_PER_DEPLOYMENT_PER_HOUR), true);
  assert.equal(workspaceBudgetExceeded(Number.NaN), true, "a broken count fails closed");
  const count = workspacesRoute.indexOf("prisma.agent.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } })");
  const refused = workspacesRoute.indexOf("workspaceBudgetExceeded(createdLastHour)");
  const create = workspacesRoute.indexOf("tx.agent.create(");
  assert.ok(count > 0 && refused > count && create > refused, "counted, checked, then created");
});

test("Telegram payment keys are random, not built from the clock", () => {
  assert.doesNotMatch(telegram, /tg-\$\{Date\.now\(\)\}/);
  assert.match(telegram, /idempotency_key: `tg-\$\{randomUUID\(\)\}`/);
});
