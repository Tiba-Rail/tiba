import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveOperatorAgent } from "@/lib/operator-auth";
import { parseUsdcToMicros } from "@/lib/money";
import { uniqueShareCode } from "@/lib/bounty-claim";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

/** The program owner's own bounties, newest first. Owner-only, like the other workspace lists. */
export async function GET(request: NextRequest) {
  const agent = await resolveOperatorAgent(request);
  if (!agent) return unauthorized();
  const bounties = await prisma.bounty.findMany({
    where: { agentId: agent.id },
    include: { _count: { select: { claims: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({
    bounties: bounties.map((bounty) => ({
      id: bounty.id,
      title: bounty.title,
      done_criteria: bounty.doneCriteria,
      amount_micros: bounty.amountMicros.toString(),
      allowed_claimers: bounty.allowedClaimers,
      share_code: bounty.shareCode,
      status: bounty.status,
      claim_count: bounty._count.claims
    }))
  });
}

/** Post a bounty: title, reward and what counts as done, and an optional Solana-address
 *  allowlist. Empty/omitted allowlist means open to anyone. */
export async function POST(request: NextRequest) {
  const agent = await resolveOperatorAgent(request);
  if (!agent) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const amountMicros = parseUsdcToMicros(body.amount_usdc);
  const allowedClaimers = Array.isArray(body.allowed_claimers)
    ? body.allowed_claimers.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
    : [];

  if (
    typeof body.title !== "string" || !body.title.trim() ||
    typeof body.done_criteria !== "string" || !body.done_criteria.trim() ||
    amountMicros === null || amountMicros <= 0n
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const shareCode = await uniqueShareCode();
  const bounty = await prisma.bounty.create({
    data: {
      agentId: agent.id,
      title: body.title.trim(),
      doneCriteria: body.done_criteria.trim(),
      amountMicros,
      allowedClaimers,
      shareCode,
      status: "open"
    }
  });

  return NextResponse.json({
    id: bounty.id,
    share_code: bounty.shareCode,
    status: bounty.status
  }, { status: 201 });
}
