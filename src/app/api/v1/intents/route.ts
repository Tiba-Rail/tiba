import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processPayoutIntent, type PublicIntent } from "@/lib/payout-intent";

export const runtime = "nodejs";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function apiKey(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function response(intent: PublicIntent) {
  return NextResponse.json({
    id: intent.id,
    status: intent.status,
    decision_class: intent.decisionClass,
    reason_code: intent.reasonCode,
    digest: intent.digest,
    signature: intent.signature,
    chain: intent.chain,
    explorer_url: intent.explorerUrl,
    public_token: intent.publicToken
  });
}

export async function POST(request: NextRequest) {
  const secret = apiKey(request);
  if (!secret) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const agent = await prisma.agent.findUnique({ where: { apiKeyHash: hash(secret) } });
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { idempotency_key?: unknown; artifact?: unknown; recipient_ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (
    typeof body.idempotency_key !== "string" ||
    typeof body.artifact !== "string" ||
    typeof body.recipient_ref !== "string" ||
    !body.idempotency_key ||
    !body.artifact ||
    !body.recipient_ref
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const result = await processPayoutIntent(agent, {
      idempotency_key: body.idempotency_key,
      artifact: body.artifact,
      recipient_ref: body.recipient_ref
    });
    return response(result);
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPIENT_NOT_FOUND") {
      return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });
    }
    console.error("[intents] processing failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
