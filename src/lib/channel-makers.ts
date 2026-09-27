/**
 * Which company read a channel, and whether a fallback left both checks on one company.
 * Test networks only. These helpers never move money.
 */

export const SAME_MODEL_NOTE =
  "This time both checks used the same model because the other was unavailable.";

export type RequiredChannelBand = "payer_record" | "both" | "human";

/** The model id on the channel result is the one that answered. Adjudications store this. */
export function modelAnsweredWith(result: { model: string }): string {
  return result.model;
}

function makerKey(model: string): string {
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("qwen/")) return "alibaba";
  return model;
}

function makerPhrase(model: string | null | undefined): string | null {
  if (!model) return null;
  if (model.startsWith("openai/")) return "OpenAI's model";
  if (model.startsWith("qwen/")) return "Alibaba's model";
  return null;
}

/**
 * True when both checks had to run and a fallback left them answered by the same
 * maker. The payment still pays or refuses on its own. Under $50 only the payer's
 * record is required, so this note is not stored there.
 */
export function sameMakerFallback(input: {
  requiredChannels: RequiredChannelBand;
  artifactModel: string | null | undefined;
  payerModel: string | null | undefined;
  artifactAnswered: boolean;
  payerAnswered: boolean;
  artifactPrimary: string;
  payerPrimary: string;
}): boolean {
  if (input.requiredChannels !== "both") return false;
  if (!input.artifactAnswered || !input.payerAnswered) return false;
  if (!input.artifactModel || !input.payerModel) return false;
  if (makerKey(input.artifactModel) !== makerKey(input.payerModel)) return false;
  const fellBack =
    input.artifactModel !== input.artifactPrimary || input.payerModel !== input.payerPrimary;
  return fellBack;
}

/** The receipt sentence for a same-maker fallback. Empty when that did not happen. */
export function receiptSameModelNote(sameMaker: boolean): string | null {
  return sameMaker ? SAME_MODEL_NOTE : null;
}

/** Plain sentences for the receipt. Empty when neither channel has a known maker. */
export function receiptMakerSentences(input: {
  artifactModel?: string | null;
  payerModel?: string | null;
}): string {
  const parts: string[] = [];
  const bill = makerPhrase(input.artifactModel);
  const record = makerPhrase(input.payerModel);
  if (bill) parts.push(`The bill was read by ${bill}.`);
  if (record) parts.push(`Your record was read by ${record}.`);
  return parts.join(" ");
}
