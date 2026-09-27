import { requiredChannelsForAmount, type RequiredChannels } from "./reconcile.ts";

/**
 * Deterministic guards the payment path runs before any model check or debit. Pure, so the
 * tests can load them directly; the engine (payout-intent.ts) wires them to the database.
 */

export const IDEMPOTENCY_KEY_IN_USE = "IDEMPOTENCY_KEY_IN_USE";

export const ARTIFACT_TOO_LARGE = "ARTIFACT_TOO_LARGE";
export const INTENT_RATE_LIMITED = "INTENT_RATE_LIMITED";

/** Largest bill (delivery note / invoice text) a payment request may carry. */
export const MAX_ARTIFACT_BYTES = 16 * 1024;
/** Payment requests one workspace may start per rolling hour, refused or not. */
export const INTENTS_PER_WORKSPACE_PER_HOUR = 60;
// ponytail: one deployment-wide count is the backstop against many throwaway mock workspaces;
// raise it or move to per-IP if a real customer ever needs more than 600 checks an hour.
export const INTENTS_PER_DEPLOYMENT_PER_HOUR = 600;

/** Throws before anything is stored when the bill text is over the cap. */
export function assertArtifactSize(artifact: string): void {
  if (Buffer.byteLength(artifact, "utf8") > MAX_ARTIFACT_BYTES) throw new Error(ARTIFACT_TOO_LARGE);
}

/**
 * Every intent counts, refused ones included: each one runs the model checks and stores the
 * bill, and refusals never reached the spend limits before. The counts come from the last hour.
 */
export function intentBudgetExceeded(counts: { mine: number; all: number }): boolean {
  return counts.mine >= INTENTS_PER_WORKSPACE_PER_HOUR || counts.all >= INTENTS_PER_DEPLOYMENT_PER_HOUR;
}

const STRICTNESS: Record<RequiredChannels, number> = { payer_record: 0, both: 1, human: 2 };

/**
 * The checks a payment must pass: the stricter of what the work order stored and what the
 * amount demands (under $50 one check, $50 to $250 both, over $250 a person). A work order can
 * ask for more than its amount requires, never for less. Based on the payer-record amount,
 * because that is the amount that gets debited.
 */
export function effectiveChannels(stored: RequiredChannels, amountMicros: bigint): RequiredChannels {
  const byAmount = requiredChannelsForAmount(amountMicros);
  return STRICTNESS[byAmount] > STRICTNESS[stored] ? byAmount : stored;
}

/**
 * The idempotency key column is unique across the deployment, so a replay lookup can find
 * another workspace's intent. Only the workspace that created the intent may see it again;
 * anyone else is told the key is taken and nothing of the stored intent is returned.
 */
export function assertReplayBelongsTo(existing: { agentId: string }, agent: { id: string }): void {
  if (existing.agentId !== agent.id) throw new Error(IDEMPOTENCY_KEY_IN_USE);
}
