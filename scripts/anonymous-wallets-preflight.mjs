// Read-only count for the #5 data step (scripts/sql/anonymous-live-wallets-to-mock.sql). Before the
// fix, wallets created at /start without sign-in settled on Solana devnet from the shared
// treasury. This counts the ones still live and prints the demo wallet id the SQL file needs.
// Prints ids, names and counts, never a key. Writes nothing.
//
//   node scripts/anonymous-wallets-preflight.mjs      (needs DATABASE_URL and TIBA_AGENT_KEY)
import { createHash } from "node:crypto";
import "dotenv/config";

const { prisma } = await import("../src/lib/db.ts");
const agentKey = process.env.TIBA_AGENT_KEY;
if (!agentKey) throw new Error("Set TIBA_AGENT_KEY first (read -rs TIBA_AGENT_KEY && export TIBA_AGENT_KEY).");

const demo = await prisma.agent.findUnique({ where: { apiKeyHash: createHash("sha256").update(agentKey).digest("hex") }, select: { id: true, name: true } });
const oldest = await prisma.agent.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } });
// The same rule as the SQL file: live, no signed-in owner, and neither demo wallet.
const keep = [demo?.id, oldest?.id].filter(Boolean);
const live = await prisma.agent.count({ where: { rail: "solana", userId: null, id: { notIn: keep } } });
await prisma.$disconnect();

console.log(`Shared demo wallet (TIBA_AGENT_KEY), stays live: ${demo ? `${demo.id} "${demo.name}"` : "NOT FOUND in this database"}`);
console.log(`Oldest workspace, stays live:                     ${oldest ? `${oldest.id} "${oldest.name}"` : "none"}`);
console.log(`${live} wallets created without sign-in are still live on Solana devnet. The SQL file switches them to simulated.`);
if (demo) console.log(`In the SQL file, replace PASTE_THE_DEMO_WALLET_ID_HERE with: ${demo.id}`);
else console.log("STOP: without the demo wallet id the SQL file changes nothing. Check TIBA_AGENT_KEY.");
