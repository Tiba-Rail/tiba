import "dotenv/config";
const { prisma } = await import("../src/lib/db.ts");
const before = await prisma.recipient.findUnique({ where: { ref: "creator-lagos" }, select: { id: true, ref: true, t3nDid: true } });
console.log("BEFORE", JSON.stringify(before));
if (!before) { console.log("NO ROW"); process.exit(2); }
const updated = await prisma.recipient.update({
  where: { ref: "creator-lagos" },
  data: { t3nDid: "did:t3n:e040cf346be2c6ae936a123dcd4ec9e675983977" },
  select: { ref: true, t3nDid: true }
});
console.log("UPDATED", JSON.stringify(updated));
const after = await prisma.recipient.findUnique({ where: { ref: "creator-lagos" }, select: { ref: true, t3nDid: true } });
console.log("AFTER", JSON.stringify(after));
const count = await prisma.recipient.count({ where: { t3nDid: { not: null } } });
console.log("ROWS_WITH_T3N", count);
await prisma.$disconnect();
