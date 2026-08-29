import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isOperatorRequest } from "@/lib/operator-auth";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!isOperatorRequest(request)) return unauthorized();
  const recipients = await prisma.recipient.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      ref: recipient.ref,
      display_name: recipient.displayName,
      sui_address: recipient.suiAddress,
      active: recipient.active
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!isOperatorRequest(request)) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (
    typeof body.ref !== "string" ||
    typeof body.display_name !== "string" ||
    typeof body.sui_address !== "string" ||
    !body.ref.trim() ||
    !body.display_name.trim() ||
    !body.sui_address.trim()
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const recipient = await prisma.recipient.create({
    data: {
      ref: body.ref.trim(),
      displayName: body.display_name.trim(),
      suiAddress: body.sui_address.trim(),
      active: body.active !== false
    }
  });
  return NextResponse.json({
    id: recipient.id,
    ref: recipient.ref,
    active: recipient.active
  }, { status: 201 });
}
