// Finds every bounty stuck at "paying" (job #379's review, REVIEW_PR31.md, gap 5:
// submitBountyClaim's atomic lock flips a bounty open -> paying, then runs
// processPayoutIntent; a crash between the lock and the final bounty.update at the bottom of
// that function leaves it "paying" forever -- the lock only ever fires from status "open", so
// no other claim can ever be submitted against it, and nothing reopens it).
//
// Usage: node scripts/recover-stuck-bounty-claims.mjs [--older-than-minutes=10] [--apply]
// Without --apply it only reports what it would do.
//
// Deliberately stays off "@/..." aliased modules, same reason gaps 3 and 4's scripts do --
// bounty-claim-gate.ts is safe to import directly (no "@/..." imports of its own), and
// bountyStatusAfter is the exact same pure function submitBountyClaim itself calls, so this can
// never become a second, drifting definition of what a bounty's status should be.
import "dotenv/config";
import { prisma } from "../src/lib/db.ts";
import { bountyStatusAfter } from "../src/lib/bounty-claim-gate.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const olderThanArg = args.find((a) => a.startsWith("--older-than-minutes="));
const olderThanMinutes = olderThanArg ? Number(olderThanArg.split("=")[1]) : 10;

async function main() {
  const since = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const stuck = await prisma.bounty.findMany({
    where: { status: "paying", updatedAt: { lt: since } },
    select: { id: true, title: true }
  });

  if (stuck.length === 0) {
    console.log(`Nothing stuck at "paying" older than ${olderThanMinutes} minutes.`);
    return;
  }

  for (const bounty of stuck) {
    // The claim that took the lock is the one this bounty's atomic updateMany let through --
    // there can only be one, since the lock only ever fires once from status "open". A claim
    // whose payoutIntentId is already set was already finished off by submitBountyClaim itself
    // (or by recordRefusedClaim's gate-refusal path, which always sets it before returning).
    const inFlight = await prisma.bountyClaim.findMany({
      where: { bountyId: bounty.id, payoutIntentId: null },
      select: { id: true }
    });

    if (inFlight.length === 0) {
      console.log(`${bounty.id} (${bounty.title}): "paying" but no unresolved claim found -- left as is (needs a human look).`);
      continue;
    }

    for (const claim of inFlight) {
      // processPayoutIntent's own idempotency key for a bounty claim is deterministic, so this
      // tells us, regardless of exactly where the crash landed, whether it ever got as far as
      // creating the intent row -- not a guess, the same key the crashed call itself used.
      const intent = await prisma.payoutIntent.findUnique({
        where: { idempotencyKey: `bounty-claim:${claim.id}` },
        select: { id: true, status: true, reasonCode: true }
      });

      if (!intent) {
        console.log(`${bounty.id} (${bounty.title}): claim ${claim.id} never got as far as creating an intent -- nothing happened. Reopening.`);
        if (apply) {
          const updated = await prisma.bounty.update({ where: { id: bounty.id }, data: { status: "open" } });
          console.log(`  -> marked ${updated.status}`);
        } else {
          console.log("  (dry run: would mark open)");
        }
        continue;
      }

      const status = bountyStatusAfter(intent);
      console.log(`${bounty.id} (${bounty.title}): claim ${claim.id} has intent ${intent.id} (${intent.status}/${intent.reasonCode ?? "-"}) -> ${status}.`);
      if (status === "paying") {
        console.log("  the intent itself is still unresolved -- left as is (this bounty genuinely is still paying).");
        continue;
      }
      if (apply) {
        await prisma.bountyClaim.update({ where: { id: claim.id }, data: { payoutIntentId: intent.id } });
        const updated = await prisma.bounty.update({ where: { id: bounty.id }, data: { status } });
        console.log(`  -> marked ${updated.status}, claim linked to its intent`);
      } else {
        console.log(`  (dry run: would mark ${status}, link the claim to its intent)`);
      }
    }
  }
}

await main();
