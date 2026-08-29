import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isOperatorRequest } from "@/lib/operator-auth";
import { parseUsdcToMicros } from "@/lib/money";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!isOperatorRequest(request)) return unauthorized();
  const workOrders = await prisma.workOrder.findMany({
    include: { recipient: true },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({
    work_orders: workOrders.map((workOrder) => ({
      id: workOrder.id,
      ref: workOrder.ref,
      recipient_ref: workOrder.recipient.ref,
      recipient_display_name: workOrder.recipient.displayName,
      ceiling_micros: workOrder.ceilingMicros.toString(),
      expires_at: workOrder.expiresAt.toISOString(),
      status: workOrder.status,
      required_channels: workOrder.requiredChannels
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

  const ceilingMicros = parseUsdcToMicros(body.ceiling_usdc);
  const expiresAt = typeof body.expires_at === "string" ? new Date(body.expires_at) : null;
  const requiredChannels = typeof body.required_channels === "string" ? body.required_channels : "both";
  if (
    typeof body.ref !== "string" ||
    typeof body.recipient_ref !== "string" ||
    typeof body.brief_text !== "string" ||
    !body.ref.trim() ||
    !body.recipient_ref.trim() ||
    !body.brief_text.trim() ||
    ceilingMicros === null ||
    ceilingMicros <= 0n ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    !["payer_record", "both", "human"].includes(requiredChannels)
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const recipient = await prisma.recipient.findUnique({ where: { ref: body.recipient_ref } });
  if (!recipient) return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });

  let payerRecord: Prisma.InputJsonValue = {};
  if (typeof body.payer_record === "string" && body.payer_record.trim()) {
    try {
      const parsed = JSON.parse(body.payer_record) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad json");
      payerRecord = parsed as Prisma.InputJsonObject;
    } catch {
      return NextResponse.json({ error: "INVALID_PAYER_RECORD_JSON" }, { status: 400 });
    }
  }

  const workOrder = await prisma.workOrder.create({
    data: {
      ref: body.ref.trim(),
      recipientId: recipient.id,
      ceilingMicros,
      briefText: body.brief_text.trim(),
      payerRecord,
      requiredChannels,
      expiresAt,
      status: "open"
    }
  });

  return NextResponse.json({
    id: workOrder.id,
    ref: workOrder.ref,
    status: workOrder.status
  }, { status: 201 });
}
