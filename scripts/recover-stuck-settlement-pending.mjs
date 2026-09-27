// Finds every plain-rail intent stuck at SETTLEMENT_PENDING (job #379's review, REVIEW_PR31.md,
// gap 4: settleCommittedIntent's own "outcome unknown" branch intentionally leaves it there when
// a send can't be proven either way -- PR #30's body already said the tool to resolve it later
// would be scripts/solana-find-payment.mjs, but that script only ever finds a payment, it never
// writes one back. This is that write-back, and it's read-only until it has real proof.
//
// Usage: node scripts/recover-stuck-settlement-pending.mjs [--older-than-minutes=10] [--apply]
// Without --apply it only reports what it would do. Solana only, same as gap 3's script and for
// the same reason (see "what this does NOT do" at the bottom) -- Tempo/Zcash/mock intents stuck
// at SETTLEMENT_PENDING are listed but skipped, not guessed at.
//
// Deliberately stays off "@/..." aliased modules for the same reason gap 3's script does: those
// only resolve inside Next's bundler.
import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "../src/lib/db.ts";
import { solanaExplorerTxUrl } from "../src/lib/rails/solana.ts";
import { readSolanaTransaction } from "../src/lib/x402/settlement-proof.ts";

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

/** Confirmed + no error -> "paid". Confirmed + an error -> "failed" (chain-proven, safe to
 * reopen). Not found (yet) -> "unknown", never treated as proof of anything. */
async function classify(digest) {
  let onChain;
  try {
    onChain = await readSolanaTransaction(digest);
  } catch {
    return "unknown";
  }
  if (!onChain) return "unknown";
  return onChain.err === null || onChain.err === undefined ? "paid" : "failed";
}

async function markPaid(intent, digest) {
  const updated = await prisma.payoutIntent.update({
    where: { id: intent.id },
    data: { status: "settled", decisionClass: "PAID", reasonCode: null, digest, explorerUrl: solanaExplorerTxUrl(digest) }
  });
  console.log(`  -> marked ${updated.status}/${updated.decisionClass}`);
}

/** Mirrors settleCommittedIntent's own proven-failure branch exactly: reopen the invoice, the
 * debit stays counted (conservative), same as every other proven failure in this codebase. */
async function markFailedAndReopen(intent, digest) {
  if (intent.workOrderId) {
    await prisma.workOrder.updateMany({
      where: { id: intent.workOrderId, dischargedByIntentId: intent.id },
      data: { status: "open", dischargedByIntentId: null }
    });
  }
  const updated = await prisma.payoutIntent.update({
    where: { id: intent.id },
    data: { status: "refused", decisionClass: "RED", reasonCode: "SETTLEMENT_FAILED", digest, explorerUrl: solanaExplorerTxUrl(digest) }
  });
  console.log(`  -> marked ${updated.status}/${updated.reasonCode}, invoice reopened`);
}

async function main() {
  const since = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const stuck = await prisma.payoutIntent.findMany({
    where: { status: "processing", reasonCode: "SETTLEMENT_PENDING", updatedAt: { lt: since } },
    select: { id: true, digest: true, chain: true, workOrderId: true }
  });

  if (stuck.length === 0) {
    console.log(`Nothing stuck at SETTLEMENT_PENDING older than ${olderThanMinutes} minutes.`);
    return;
  }

  for (const intent of stuck) {
    if (intent.chain !== "solana") {
      console.log(`${intent.id}: chain=${intent.chain ?? "(none)"} -- this script only checks Solana. Left as is.`);
      continue;
    }

    // The digest is already ours whenever onSigned fired before the crash (settleCommittedIntent
    // stores it as soon as it's signed, well before confirmation) -- no seller involved on this
    // path, so unlike gap 3's x402 case there's nothing to prove it's "ours", only whether it
    // landed. Fall back to the memo search only when no digest was ever recorded.
    const candidates = intent.digest ? [intent.digest] : await findTreasuryPaymentsForIntent(intent.id);
    if (candidates.length === 0) {
      console.log(`${intent.id}: no digest recorded and nothing found in the treasury's recent history -- left as is.`);
      continue;
    }

    let outcome = "unknown";
    let matchedDigest = null;
    for (const digest of candidates) {
      const result = await classify(digest);
      if (result !== "unknown") {
        outcome = result;
        matchedDigest = digest;
        break;
      }
    }

    if (outcome === "unknown") {
      console.log(`${intent.id}: no proven outcome yet (checked ${candidates.length} candidate(s)) -- left as is.`);
      continue;
    }

    console.log(`${intent.id}: proven ${outcome} via ${matchedDigest}.`);
    if (!apply) {
      console.log(`  (dry run: would mark ${outcome === "paid" ? "PAID" : "SETTLEMENT_FAILED and reopen the invoice"})`);
      continue;
    }
    if (outcome === "paid") await markPaid(intent, matchedDigest);
    else await markFailedAndReopen(intent, matchedDigest);
  }
}

await main();
