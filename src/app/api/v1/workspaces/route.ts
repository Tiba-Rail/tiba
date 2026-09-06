import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MICROS_PER_USDC = 1_000_000n;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeKey(prefix: string): { key: string; hash: string; keyPrefix: string } {
  const secret = randomBytes(32).toString("base64url");
  const key = `${prefix}${secret}`;
  return { key, hash: hash(key), keyPrefix: key.slice(0, 12) };
}

function defaultSuiAddress(provided?: string): string {
  if (provided && provided.trim()) return provided.trim();
  const env = process.env.SUI_ADDRESS?.trim();
  if (env) return env;
  return "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef";
}

function detectRail(): "mock" | "sui" {
  if (
    process.env.SUI_NETWORK === "testnet" &&
    process.env.SUI_PRIVATE_KEY &&
    process.env.SUI_PRIVATE_KEY.trim()
  ) {
    return "sui";
  }
  return "mock";
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retry_after: Math.ceil((limit.resetAt - Date.now()) / 1000) },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  }

  const suiAddress = defaultSuiAddress(typeof body.sui_address === "string" ? body.sui_address : undefined);
  const suffix = randomBytes(4).toString("hex");

  const agentKey = makeKey("tiba_live_");
  const ownerKey = makeKey("tiba_owner_");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [agent, recipient] = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        name,
        apiKeyHash: agentKey.hash,
        apiKeyPrefix: agentKey.keyPrefix,
        ownerTokenHash: ownerKey.hash,
        ownerTokenPrefix: ownerKey.keyPrefix,
        // Every workspace settles from one shared testnet wallet, so a new signup gets
        // enough room to try a payment and nowhere near enough to drain it.
        ceilingMicros: 5n * MICROS_PER_USDC,
        hourCapMicros: 10n * MICROS_PER_USDC,
        dayCapMicros: 20n * MICROS_PER_USDC,
        hourCountCap: 5,
        dayCountCap: 20,
        killSwitch: false,
        requireRecipientKyc: false,
        rail: detectRail()
      }
    });

    const recipient = await tx.recipient.create({
      data: {
        id: `recipient-${suffix}`,
        ref: `owner-${suffix}`,
        displayName: "Example recipient",
        suiAddress,
        active: true,
        kycStatus: "verified",
        kycProvider: "onboarding",
        kycVerifiedAt: now
      }
    });

    await tx.workOrder.create({
      data: {
        id: `work-order-${suffix}`,
        recipientId: recipient.id,
        ref: `WO-${suffix.toUpperCase()}`,
        ceilingMicros: 5n * MICROS_PER_USDC,
        briefText: "First invoice for your new wallet.",
        payerRecord: {
          approved_amount_micros: "5000000",
          delivery_status: "verified_complete",
          source: "onboarding"
        },
        requiredChannels: "both",
        expiresAt,
        status: "open"
      }
    });

    return [agent, recipient];
  });

  return NextResponse.json({
    workspace_id: agent.id,
    name: agent.name,
    rail: agent.rail,
    agent_key: agentKey.key,
    agent_key_prefix: agentKey.keyPrefix,
    owner_key: ownerKey.key,
    owner_key_prefix: ownerKey.keyPrefix,
    recipient_ref: recipient.ref,
    work_order_ref: `WO-${suffix.toUpperCase()}`,
    sui_address: recipient.suiAddress
  }, { status: 201 });
}
