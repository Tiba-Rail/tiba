// One-off: mark every existing recipient identity-verified by the seed so demo data reads "Verified".
// node scripts/backfill-kyc.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const result = await prisma.recipient.updateMany({
  data: { kycStatus: "verified", kycProvider: "seed", kycVerifiedAt: new Date() }
});
console.log(JSON.stringify({ recipients_verified: result.count }));
await prisma.$disconnect();
