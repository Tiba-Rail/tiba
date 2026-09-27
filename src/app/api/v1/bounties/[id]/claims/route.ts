import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUsdcToMicros } from "@/lib/money";
import { submitBountyClaim } from "@/lib/bounty-claim";
import { claimTextWithinLimits } from "@/lib/bounty-claim-gate";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function findBounty(id: string) {
  return prisma.bounty.findFirst({
    where: { OR: [{ id }, { shareCode: id }] },
    include: { agent: true }
  });
}

/** A bounty's own claims and their outcome, for the public claim page. No operator auth: this is
 *  what anyone considering a claim, or checking one they already made, is meant to see. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = await findBounty(id);
  if (!bounty) return NextResponse.json({ error: "BOUNTY_NOT_FOUND" }, { status: 404 });

  const claims = await prisma.bountyClaim.findMany({
    where: { bountyId: bounty.id },
    include: { payoutIntent: true },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    claims: claims.map((claim) => ({
      id: claim.id,
      work_link: claim.workLink,
      claimer_solana_address: claim.claimerSolanaAddress,
      amount_asked_micros: claim.amountAskedMicros.toString(),
      summary: claim.summary,
      status: claim.payoutIntent?.status ?? "processing",
      decision_class: claim.payoutIntent?.decisionClass ?? "AMBER",
      reason_code: claim.payoutIntent?.reasonCode ?? null,
      public_token: claim.payoutIntent?.publicToken ?? null,
      created_at: claim.createdAt.toISOString()
    }))
  });
}

/** Submit a claim: no sign-in, no owner key -- anyone with a Solana address and a link to their
 *  work can claim an open bounty. Every claim runs through the same check as an invoice payout
 *  and gets a real receipt, paid or refused. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = await findBounty(id);
  if (!bounty) return NextResponse.json({ error: "BOUNTY_NOT_FOUND" }, { status: 404 });
  if (bounty.status !== "open") return NextResponse.json({ error: "BOUNTY_CLOSED" }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const amountAskedMicros = parseUsdcToMicros(body.amount_asked_usdc);
  const claimerSolanaAddress = typeof body.claimer_solana_address === "string" ? body.claimer_solana_address.trim() : "";
  if (
    typeof body.work_link !== "string" || !body.work_link.trim() ||
    typeof body.summary !== "string" || !body.summary.trim() ||
    !SOLANA_ADDRESS_RE.test(claimerSolanaAddress) ||
    amountAskedMicros === null || amountAskedMicros <= 0n
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  if (!claimTextWithinLimits({ workLink: body.work_link, summary: body.summary })) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const limited = rateLimit(clientIp(request.headers));
  if (!limited.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const claimsInLastDay = await prisma.bountyClaim.count({
    where: {
      bountyId: bounty.id,
      createdAt: { gte: new Date(Date.now() - 86_400_000) }
    }
  });
  if (claimsInLastDay >= 100) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { claimId, intent } = await submitBountyClaim(bounty.agent, bounty, {
    workLink: body.work_link.trim(),
    claimerSolanaAddress,
    amountAskedMicros,
    summary: body.summary.trim()
  });

  return NextResponse.json({
    claim_id: claimId,
    id: intent.id,
    status: intent.status,
    decision_class: intent.decisionClass,
    reason_code: intent.reasonCode,
    public_token: intent.publicToken
  }, { status: 201 });
}
