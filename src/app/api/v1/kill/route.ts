import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isOperatorRequest } from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
  if (!agent) return NextResponse.json({ error: "NO_AGENT" }, { status: 404 });
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { killSwitch: body.enabled }
  });
  return NextResponse.json({ agent_id: updated.id, kill_switch: updated.killSwitch });
}
