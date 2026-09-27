// Finds every x402 intent stuck at X402_SIGNING (claimed, and job #379's review confirmed
// nothing ever moves it on if the process crashes between the claim and recordSettlement).
// Read-only unless a real, proven payment is found -- an unresolved intent is left exactly
// as it is, never guessed at. Safe to re-run: it only ever moves an intent forward once.
//
// Usage: node scripts/recover-stuck-x402-signing.mjs [--older-than-minutes=10] [--apply]
// Without --apply it only reports what it would do.
//
// Deliberately stays off the "@/..." aliased modules (payout-intent.ts and everything it pulls
// in) that only resolve inside Next's bundler -- same reason every other script here talks to
// the app over HTTP or plain Prisma rather than importing the engine directly. So this mirrors
// finalizeX402Settlement's own two terminal branches by hand (matched against
// src/lib/payout-intent.ts) rather than calling it, and skips the pricing snapshot and demo
// work-order replenishment finalizeX402Settlement also does -- neither changes whether an
// intent is stuck, and both are easy to add later if this script needs to fully replace it.
import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "../src/lib/db.ts";
import { solanaExplorerTxUrl } from "../src/lib/rails/solana.ts";
import { readSolanaTransaction, x402SettlementProven } from "../src/lib/x402/settlement-proof.ts";
import { X402_SIGNING_CLAIMED, expectedSignatureFromReasonCode } from "../src/lib/x402/signing-recovery.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const olderThanArg = args.find((a) => a.startsWith("--older-than-minutes="));
const olderThanMinutes = olderThanArg ? Number(olderThanArg.split("=")[1]) : 10;

/** Every treasury transaction whose memo names this intent, newest first. Read-only. */
async function findTreasuryPaymentsForIntent(intentId) {
  const address = process.env.SOLANA_ADDRESS?.trim();
  if (!address) throw new Error("SOLANA_ADDRESS is required.");
  const connection = new Connection(process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com", "confirmed");
  const needle = `Tiba payout ${intentId}`;
  const entries = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 1000 });
  return entries.filter((entry) => entry.memo?.includes(needle)).map((entry) => entry.signature);
}

async function main() {
  const since = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const stuck = await prisma.payoutIntent.findMany({
    where: {
      x402Routed: true,
      status: "processing",
      reasonCode: { startsWith: X402_SIGNING_CLAIMED },
      updatedAt: { lt: since }
    },
    select: { id: true, reasonCode: true, updatedAt: true }
  });

  if (stuck.length === 0) {
    console.log(`Nothing stuck at ${X402_SIGNING_CLAIMED} older than ${olderThanMinutes} minutes.`);
    return;
  }

  for (const intent of stuck) {
    const expectedSignature = expectedSignatureFromReasonCode(intent.reasonCode);

    if (!expectedSignature) {
      // Claimed but the process never got as far as producing a signature: nothing could have
      // moved. Same terminal state the existing, tested throw-from-signPayment catch already
      // reaches via finalizeX402Settlement's own "not proven" branch.
      console.log(`${intent.id}: claimed, never signed -- nothing could have moved.`);
      if (apply) {
        const updated = await prisma.payoutIntent.update({
          where: { id: intent.id },
          data: { status: "refused", decisionClass: "RED", reasonCode: "SETTLEMENT_FAILED", digest: null, explorerUrl: null }
        });
        console.log(`  -> marked ${updated.status}/${updated.reasonCode}`);
      } else {
        console.log("  (dry run: would mark SETTLEMENT_FAILED)");
      }
      continue;
    }

    // A signature was produced. Check the treasury's own recent history for a confirmed,
    // error-free transaction that actually carries it before concluding anything.
    const candidates = await findTreasuryPaymentsForIntent(intent.id);
    let proven = null;
    for (const digest of candidates) {
      if (await x402SettlementProven(digest, expectedSignature, readSolanaTransaction)) {
        proven = digest;
        break;
      }
    }

    if (!proven) {
      console.log(`${intent.id}: signed, but no proven payment found in the treasury's recent history yet -- left as is.`);
      continue;
    }

    console.log(`${intent.id}: proven paid via ${proven}.`);
    if (apply) {
      const updated = await prisma.payoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "settled",
          decisionClass: "PAID",
          reasonCode: null,
          digest: proven,
          explorerUrl: solanaExplorerTxUrl(proven)
        }
      });
      console.log(`  -> marked ${updated.status}/${updated.decisionClass}`);
    } else {
      console.log("  (dry run: would mark PAID)");
    }
  }
}

await main();
