import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { defaultChain } from "@/lib/rails";
import { isSolanaAddress } from "@/lib/rails/solana";
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

function optionalAddress(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function defaultSuiAddress(): string {
  const env = process.env.SUI_ADDRESS?.trim();
  if (env) return env;
  return "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef";
}

// "sui" is the stored live rail; the chain is picked per recipient at payout time.
function detectRail(): "mock" | "sui" {
  const suiLive = process.env.SUI_NETWORK === "testnet" && Boolean(process.env.SUI_PRIVATE_KEY?.trim());
  const solanaNetwork = process.env.SOLANA_NETWORK?.trim() || process.env.SOLANA_CLUSTER?.trim();
  const solanaLive = solanaNetwork === "devnet" && Boolean(process.env.SOLANA_PRIVATE_KEY?.trim());
  return suiLive || solanaLive ? "sui" : "mock";
}

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    userId = (await auth())?.user?.id;
  } catch {
    // Anonymous onboarding remains available when auth has not been configured.
  }

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

  const providedSolana = optionalAddress(body.solana_address);
  const providedSui = optionalAddress(body.sui_address);
  if (providedSolana && !isSolanaAddress(providedSolana)) {
    return NextResponse.json({ error: "INVALID_SOLANA_ADDRESS" }, { status: 400 });
  }
  if (providedSui && !isValidSuiAddress(providedSui)) {
    return NextResponse.json({ error: "INVALID_SUI_ADDRESS" }, { status: 400 });
  }
  // A given address is kept on its own chain. With none, the demo recipient gets the default
  // chain's treasury address, falling back to Sui when no Solana treasury is configured.
  const solanaAddress = providedSolana ?? (defaultChain() === "solana" ? process.env.SOLANA_ADDRESS?.trim() || null : null);
  const suiAddress = providedSui ?? (solanaAddress ? null : defaultSuiAddress());
  const suffix = randomBytes(4).toString("hex");

  const agentKey = makeKey("tiba_live_");
  const ownerKey = makeKey("tiba_owner_");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Neon cold starts make Prisma miss its transaction-open deadline (P2028); one retry clears it.
  const createWorkspace = () => prisma.$transaction(async (tx) => {
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
        rail: detectRail(),
        ...(userId ? { userId } : {})
      }
    });

    const recipient = await tx.recipient.create({
      data: {
        id: `recipient-${suffix}`,
        ref: `owner-${suffix}`,
        displayName: "Example recipient",
        suiAddress,
        solanaAddress,
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

    return [agent, recipient] as const;
  });
  let created: Awaited<ReturnType<typeof createWorkspace>>;
  try {
    created = await createWorkspace();
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2028") throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    created = await createWorkspace();
  }
  const [agent, recipient] = created;

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
    sui_address: recipient.suiAddress,
    solana_address: recipient.solanaAddress
  }, { status: 201 });
}
