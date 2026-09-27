import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Agent, Bounty, BountyClaim } from "@prisma/client";
import { prisma } from "@/lib/db";
import { processPayoutIntent, type ProcessPayoutOptions, type PublicIntent } from "@/lib/payout-intent";
import {
  buildBountyPayerRecord,
  buildClaimArtifactText,
  bountyStatusAfter,
  evaluateClaimGate,
  requiredChannelsForBounty,
  type ClaimGateReason
} from "@/lib/bounty-claim-gate";

export {
  bountyStatusAfter,
  buildBountyPayerRecord,
  buildClaimArtifactText,
  evaluateClaimGate,
  requiredChannelsForBounty
} from "@/lib/bounty-claim-gate";
export type { ClaimGateReason, ClaimGateResult, ClaimInput, BountyForGate, BountyForRecord } from "@/lib/bounty-claim-gate";

function shortCode(): string {
  return randomBytes(5).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 7).toLowerCase();
}

/** A share code unique across every bounty; regenerates on the rare collision. */
export async function uniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = shortCode();
    const existing = await prisma.bounty.findUnique({ where: { shareCode: code } });
    if (!existing) return code;
  }
  throw new Error("SHARE_CODE_EXHAUSTED");
}

function refuseClaim(intentId: string, reasonCode: ClaimGateReason) {
  return prisma.payoutIntent.update({
    where: { id: intentId },
    data: { status: "refused", decisionClass: "RED", reasonCode }
  });
}

async function recordRefusedClaim(
  agent: Agent,
  bounty: Bounty,
  claim: BountyClaim,
  recipientId: string,
  reasonCode: ClaimGateReason
): Promise<{ claimId: string; intent: PublicIntent }> {
  const artifact = buildClaimArtifactText(bounty, claim);
  const intent = await prisma.payoutIntent.create({
    data: {
      agentId: agent.id,
      recipientId,
      status: "processing",
      decisionClass: "AMBER",
      idempotencyKey: `bounty-claim:${claim.id}`,
      publicToken: randomUUID(),
      artifact: {
        create: {
          rawText: artifact,
          sha256: createHash("sha256").update(artifact).digest("hex")
        }
      }
    }
  });
  const refused = await refuseClaim(intent.id, reasonCode);
  await prisma.bountyClaim.update({
    where: { id: claim.id },
    data: { payoutIntentId: intent.id }
  });
  return {
    claimId: claim.id,
    intent: {
      id: refused.id,
      status: refused.status,
      decisionClass: refused.decisionClass,
      reasonCode: refused.reasonCode,
      digest: refused.digest,
      explorerUrl: refused.explorerUrl,
      publicToken: refused.publicToken,
      chain: refused.chain,
      signature: refused.digest,
      x402Routed: refused.x402Routed
    }
  };
}

export interface SubmitClaimOptions {
  gonka?: ProcessPayoutOptions["gonka"];
}

/**
 * Runs one claim through the deterministic gate, then -- if it passes -- through the real,
 * unmodified processPayoutIntent: a fresh Recipient (this claim's own Solana address, scoped to
 * the bounty's workspace) and WorkOrder (ceiling = the bounty amount, payer record = the bounty's
 * terms) stand in for an invoice's recipient+work-order, and the claim text is the artifact. Every
 * claim gets a real PayoutIntent and a real /r/<token> receipt, paid or refused alike -- including
 * a gate refusal, which still needs a real intent row to be link-shareable and honest about why.
 */
export async function submitBountyClaim(
  agent: Agent,
  bounty: Bounty,
  input: {
    workLink: string;
    claimerSolanaAddress: string;
    amountAskedMicros: bigint;
    summary: string;
  },
  options: SubmitClaimOptions = {}
): Promise<{ claimId: string; intent: PublicIntent }> {
  const claim = await prisma.bountyClaim.create({
    data: {
      bountyId: bounty.id,
      workLink: input.workLink,
      claimerSolanaAddress: input.claimerSolanaAddress,
      amountAskedMicros: input.amountAskedMicros,
      summary: input.summary
    }
  });

  // The claimer's own Recipient row is created either way, refused or not: it's who they said
  // they are, and a refusal receipt naming the real claimer is more honest than a placeholder.
  const recipient = await prisma.recipient.create({
    data: {
      ref: `bounty-claim:${claim.id}`,
      displayName: `Bounty claimant ${input.claimerSolanaAddress.slice(0, 4)}…${input.claimerSolanaAddress.slice(-4)}`,
      solanaAddress: input.claimerSolanaAddress,
      active: true,
      agentId: agent.id
    }
  });

  const gate = evaluateClaimGate(bounty, input);
  if (!gate.ok) {
    return recordRefusedClaim(agent, bounty, claim, recipient.id, gate.reasonCode);
  }

  const locked = await prisma.bounty.updateMany({
    where: { id: bounty.id, status: "open" },
    data: { status: "paying" }
  });
  if (locked.count !== 1) {
    return recordRefusedClaim(agent, bounty, claim, recipient.id, "BOUNTY_CLOSED");
  }

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await prisma.workOrder.create({
    data: {
      ref: `bounty-claim:${claim.id}`,
      recipientId: recipient.id,
      ceilingMicros: bounty.amountMicros,
      briefText: `${bounty.title} — ${bounty.doneCriteria}`,
      payerRecord: buildBountyPayerRecord(bounty, claim.id, input.amountAskedMicros),
      requiredChannels: requiredChannelsForBounty(bounty),
      expiresAt,
      status: "open"
    }
  });

  const intent = await processPayoutIntent(agent, {
    idempotency_key: `bounty-claim:${claim.id}`,
    artifact: buildClaimArtifactText(bounty, claim),
    recipient_ref: recipient.ref
  }, options.gonka ? { gonka: options.gonka } : {});

  await prisma.bounty.update({
    where: { id: bounty.id },
    data: { status: bountyStatusAfter(intent) }
  });
  await prisma.bountyClaim.update({ where: { id: claim.id }, data: { payoutIntentId: intent.id } });
  return { claimId: claim.id, intent };
}
