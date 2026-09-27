// Pure, deterministic bounty-claim logic -- no Prisma, no `@/` imports, so it loads under plain
// `node --test` the same way reconcile.ts and policy.ts do. The database-touching orchestration
// that calls these lives in bounty-claim.ts.
import { microsToUsdc } from "./money.ts";

export const BOUNTY_WORK_LINK_MAX_LENGTH = 2_048;
export const BOUNTY_SUMMARY_MAX_LENGTH = 8_000;

export type ClaimGateReason =
  | "INVALID_AMOUNT"
  | "CLAIM_OVER_BOUNTY"
  | "CLAIMER_NOT_ALLOWED"
  | "BOUNTY_CLOSED";

export type ClaimGateResult = { ok: true } | { ok: false; reasonCode: ClaimGateReason };

export interface ClaimInput {
  amountAskedMicros: bigint;
  claimerSolanaAddress: string;
}

export interface BountyForGate {
  amountMicros: bigint;
  allowedClaimers: string[];
}

export function claimTextWithinLimits(input: {
  workLink: string;
  summary: string;
}): boolean {
  return (
    input.workLink.length <= BOUNTY_WORK_LINK_MAX_LENGTH &&
    input.summary.length <= BOUNTY_SUMMARY_MAX_LENGTH
  );
}

export function requiredChannelsForBounty(
  bounty: Pick<BountyForGate, "allowedClaimers">
): "both" | "human" {
  return bounty.allowedClaimers.length > 0 ? "both" : "human";
}

export function bountyStatusAfter(input: {
  status: string;
  reasonCode: string | null;
}): "paid" | "open" | "paying" {
  if (input.status === "settled") return "paid";
  const reason = input.reasonCode ?? "";
  if (
    input.status === "refused" &&
    reason !== "SETTLEMENT_FAILED" &&
    !reason.startsWith("QUORUM_SPLIT")
  ) {
    return "open";
  }
  return "paying";
}

/**
 * Deterministic pre-checks, before any model call or database write -- same philosophy as
 * evaluateBeforeDebit in policy.ts: no model output is trusted here, and these are checked
 * first because they are cheap and certain. Neither check exists in the generic invoice flow
 * (a work order already has exactly one fixed recipient and no "maximum a claimant may ask"
 * distinct from its own ceiling), so this is new, bounty-specific logic; everything past this
 * gate reuses processPayoutIntent/reconcile unchanged.
 */
export function evaluateClaimGate(bounty: BountyForGate, claim: ClaimInput): ClaimGateResult {
  if (claim.amountAskedMicros <= 0n) return { ok: false, reasonCode: "INVALID_AMOUNT" };
  if (claim.amountAskedMicros > bounty.amountMicros) return { ok: false, reasonCode: "CLAIM_OVER_BOUNTY" };
  if (bounty.allowedClaimers.length > 0 && !bounty.allowedClaimers.includes(claim.claimerSolanaAddress)) {
    return { ok: false, reasonCode: "CLAIMER_NOT_ALLOWED" };
  }
  return { ok: true };
}

export interface BountyForRecord {
  id: string;
  title: string;
  doneCriteria: string;
}

/**
 * The claim becomes the bill (the "artifact" channel reads this free-text submission); the
 * bounty becomes the payer's own record of what's owed (the "payer_record" channel reads this
 * JSON) -- the same two-channel shape processPayoutIntent already expects, just built from
 * bounty/claim data instead of an invoice. approved_amount_micros/delivery_status are the exact
 * keys payerRecordSystemPrompt (src/lib/prompts.ts) requires; the rest is audit context.
 */
export function buildBountyPayerRecord(
  bounty: BountyForRecord,
  claimId: string,
  amountAskedMicros: bigint
): Record<string, string> {
  return {
    approved_amount_micros: amountAskedMicros.toString(),
    delivery_status: "verified_complete",
    bounty_id: bounty.id,
    bounty_title: bounty.title,
    done_criteria: bounty.doneCriteria,
    claim_id: claimId
  };
}

export function buildClaimArtifactText(
  bounty: BountyForRecord,
  claim: { workLink: string; summary: string; amountAskedMicros: bigint }
): string {
  return [
    `Bounty claim for "${bounty.title}".`,
    `Work: ${claim.workLink}`,
    `What I did: ${claim.summary}`,
    `Amount requested: ${microsToUsdc(claim.amountAskedMicros)}`
  ].join("\n");
}
