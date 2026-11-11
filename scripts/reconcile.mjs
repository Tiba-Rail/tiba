// Recheck payout intents that were sent but only confirmed by one RPC.
// Usage: node scripts/reconcile.mjs
import "dotenv/config";

const { prisma } = await import("../src/lib/db.ts");
const { reconcileSignatureQuorum, solanaExplorerTxUrl } = await import("../src/lib/rails/solana.ts");

const pending = await prisma.payoutIntent.findMany({
  where: { status: "pending_confirmation", digest: { not: null } },
  orderBy: { createdAt: "asc" }
});

const summary = { checked: pending.length, paid: 0, still_pending: 0, unconfirmed: 0 };

for (const intent of pending) {
  const quorum = await reconcileSignatureQuorum(intent.digest);
  if (quorum === "confirmed") {
    await prisma.payoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "settled",
        decisionClass: "PAID",
        reasonCode: null
      }
    });
    summary.paid += 1;
    console.log(JSON.stringify({
      id: intent.id,
      result: "paid",
      signature: intent.digest,
      explorer_url: solanaExplorerTxUrl(intent.digest)
    }));
    continue;
  }
  if (quorum === "pending") {
    summary.still_pending += 1;
    console.log(JSON.stringify({ id: intent.id, result: "pending_confirmation", signature: intent.digest }));
    continue;
  }
  summary.unconfirmed += 1;
  console.log(JSON.stringify({ id: intent.id, result: "unconfirmed", signature: intent.digest }));
}

console.log(JSON.stringify(summary));
await prisma.$disconnect();
