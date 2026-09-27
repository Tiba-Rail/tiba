// One demo bounty with two claims, for the bounty-flow demo video. NOT run automatically —
// run by hand:
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/seed-bounty-demo.mjs
// (the loader lets this plain script import files that use the project's "@/" path alias, the
// same alias Next.js's own bundler already understands for every other file in src/).
// Adds to whatever is already in the database (uses the oldest existing Agent as the program
// owner); does not delete anything, unlike scripts/seed.mjs. Forces MOCK_SETTLEMENT so the paid
// claim settles deterministically on the built-in mock rail rather than attempting a real
// Solana devnet transfer, which this script has no reliable way to guarantee succeeds (network
// reachability and a funded treasury key are both outside its control) -- the two-channel
// agreement, the ceiling check and the debit are still the real, unmocked logic; only the literal
// on-chain send is stood in for.
import "dotenv/config";

// Set after dotenv/config loads .env, so this always wins regardless of what .env says.
process.env.MOCK_SETTLEMENT = "1";

const { prisma } = await import("../src/lib/db.ts");
const { submitBountyClaim, uniqueShareCode } = await import("../src/lib/bounty-claim.ts");

// A canned, deterministic two-channel model response so this script never needs a real model
// call (no GROQ_API_KEY, no network, no flakiness on camera). It reads the actual work-order id
// and requested amount out of the real prompt the real code built, so the two channels always
// agree with each other and with the real ceiling check that runs after them -- this is
// exercising the same reconcile()/evaluateBeforeDebit() path a real pay would take, just with a
// scripted "model" standing in for the network call.
function fakeGonka() {
  return async (request) => {
    const body = JSON.parse(request.messages[1].content);
    if (request.channel === "artifact") {
      const workOrderId = body.open_work_order_ids[0];
      return {
        ok: true,
        model: "seed-script-fake-model",
        content: JSON.stringify({
          work_order_id: workOrderId,
          amount_micros: body.artifact_text_and_links.match(/Amount requested: ([\d.]+)/)?.[1]
            ? String(Math.round(Number(body.artifact_text_and_links.match(/Amount requested: ([\d.]+)/)[1]) * 1_000_000))
            : "0",
          delivery_timestamp: body.delivery_event_metadata.received_at,
          evidence: "seed script: read the claim text"
        }),
        latencyMs: 5
      };
    }
    const workOrder = body.open_work_orders[0];
    return {
      ok: true,
      model: "seed-script-fake-model",
      content: JSON.stringify({
        work_order_id: workOrder.id,
        amount_micros: workOrder.payer_record.approved_amount_micros,
        delivery_timestamp: body.delivery_event_metadata.received_at,
        record_basis: "seed script: read the bounty's own record"
      }),
      latencyMs: 5
    };
  };
}

const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
if (!agent) {
  console.error("No agent/workspace exists yet. Run scripts/seed.mjs first, or create a workspace via /start.");
  process.exit(1);
}

const shareCode = await uniqueShareCode();
const bounty = await prisma.bounty.create({
  data: {
    agentId: agent.id,
    title: "Write the Solana devnet quickstart guide",
    doneCriteria: "A short guide showing a new contributor how to get devnet USDC and send their first test transfer. Published and linked.",
    amountMicros: 50_000_000n, // 50.00 USDC
    allowedClaimers: [],
    shareCode,
    status: "open"
  }
});

// Claim 1: asks for the full bounty amount, on the allow list (open bounty, so anyone
// qualifies) -- reconciles and pays.
const paidClaim = await submitBountyClaim(agent, bounty, {
  workLink: "https://example.com/devnet-quickstart-draft",
  claimerSolanaAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  amountAskedMicros: 50_000_000n,
  summary: "Wrote and published the quickstart guide, linked above.",
}, { gonka: fakeGonka() });

// Claim 2: asks for more than the bounty pays -- refused by the deterministic gate, before any
// model call.
const refusedClaim = await submitBountyClaim(agent, bounty, {
  workLink: "https://example.com/devnet-quickstart-alt",
  claimerSolanaAddress: "7XSburR4L4oCGTh4hRqEDkVfDUCwPWjV6cMuxpEWZFFV",
  amountAskedMicros: 75_000_000n,
  summary: "Also wrote a guide, but asked for more than the posted reward.",
}, { gonka: fakeGonka() });

console.log(JSON.stringify({
  agent_id: agent.id,
  bounty_id: bounty.id,
  share_code: bounty.shareCode,
  share_url_path: `/b/${bounty.shareCode}`,
  paid_claim: { id: paidClaim.claimId, status: paidClaim.intent.status, decision_class: paidClaim.intent.decisionClass, receipt: `/r/${paidClaim.intent.publicToken}` },
  refused_claim: { id: refusedClaim.claimId, status: refusedClaim.intent.status, reason_code: refusedClaim.intent.reasonCode, receipt: `/r/${refusedClaim.intent.publicToken}` }
}, null, 2));

await prisma.$disconnect();
