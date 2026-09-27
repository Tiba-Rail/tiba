/**
 * How a claimed-but-not-yet-settled x402 intent's reasonCode carries proof material, so a crash
 * between signing and the seller round-trip leaves something a recovery pass can actually use
 * (job #379's review, REVIEW_PR31.md, gap 3). No schema change: this is still the same
 * reasonCode string column every other refusal reason already lives in.
 */
export const X402_SIGNING = "X402_SIGNING";
const SIGNED_PREFIX = "X402_SIGNING:";

/** What claimSignature sets the moment the claim lands -- no signature exists yet. */
export const X402_SIGNING_CLAIMED = X402_SIGNING;

/** What recordSigned overwrites it with the moment signPayment succeeds. */
export function x402SigningReasonCode(expectedSignature: string): string {
  return `${SIGNED_PREFIX}${expectedSignature}`;
}

/**
 * Reads a reasonCode written by x402SigningReasonCode. Returns null for the bare X402_SIGNING
 * (claimed, never signed -- nothing could have moved) and for anything that isn't this shape at
 * all, so a caller can tell "no proof material" apart from "here it is".
 */
export function expectedSignatureFromReasonCode(reasonCode: string | null): string | null {
  if (!reasonCode || !reasonCode.startsWith(SIGNED_PREFIX)) return null;
  const signature = reasonCode.slice(SIGNED_PREFIX.length);
  return signature || null;
}
