// Dev tool: per-model latency for the most recent intents.  node scripts/adjudications.mjs [n]
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const n = Number(process.argv[2] ?? 2);
const intents = await prisma.payoutIntent.findMany({ orderBy: { createdAt: "desc" }, take: n, include: { adjudications: { orderBy: { createdAt: "asc" } } } });
for (const i of intents) {
  console.log(`\n${i.decisionClass} ${i.reasonCode ?? "PAID"}  total=${new Date(i.updatedAt) - new Date(i.createdAt)}ms  settled=${i.digest ? "yes" : "no"}`);
  for (const a of i.adjudications) console.log(`  ${String(a.channel).padEnd(12)} ${String(a.model).padEnd(36)} ok=${a.ok} ${String(a.latencyMs).padStart(6)}ms  in=${a.inputTokens ?? "?"} out=${a.outputTokens ?? "?"}`);
}
await prisma.$disconnect();
