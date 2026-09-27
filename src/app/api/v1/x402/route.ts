import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IDEMPOTENCY_KEY_IN_USE, INTENT_RATE_LIMITED } from "@/lib/payout-guards";
import { finalizeX402Settlement, processPayoutIntent, type PublicIntent } from "@/lib/payout-intent";
import { payX402Resource } from "@/lib/x402/buyer";
import { x402RailRefusal } from "@/lib/x402/gate";
import { guardedX402Fetch, X402_URL_NOT_ALLOWED } from "@/lib/x402/guarded-fetch";
import { ensureX402Obligation } from "@/lib/x402/obligation";
import { treasurySignatureOf } from "@/lib/x402/settlement-proof";
import { X402_SIGNING_CLAIMED, x402SigningReasonCode } from "@/lib/x402/signing-recovery";
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

  // Practice wallets and non-Solana deployments never get the treasury to sign. Checked before
  // the body is read or any address is fetched.
  const railRefusal = x402RailRefusal(agent.rail);
  if (railRefusal) return NextResponse.json({ error: railRefusal }, { status: 403 });

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
        // https only, public hosts only, no redirects: the caller names the address.
        fetch: guardedX402Fetch(),
        authorize: (_workspace, intentBody) =>
          processPayoutIntent(agent, intentBody, { settlement: "defer" }),
        // One signature per intent. The defer branch leaves reasonCode null; this flips it to
        // X402_SIGNING, finalize moves it on (PAID, SETTLEMENT_PENDING or SETTLEMENT_FAILED), so
        // every later call, retried or in parallel, sees count 0 and never signs.
        claimSignature: async (intentId) =>
          (
            await prisma.payoutIntent.updateMany({
              where: { id: intentId, agentId: agent.id, x402Routed: true, status: "processing", reasonCode: null },
              data: { reasonCode: X402_SIGNING_CLAIMED }
            })
          ).count === 1,
        signPayment: (accepted) => signExactSvmPayment(solanaPayerKeypair(), accepted),
        // Overwrites X402_SIGNING with X402_SIGNING:<signature> the moment a signature exists, so
        // a crash before the seller round-trip finishes leaves proof a recovery pass can check
        // on chain instead of a bare, unrecoverable "signing" (gap 3, REVIEW_PR31.md). Scoped the
        // same way the claim itself was, so it can only ever move this exact intent forward.
        recordSigned: async (intentId, expectedSignature) => {
          await prisma.payoutIntent.updateMany({
            where: { id: intentId, agentId: agent.id, x402Routed: true, status: "processing", reasonCode: X402_SIGNING_CLAIMED },
            data: { reasonCode: x402SigningReasonCode(expectedSignature) }
          });
        },
        treasurySignature: (transaction) => treasurySignatureOf(transaction, solanaPayerKeypair().publicKey),
        recordSettlement: (intentId, settlement, expectedSignature) =>
          finalizeX402Settlement(intentId, settlement, expectedSignature),
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
    if (error instanceof Error && error.message === X402_URL_NOT_ALLOWED) {
      return NextResponse.json({ error: X402_URL_NOT_ALLOWED }, { status: 400 });
    }
    if (error instanceof Error && error.message === IDEMPOTENCY_KEY_IN_USE) {
      return NextResponse.json({ error: IDEMPOTENCY_KEY_IN_USE }, { status: 409 });
    }
    if (error instanceof Error && error.message === INTENT_RATE_LIMITED) {
      return NextResponse.json({ error: INTENT_RATE_LIMITED }, { status: 429 });
    }
    console.error("[x402] buyer failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
