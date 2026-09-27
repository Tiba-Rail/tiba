import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import type { RefusalDraft } from "./fool-it.ts";
import { refusalRecord, sandboxWorkspacePlan } from "./fool-it.ts";
import { SANDBOX_AGENT_ID, SANDBOX_RECIPIENT_ID, SANDBOX_WORK_ORDER_ROW_ID } from "./fool-it-sample.ts";

/**
 * Opens the sandbox workspace and writes a refused receipt.
 * This file does not import a payout rail and does not settle.
 */
export async function ensureSandboxWorkspace(now = new Date()): Promise<void> {
  const existing = await prisma.agent.findUnique({ where: { id: SANDBOX_AGENT_ID } });
  const apiKeyHash = existing?.apiKeyHash ?? createHash("sha256").update(randomBytes(32)).digest("hex");
  const plan = sandboxWorkspacePlan(now, apiKeyHash);
  await prisma.agent.upsert({
    where: { id: SANDBOX_AGENT_ID },
    create: plan.agent,
    update: {
      name: plan.agent.name,
      rail: "mock",
      killSwitch: false,
      ceilingMicros: 0n,
      hourCapMicros: 0n,
      dayCapMicros: plan.agent.dayCapMicros,
      hourCountCap: 0,
      dayCountCap: 0
    }
  });
  await prisma.recipient.upsert({
    where: { id: SANDBOX_RECIPIENT_ID },
    create: plan.recipient,
    update: {
      ref: plan.recipient.ref,
      displayName: plan.recipient.displayName,
      solanaAddress: null,
      active: true,
      agentId: SANDBOX_AGENT_ID
    }
  });
  await prisma.workOrder.upsert({
    where: { id: SANDBOX_WORK_ORDER_ROW_ID },
    create: plan.workOrder,
    update: {
      ref: plan.workOrder.ref,
      ceilingMicros: plan.workOrder.ceilingMicros,
      briefText: plan.workOrder.briefText,
      payerRecord: plan.workOrder.payerRecord,
      requiredChannels: "both",
      expiresAt: plan.workOrder.expiresAt,
      status: "open",
      dischargedByIntentId: null
    }
  });
}

export async function saveSandboxRefusal(draft: RefusalDraft): Promise<{ publicToken: string }> {
  await ensureSandboxWorkspace();
  const publicToken = randomUUID();
  const row = refusalRecord(draft, publicToken, `fool-it-${publicToken}`);
  const intent = await prisma.payoutIntent.create({
    data: {
      ...row.intent,
      gnkUsd: null,
      pricingUpdatedAt: null,
      artifact: { create: row.artifact },
      adjudications: {
        create: row.adjudications.map((entry) => ({
          channel: entry.channel,
          model: entry.model,
          requestId: entry.requestId,
          fallback: entry.fallback,
          promptSha: entry.promptSha,
          responseSha: entry.responseSha,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          latencyMs: entry.latencyMs,
          tupleJson: entry.tupleJson as Prisma.InputJsonValue | undefined,
          ok: entry.ok
        }))
      }
    }
  });
  return { publicToken: intent.publicToken };
}
