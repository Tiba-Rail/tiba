import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization") ?? "";
  const secret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const agent = secret ? await prisma.agent.findUnique({ where: { apiKeyHash: createHash("sha256").update(secret).digest("hex") } }) : null;
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  const intent = await prisma.payoutIntent.findFirst({ where: { id, agentId: agent.id }, include: { adjudications: true, artifact: true } });
  if (!intent) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    id: intent.id, status: intent.status, decision_class: intent.decisionClass, reason_code: intent.reasonCode,
    amount_micros: intent.amountMicros.toString(), digest: intent.digest, explorer_url: intent.explorerUrl,
    public_token: intent.publicToken,
    adjudications: intent.adjudications.map((row) => ({
      channel: row.channel,
      model: row.model,
      requestId: row.requestId,
      latencyMs: row.latencyMs,
      ok: row.ok,
      tuple: row.tupleJson
    }))
  });
}
