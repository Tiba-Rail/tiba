import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getIdentityProvider } from "@/lib/identity";
import { isOperatorRequest } from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { ref } = await context.params;
  const recipient = await prisma.recipient.findUnique({ where: { ref } });
  if (!recipient) return NextResponse.json({ error: "RECIPIENT_NOT_FOUND" }, { status: 404 });

  const provider = getIdentityProvider();
  const result = await provider.verify({
    recipientRef: recipient.ref,
    displayName: recipient.displayName,
    suiAddress: recipient.suiAddress
  });
  const updated = await prisma.recipient.update({
    where: { id: recipient.id },
    data: {
      kycStatus: result.decision,
      kycProvider: provider.name,
      kycCheckId: result.checkId,
      kycVerifiedAt: result.decision === "verified" ? new Date() : null,
      kycExpiresAt: result.expiresAt
    }
  });
  return NextResponse.json({
    ref: updated.ref,
    kyc_status: updated.kycStatus,
    kyc_provider: updated.kycProvider,
    kyc_check_id: updated.kycCheckId,
    kyc_verified_at: updated.kycVerifiedAt,
    kyc_expires_at: updated.kycExpiresAt
  });
}
