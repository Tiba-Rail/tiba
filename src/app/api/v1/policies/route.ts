import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveOperatorAgent } from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const agent = await resolveOperatorAgent(request);
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.require_recipient_kyc !== "boolean") {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { requireRecipientKyc: body.require_recipient_kyc }
  });
  return NextResponse.json({ require_recipient_kyc: updated.requireRecipientKyc });
}
