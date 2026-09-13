import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSolanaAddress } from "@/lib/rails/solana";
import { clientIp, rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
const MICROS_PER_USDC = 1_000_000n;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function makeKey(prefix: string) { const secret = randomBytes(32).toString("base64url"); const key = `${prefix}${secret}`; return { key, hash: hash(key), keyPrefix: key.slice(0, 12) }; }
const optionalAddress = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
export async function POST(request: NextRequest) {
  let userId: string | undefined; try { userId = (await auth())?.user?.id; } catch { /* Anonymous onboarding is supported. */ }
  const limit = rateLimit(clientIp(request)); if (!limit.ok) return NextResponse.json({ error: "RATE_LIMITED", retry_after: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : ""; if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  const solanaAddress = optionalAddress(body.solana_address) ?? process.env.SOLANA_ADDRESS?.trim();
  if (!solanaAddress) return NextResponse.json({ error: "SOLANA_ADDRESS_REQUIRED" }, { status: 503 });
  if (!isSolanaAddress(solanaAddress)) return NextResponse.json({ error: "INVALID_SOLANA_ADDRESS" }, { status: 400 });
  const suffix = randomBytes(4).toString("hex"); const agentKey = makeKey("tiba_live_"); const ownerKey = makeKey("tiba_owner_"); const now = new Date(); const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const createWorkspace = () => prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({ data: { name, apiKeyHash: agentKey.hash, apiKeyPrefix: agentKey.keyPrefix, ownerTokenHash: ownerKey.hash, ownerTokenPrefix: ownerKey.keyPrefix, ceilingMicros: 5n * MICROS_PER_USDC, hourCapMicros: 10n * MICROS_PER_USDC, dayCapMicros: 20n * MICROS_PER_USDC, hourCountCap: 5, dayCountCap: 20, killSwitch: false, requireRecipientKyc: false, rail: "solana", ...(userId ? { userId } : {}) } });
    const recipient = await tx.recipient.create({ data: { id: `recipient-${suffix}`, ref: `owner-${suffix}`, displayName: "Example recipient", solanaAddress, active: true, kycStatus: "verified", kycProvider: "onboarding", kycVerifiedAt: now } });
    await tx.workOrder.create({ data: { id: `work-order-${suffix}`, recipientId: recipient.id, ref: `WO-${suffix.toUpperCase()}`, ceilingMicros: 5n * MICROS_PER_USDC, briefText: "First invoice for your new wallet.", payerRecord: { approved_amount_micros: "5000000", delivery_status: "verified_complete", source: "onboarding" }, requiredChannels: "both", expiresAt, status: "open" } });
    return [agent, recipient] as const;
  });
  let created: Awaited<ReturnType<typeof createWorkspace>>; try { created = await createWorkspace(); } catch (error) { if ((error as { code?: string })?.code !== "P2028") throw error; await new Promise((resolve) => setTimeout(resolve, 500)); created = await createWorkspace(); }
  const [agent, recipient] = created;
  return NextResponse.json({ workspace_id: agent.id, name: agent.name, rail: agent.rail, agent_key: agentKey.key, agent_key_prefix: agentKey.keyPrefix, owner_key: ownerKey.key, owner_key_prefix: ownerKey.keyPrefix, recipient_ref: recipient.ref, work_order_ref: `WO-${suffix.toUpperCase()}`, solana_address: recipient.solanaAddress }, { status: 201 });
}
