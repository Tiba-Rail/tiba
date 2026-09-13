import { createHash } from "node:crypto";
import type { IdentityProvider } from "./identity";

/**
 * Terminal 3 identity provider.
 *
 * Tiba runs an org-owned agent on Terminal 3. A recipient who wants to be paid
 * grants that agent exactly one function on their own identity contract:
 * `kyc-status` on `tee:user/contracts`. Tiba then asks Terminal 3, as the agent,
 * whether that grant exists.
 *
 * The answer is enforced on Terminal 3's side, not ours. The same api key gets
 * `authorised: true` for a function the recipient granted and `authorised: false`
 * for one they did not, so a recipient who has never delegated to Tiba cannot be
 * marked verified by anything Tiba does locally.
 *
 * Reading the KYC *value* is deliberately not attempted here. `tee:user::kyc-status`
 * is self-only on Terminal 3: only the identity's own session can read it, and no
 * third-party target DID exists on any path. What Tiba can prove is the delegation,
 * so that is what Tiba stores, and that is all it claims.
 *
 * The only secret this needs is the agent's opaque api key. The account private
 * key stays on the operator's machine and is used solely by `npm run t3:demo`
 * to provision. Nothing that can sign as Faris ever reaches the server.
 */

const CONTRACT = "tee:user/contracts";
const FUNCTION = "kyc-status";
const DEFAULT_TTL_SECONDS = 3600;

type DelegationCheck = { authorised: boolean };

/**
 * The SDK is loaded on first use, not at module load. It ships a WASM component
 * and is only reachable when IDENTITY_PROVIDER=terminal3, so a default Tiba build
 * never touches it. Cached because loading it per request would be absurd.
 */
let sdk: Promise<typeof import("@terminal3/t3n-sdk")> | null = null;
function loadSdk() {
  sdk ??= import("@terminal3/t3n-sdk");
  return sdk;
}

export class Terminal3IdentityProvider implements IdentityProvider {
  name = "terminal3";

  // Plain assignment, not constructor parameter properties: scripts/t3-identity-demo.mjs
  // imports this file directly under Node's strip-only TypeScript mode, which rejects them.
  private apiKey: string;
  private baseUrl: string;
  private ttlSeconds: number;

  constructor(apiKey: string, baseUrl: string, ttlSeconds: number) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.ttlSeconds = ttlSeconds;
  }

  async verify(input: { recipientRef: string; displayName: string; walletAddress: string; t3nDid?: string | null }) {
    // No Terminal 3 identity on file means there is nothing to ask about. This is
    // a refusal, not an error: Tiba pays on proof, and there is no proof here.
    if (!input.t3nDid) {
      return { decision: "failed" as const, checkId: this.checkId(input.recipientRef, "no-did"), expiresAt: null };
    }

    const { discoverCheckDelegation } = await loadSdk();
    const result = (await discoverCheckDelegation(
      { baseUrl: this.baseUrl, apiKey: this.apiKey },
      { contract: CONTRACT, pii_did: input.t3nDid, functions: [FUNCTION], scopes: [] }
    )) as DelegationCheck;

    if (!result.authorised) {
      return { decision: "failed" as const, checkId: this.checkId(input.recipientRef, input.t3nDid), expiresAt: null };
    }
    return {
      decision: "verified" as const,
      checkId: this.checkId(input.recipientRef, input.t3nDid),
      // Deliberately short. The grant Tiba issues is time-boxed on Terminal 3's
      // side, so a stored verdict has to expire and be re-asked rather than
      // outliving the delegation it was based on.
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000)
    };
  }

  private checkId(ref: string, did: string) {
    const digest = createHash("sha256").update(`${ref}:${did}:${FUNCTION}`).digest("hex");
    return `t3n-${digest.slice(0, 16)}`;
  }
}

/**
 * Know Your Agent.
 *
 * Tiba's own agent auth answers "is this api key in my database". That is a
 * question Tiba asks itself, so it proves nothing to anyone else. This asks
 * Terminal 3 instead: hand over nothing but the caller's opaque key and get back
 * who that agent is and which organisation is accountable for it.
 *
 * Useful precisely because Tiba did not issue the key and cannot forge the answer.
 * An agent that was revoked on Terminal 3's side stops resolving here even though
 * Tiba's own database still lists it.
 */
export async function whoIsThisAgent(
  apiKey: string,
  baseUrl = process.env.T3_NODE_URL || "https://cn-api.sg.testnet.t3n.terminal3.io"
): Promise<{ did: string; organisations: string[]; owner: string | null } | null> {
  const { discoverWhoami } = await loadSdk();
  try {
    const r = (await discoverWhoami({ baseUrl, apiKey })) as {
      did?: unknown; organisations?: unknown; owner?: unknown;
    };
    if (!r || typeof r.did !== "string") return null;
    return {
      did: r.did,
      organisations: Array.isArray(r.organisations) ? r.organisations.map(String) : [],
      owner: typeof r.owner === "string" ? r.owner : null
    };
  } catch {
    // An unknown, revoked or expired key is a "no", not a crash. The caller
    // refuses on null; it must never be able to read this as a yes.
    return null;
  }
}

/** Returns null when Terminal 3 is not configured, so the caller can fall back. */
export function terminal3FromEnv(): Terminal3IdentityProvider | null {
  const apiKey = process.env.T3_AGENT_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.T3_NODE_URL || "https://cn-api.sg.testnet.t3n.terminal3.io";
  const ttl = Number(process.env.T3_VERIFY_TTL_SECONDS) || DEFAULT_TTL_SECONDS;
  return new Terminal3IdentityProvider(apiKey, baseUrl, ttl);
}
