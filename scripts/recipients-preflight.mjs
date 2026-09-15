// Read-only preview of migration 20260915000000_scope_recipients_to_workspaces (#3). It works out,
// in JavaScript, which workspace each recipient will belong to, using the migration's own rules,
// and checks the demo recipients land in the shared demo wallet (the one behind TIBA_AGENT_KEY)
// so the Telegram WO-13 demo keeps working. Prints workspace ids, names and counts, never a key.
// Writes nothing.
//
//   node scripts/recipients-preflight.mjs      (needs DATABASE_URL and TIBA_AGENT_KEY; run BEFORE the migration)
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Recipients created before this were managed with the global operator token (step 3). */
export const OWNER_KEYS_SINCE = new Date("2026-09-06T00:00:00Z");
const ONBOARDING_WINDOW_MS = 5_000;
const byTimeThenId = (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The migration's rules, in the migration's order. Returns each recipient with the workspace it
 * will belong to (null = unassigned, visible to no workspace) and the rule that decided it.
 *   recipients: { id, ref, createdAt }   agents: { id, createdAt }   intents: { id, recipientId, agentId, createdAt }
 */
export function planRecipientOwners(recipients, agents, intents) {
  const firstPayer = new Map();
  for (const intent of [...intents].sort(byTimeThenId)) {
    if (!firstPayer.has(intent.recipientId)) firstPayer.set(intent.recipientId, intent.agentId);
  }
  const oldest = [...agents].sort(byTimeThenId)[0]?.id ?? null;

  return recipients.map((recipient) => {
    const decided = (agentId, rule) => ({ id: recipient.id, ref: recipient.ref, agentId, rule });
    if (firstPayer.has(recipient.id)) return decided(firstPayer.get(recipient.id), "first payer");
    if (recipient.ref.startsWith("owner-")) {
      const created = recipient.createdAt.getTime();
      const window = agents.filter((agent) => agent.createdAt.getTime() <= created && agent.createdAt.getTime() > created - ONBOARDING_WINDOW_MS);
      if (window.length === 1) return decided(window[0].id, "created with its workspace");
    }
    if (recipient.createdAt < OWNER_KEYS_SINCE) return decided(oldest, "oldest workspace");
    return decided(null, "unassigned");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const { prisma } = await import("../src/lib/db.ts");
  const agentKey = process.env.TIBA_AGENT_KEY;
  if (!agentKey) throw new Error("Set TIBA_AGENT_KEY first (read -rs TIBA_AGENT_KEY && export TIBA_AGENT_KEY).");

  // created_at is a UTC timestamp without a time zone; reading it as epoch milliseconds keeps the
  // comparison with the 6 Sep cutoff independent of this machine's time zone.
  const dated = (rows) => rows.map(({ createdMs, ...row }) => ({ ...row, createdAt: new Date(createdMs) }));
  const agents = dated(await prisma.$queryRaw`SELECT "id", "name", "api_key_hash" AS "apiKeyHash", (extract(epoch FROM "created_at") * 1000)::float8 AS "createdMs" FROM "agents"`);
  const recipients = dated(await prisma.$queryRaw`SELECT "id", "ref", (extract(epoch FROM "created_at") * 1000)::float8 AS "createdMs" FROM "recipients"`);
  const intents = dated(await prisma.$queryRaw`SELECT "id", "recipient_id" AS "recipientId", "agent_id" AS "agentId", (extract(epoch FROM "created_at") * 1000)::float8 AS "createdMs" FROM "payout_intents"`);
  const wo13 = await prisma.$queryRaw`SELECT r."ref" FROM "work_orders" AS w JOIN "recipients" AS r ON r."id" = w."recipient_id" WHERE w."ref" = 'WO-13'`;
  await prisma.$disconnect();

  const plan = planRecipientOwners(recipients, agents, intents);
  const name = (id) => {
    const agent = agents.find((row) => row.id === id);
    return agent ? `${agent.id} "${agent.name}"` : "nobody (unassigned)";
  };
  const demo = agents.find((agent) => agent.apiKeyHash === createHash("sha256").update(agentKey).digest("hex"));
  const oldest = [...agents].sort(byTimeThenId)[0];

  console.log(`Shared demo wallet (TIBA_AGENT_KEY): ${demo ? name(demo.id) : "NOT FOUND in this database"}`);
  console.log(`Oldest workspace:                    ${oldest ? name(oldest.id) : "none"}${demo && oldest && demo.id === oldest.id ? " (the same wallet)" : ""}`);
  console.log("");
  console.log("Demo recipients:");
  const demoRefs = [...new Set(["translator-kl", "creator-lagos", "ali", ...wo13.map((row) => row.ref)])];
  let allInDemo = Boolean(demo);
  for (const ref of demoRefs) {
    const row = plan.find((entry) => entry.ref === ref);
    const label = `${ref}${wo13.some((w) => w.ref === ref) ? " (WO-13's recipient)" : ""}`;
    if (!row) {
      console.log(`  ${label}: not in this database`);
      if (wo13.some((w) => w.ref === ref)) allInDemo = false;
      continue;
    }
    const ok = demo && row.agentId === demo.id;
    if (!ok) allInDemo = false;
    console.log(`  ${label} -> ${name(row.agentId)}, by ${row.rule}${ok ? "" : "   <-- NOT the demo wallet"}`);
  }
  console.log("");
  const count = (rule) => plan.filter((row) => row.rule === rule).length;
  console.log(`${plan.length} recipients in total:`);
  console.log(`  ${count("first payer")} go to the workspace that first paid them`);
  console.log(`  ${count("created with its workspace")} go to the workspace they were created with at sign-up`);
  console.log(`  ${count("oldest workspace")} leftovers from before 6 Sep go to the oldest workspace${oldest ? ` (${name(oldest.id)})` : ""}`);
  console.log(`  ${count("unassigned")} leftovers from 6 Sep on stay unassigned (no workspace will see them)`);
  console.log("");
  console.log(allInDemo
    ? "RESULT: OK. The demo recipients land in the shared demo wallet; the Telegram WO-13 demo keeps working."
    : "RESULT: STOP. A demo recipient does not land in the shared demo wallet, so the Telegram WO-13 demo would break. Do not run the migration.");
}
