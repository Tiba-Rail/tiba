import { createHash } from "node:crypto";

/**
 * Identity / compliance (eKYC) provider abstraction. One more input to the
 * refuse-or-pay decision, gated per agent by `requireRecipientKyc` (default off).
 * Tiba stores the provider's verdict on the recipient; it never becomes a KYC product.
 */
export interface IdentityProvider {
  name: string;
  verify(input: { recipientRef: string; displayName: string; suiAddress: string }): Promise<{
    decision: "verified" | "failed" | "review";
    checkId: string;
    expiresAt: Date | null;
  }>;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Deterministic stand-in: a ref containing "fail" fails, anything else verifies for one year. */
export class MockIdentityProvider implements IdentityProvider {
  name = "mock";

  async verify(input: { recipientRef: string; displayName: string; suiAddress: string }) {
    const decision = input.recipientRef.includes("fail") ? "failed" as const : "verified" as const;
    const digest = createHash("sha256").update(`${input.recipientRef}:${input.suiAddress}`).digest("hex");
    return {
      decision,
      checkId: `mock-${digest.slice(0, 16)}`,
      expiresAt: decision === "verified" ? new Date(Date.now() + ONE_YEAR_MS) : null
    };
  }
}

// IDENTITY_PROVIDER is reserved for real providers (e.g. "persona", "sumsub").
// Only the mock exists today; an unknown value falls through to it.
export function getIdentityProvider(): IdentityProvider {
  return new MockIdentityProvider();
}
