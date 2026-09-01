// One-off: mark recipients that no provider has ever checked as identity-verified by the seed
// so demo data reads "Verified". Idempotent: a recipient with any provider verdict is left alone.
// node scripts/backfill-kyc.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const result = await prisma.recipient.updateMany({
  where: { kycProvider: null },
  data: { kycStatus: "verified", kycProvider: "seed", kycVerifiedAt: new Date() }
});
console.log(JSON.stringify({ recipients_verified: result.count }));
await prisma.$disconnect();
