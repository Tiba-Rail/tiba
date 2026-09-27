import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { PaymentRequirements, ResourceInfo, X402Agent } from "./types.ts";
import type { X402Obligation } from "./buyer.ts";

function workOrderRefFor(idempotencyKey: string): string {
  return `X402-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12)}`;
}

/**
 * Channel B needs an open work order matching the 402 amount. The recipient must already
 * be on this workspace's allowlist — creating one here would bypass it.
 */
export async function ensureX402Obligation(
  agent: X402Agent,
  accepted: PaymentRequirements,
  resource: ResourceInfo,
  idempotencyKey: string
): Promise<X402Obligation> {
  const recipient = await prisma.recipient.findFirst({
    where: { agentId: agent.id, solanaAddress: accepted.payTo }
  });
  if (!recipient) throw new Error("RECIPIENT_NOT_FOUND");

  const ref = workOrderRefFor(idempotencyKey);
  const existing = await prisma.workOrder.findUnique({ where: { ref } });
  if (existing) {
    if (existing.recipientId !== recipient.id) throw new Error("X402_WORK_ORDER_MISMATCH");
    return { recipientRef: recipient.ref, workOrderRef: existing.ref };
  }

  const amountMicros = BigInt(accepted.amount);
  const workOrder = await prisma.workOrder.create({
    data: {
      ref,
      recipientId: recipient.id,
      ceilingMicros: amountMicros,
      briefText: resource.description?.trim() || `x402 ${resource.url}`,
      payerRecord: {
        delivery_status: "verified_complete",
        approved_amount_micros: amountMicros.toString(),
        resource_url: resource.url
      },
      requiredChannels: "both",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "open"
    }
  });
  return { recipientRef: recipient.ref, workOrderRef: workOrder.ref };
}
