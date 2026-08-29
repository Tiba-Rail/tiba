// Dev tool: prints the newest intent's public receipt token.  node scripts/latest-token.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const i = await prisma.payoutIntent.findFirst({ orderBy: { createdAt: "desc" } });
console.log(i ? `${i.publicToken} ${i.decisionClass}` : "none");
await prisma.$disconnect();
