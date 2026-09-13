import { createHash } from "node:crypto";
import { terminal3FromEnv } from "./identity-terminal3.ts";

/**
 * Identity / compliance (eKYC) provider abstraction. One more input to the
 * refuse-or-pay decision, gated per agent by `requireRecipientKyc` (default off).
 * Tiba stores the provider's verdict on the recipient; it never becomes a KYC product.
 */
export interface IdentityProvider {
  name: string;
  verify(input: {
    recipientRef: string;
    displayName: string;
    walletAddress: string;
    /** The recipient's Terminal 3 identity, when they have one. Providers that do not use it ignore it. */
    t3nDid?: string | null;
  }): Promise<{
    decision: "verified" | "failed" | "review";
    checkId: string;
    expiresAt: Date | null;
  }>;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The gate condition the intents route refuses on. A recipient passes only with a
 * stored `verified` verdict that has not expired; `kycExpiresAt = null` never expires
 * (seed/backfill data has no expiry by design).
 */
export function recipientIdentityOk(
  recipient: { kycStatus: string; kycExpiresAt: Date | null },
  now: Date
): boolean {
  if (recipient.kycStatus !== "verified") return false;
  return recipient.kycExpiresAt === null || recipient.kycExpiresAt.getTime() >= now.getTime();
}

/** Deterministic stand-in: a ref ending in "-fail" fails, anything else verifies for one year. */
export class MockIdentityProvider implements IdentityProvider {
  name = "mock";

  async verify(input: { recipientRef: string; displayName: string; walletAddress: string }) {
    const decision = input.recipientRef.endsWith("-fail") ? "failed" as const : "verified" as const;
    const digest = createHash("sha256").update(`${input.recipientRef}:${input.walletAddress}`).digest("hex");
    return {
      decision,
      checkId: `mock-${digest.slice(0, 16)}`,
      expiresAt: decision === "verified" ? new Date(Date.now() + ONE_YEAR_MS) : null
    };
  }
}

// IDENTITY_PROVIDER selects the real provider. "terminal3" asks Terminal 3 whether
// the recipient has delegated Tiba's agent the right to read their KYC status.
// An unknown value, or terminal3 without an agent key configured, falls through to
// the mock rather than failing open on a payment decision.
export function getIdentityProvider(): IdentityProvider {
  if (process.env.IDENTITY_PROVIDER === "terminal3") {
    const t3 = terminal3FromEnv();
    if (t3) return t3;
  }
  return new MockIdentityProvider();
}
