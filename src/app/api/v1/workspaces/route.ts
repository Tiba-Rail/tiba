import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { setOwnerCookie } from "@/lib/operator-auth";
import { isSolanaAddress } from "@/lib/rails/solana";
import { clientIp, onboardingRail, rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
const MICROS_PER_USDC = 1_000_000n;
// Live (treasury-backed) workspaces the whole deployment may create per 24 hours. Each can spend at
// most its 20 USDC daily limit, so this cap bounds onboarding's daily treasury exposure.
const LIVE_ONBOARDING_DAILY_CAP = Number(process.env.LIVE_ONBOARDING_DAILY_CAP ?? 20);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function makeKey(prefix: string) { const secret = randomBytes(32).toString("base64url"); const key = `${prefix}${secret}`; return { key, hash: hash(key), keyPrefix: key.slice(0, 12) }; }
const optionalAddress = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
export async function POST(request: NextRequest) {
  let userId: string | undefined; try { userId = (await auth())?.user?.id; } catch { /* Anonymous onboarding is supported. */ }
  const limit = rateLimit(clientIp(request.headers)); if (!limit.ok) return NextResponse.json({ error: "RATE_LIMITED", retry_after: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : ""; if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  const solanaAddress = optionalAddress(body.solana_address) ?? process.env.SOLANA_ADDRESS?.trim();
  if (!solanaAddress) return NextResponse.json({ error: "SOLANA_ADDRESS_REQUIRED" }, { status: 503 });
  if (!isSolanaAddress(solanaAddress)) return NextResponse.json({ error: "INVALID_SOLANA_ADDRESS" }, { status: 400 });
  // Anonymous sign-ups settle on the simulated rail; signed-in ones on Solana devnet within the caps.
  // ponytail: count-then-create is not atomic, so simultaneous sign-ups can pass a cap by a few
  // (they are still rate limited). Take a Postgres advisory lock if that ever matters.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [userLiveWorkspaces, liveWorkspacesToday] = userId ? await Promise.all([prisma.agent.count({ where: { userId, rail: "solana" } }), prisma.agent.count({ where: { rail: "solana", userId: { not: null }, createdAt: { gte: since } } })]) : [0, 0];
  const rail = onboardingRail({ signedIn: Boolean(userId), userLiveWorkspaces, liveWorkspacesToday, dailyCap: LIVE_ONBOARDING_DAILY_CAP });
  const suffix = randomBytes(4).toString("hex"); const agentKey = makeKey("tiba_live_"); const ownerKey = makeKey("tiba_owner_"); const now = new Date(); const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const createWorkspace = () => prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({ data: { name, apiKeyHash: agentKey.hash, apiKeyPrefix: agentKey.keyPrefix, ownerTokenHash: ownerKey.hash, ownerTokenPrefix: ownerKey.keyPrefix, ceilingMicros: 5n * MICROS_PER_USDC, hourCapMicros: 10n * MICROS_PER_USDC, dayCapMicros: 20n * MICROS_PER_USDC, hourCountCap: 5, dayCountCap: 20, killSwitch: false, requireRecipientKyc: false, rail, ...(userId ? { userId } : {}) } });
    const recipient = await tx.recipient.create({ data: { id: `recipient-${suffix}`, ref: `owner-${suffix}`, displayName: "Example recipient", solanaAddress, active: true, kycStatus: "verified", kycProvider: "onboarding", kycVerifiedAt: now, agentId: agent.id } });
    await tx.workOrder.create({ data: { id: `work-order-${suffix}`, recipientId: recipient.id, ref: `WO-${suffix.toUpperCase()}`, ceilingMicros: 5n * MICROS_PER_USDC, briefText: "First invoice for your new wallet.", payerRecord: { approved_amount_micros: "5000000", delivery_status: "verified_complete", source: "onboarding" }, requiredChannels: "both", expiresAt, status: "open" } });
    return [agent, recipient] as const;
  });
  let created: Awaited<ReturnType<typeof createWorkspace>>; try { created = await createWorkspace(); } catch (error) { if ((error as { code?: string })?.code !== "P2028") throw error; await new Promise((resolve) => setTimeout(resolve, 500)); created = await createWorkspace(); }
  const [agent, recipient] = created;
  const response = NextResponse.json({ workspace_id: agent.id, name: agent.name, rail: agent.rail, agent_key: agentKey.key, agent_key_prefix: agentKey.keyPrefix, owner_key: ownerKey.key, owner_key_prefix: ownerKey.keyPrefix, recipient_ref: recipient.ref, work_order_ref: `WO-${suffix.toUpperCase()}`, solana_address: recipient.solanaAddress }, { status: 201 });
  setOwnerCookie(response, ownerKey.key); // The creator can open the new wallet's pages right away.
  return response;
}
