import { NextRequest, NextResponse } from "next/server";
import { resolveOperatorAgent } from "@/lib/operator-auth";
import { processPayoutIntent } from "@/lib/payout-intent";

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

  const { artifact, recipient_ref } = body;

  if (typeof artifact !== "string" || !artifact.trim() ||
      typeof recipient_ref !== "string" || !recipient_ref.trim()) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const idempotencyKey = `console-${crypto.randomUUID()}`;

  try {
    const result = await processPayoutIntent(agent, {
      idempotency_key: idempotencyKey,
      artifact: artifact.trim(),
      recipient_ref: recipient_ref.trim()
    });

    return new NextResponse(JSON.stringify({
      id: result.id,
      status: result.status,
      decision_class: result.decisionClass,
      reason_code: result.reasonCode,
      digest: result.digest,
      explorer_url: result.explorerUrl,
      public_token: result.publicToken
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPIENT_NOT_FOUND") {
      return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });
    }
    console.error("[console/test-intent] processing failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
