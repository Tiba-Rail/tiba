import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalizeX402Settlement, processPayoutIntent, type PublicIntent } from "@/lib/payout-intent";
import { payX402Resource } from "@/lib/x402/buyer";
import { ensureX402Obligation } from "@/lib/x402/obligation";
import { signExactSvmPayment } from "@/lib/x402/svm";
import { solanaPayerKeypair } from "@/lib/rails/solana";

export const runtime = "nodejs";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function apiKey(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function intentBody(intent: PublicIntent) {
  return {
    id: intent.id,
    status: intent.status,
    decision_class: intent.decisionClass,
    reason_code: intent.reasonCode,
    digest: intent.digest,
    signature: intent.signature,
    chain: intent.chain,
    explorer_url: intent.explorerUrl,
    public_token: intent.publicToken,
    x402_routed: intent.x402Routed
  };
}

export async function POST(request: NextRequest) {
  const secret = apiKey(request);
  if (!secret) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const agent = await prisma.agent.findUnique({ where: { apiKeyHash: hash(secret) } });
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { url?: unknown; method?: unknown; idempotency_key?: unknown; headers?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url || typeof body.idempotency_key !== "string" || !body.idempotency_key) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const method = typeof body.method === "string" && body.method ? body.method : "GET";
  const headers =
    body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)
      ? Object.fromEntries(
          Object.entries(body.headers as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : undefined;

  try {
    const result = await payX402Resource(
      agent,
      {
        url: body.url,
        method,
        headers,
        body: typeof body.body === "string" ? body.body : null,
        idempotency_key: body.idempotency_key
      },
      {
        fetch,
        authorize: (_workspace, intentBody) =>
          processPayoutIntent(agent, intentBody, { settlement: "defer" }),
        signPayment: (accepted) => signExactSvmPayment(solanaPayerKeypair(), accepted),
        recordSettlement: finalizeX402Settlement,
        ensureObligation: ensureX402Obligation
      }
    );

    if (result.kind === "free") {
      return NextResponse.json({ kind: "free", status: result.status, body: result.body });
    }
    if (result.kind === "paid") {
      return NextResponse.json({
        kind: "paid",
        status: result.status,
        body: result.body,
        settlement: result.settlement,
        intent: intentBody(result.intent)
      });
    }
    if (result.kind === "refused") {
      return NextResponse.json({
        kind: "refused",
        error: result.error ?? result.intent.reasonCode,
        intent: intentBody(result.intent)
      });
    }
    const status = result.error === "RECIPIENT_NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { kind: "error", error: result.error, intent: result.intent ? intentBody(result.intent) : undefined },
      { status }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPIENT_NOT_FOUND") {
      return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });
    }
    console.error("[x402] buyer failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
