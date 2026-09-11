import { NextRequest, NextResponse } from "next/server";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { prisma } from "@/lib/db";
import { isOperatorRequest } from "@/lib/operator-auth";
import { isSolanaAddress } from "@/lib/rails/solana";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  if (!await isOperatorRequest(request)) return unauthorized();
  const recipients = await prisma.recipient.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      ref: recipient.ref,
      display_name: recipient.displayName,
      sui_address: recipient.suiAddress,
      solana_address: recipient.solanaAddress,
      active: recipient.active
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!await isOperatorRequest(request)) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const solanaAddress = optionalString(body.solana_address);
  const suiAddress = optionalString(body.sui_address);
  if (
    typeof body.ref !== "string" ||
    typeof body.display_name !== "string" ||
    !body.ref.trim() ||
    !body.display_name.trim() ||
    (!solanaAddress && !suiAddress)
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  if (solanaAddress && !isSolanaAddress(solanaAddress)) {
    return NextResponse.json({ error: "INVALID_SOLANA_ADDRESS" }, { status: 400 });
  }
  if (suiAddress && !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: "INVALID_SUI_ADDRESS" }, { status: 400 });
  }
  // Same ref twice (an agent re-adding a wallet it already knows) returns the existing record.
  const recipient = await prisma.recipient.upsert({
    where: { ref: body.ref.trim() },
    create: {
      ref: body.ref.trim(),
      displayName: body.display_name.trim(),
      suiAddress: suiAddress || null,
      solanaAddress: solanaAddress || null,
      active: body.active !== false
    },
    update: {}
  });
  return NextResponse.json({
    id: recipient.id,
    ref: recipient.ref,
    sui_address: recipient.suiAddress,
    solana_address: recipient.solanaAddress,
    active: recipient.active
  }, { status: 201 });
}
