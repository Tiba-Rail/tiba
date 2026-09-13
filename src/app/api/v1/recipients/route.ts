import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isOperatorRequest } from "@/lib/operator-auth";
import { isSolanaAddress } from "@/lib/rails/solana";
export const runtime = "nodejs";
const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
const optionalString = (value: unknown) => typeof value === "string" ? value.trim() : "";
export async function GET(request: NextRequest) { if (!await isOperatorRequest(request)) return unauthorized(); const recipients = await prisma.recipient.findMany({ orderBy: { createdAt: "desc" } }); return NextResponse.json({ recipients: recipients.map((recipient) => ({ id: recipient.id, ref: recipient.ref, display_name: recipient.displayName, solana_address: recipient.solanaAddress, active: recipient.active, needs_solana_address: !recipient.solanaAddress })) }); }
export async function POST(request: NextRequest) {
  if (!await isOperatorRequest(request)) return unauthorized(); let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const solanaAddress = optionalString(body.solana_address);
  if (typeof body.ref !== "string" || typeof body.display_name !== "string" || !body.ref.trim() || !body.display_name.trim() || !solanaAddress) return NextResponse.json({ error: "RECIPIENT_NEEDS_SOLANA_ADDRESS" }, { status: 400 });
  if (!isSolanaAddress(solanaAddress)) return NextResponse.json({ error: "INVALID_SOLANA_ADDRESS" }, { status: 400 });
  const recipient = await prisma.recipient.upsert({ where: { ref: body.ref.trim() }, create: { ref: body.ref.trim(), displayName: body.display_name.trim(), solanaAddress, active: body.active !== false }, update: { solanaAddress, displayName: body.display_name.trim(), active: body.active !== false } });
  return NextResponse.json({ id: recipient.id, ref: recipient.ref, solana_address: recipient.solanaAddress, active: recipient.active, needs_solana_address: !recipient.solanaAddress }, { status: 201 });
}
