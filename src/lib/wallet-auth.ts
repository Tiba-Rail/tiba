import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const WALLET_NONCE_COOKIE = "tiba_wallet_nonce";
// DER header of an Ed25519 SubjectPublicKeyInfo; node:crypto has no raw 32-byte key loader.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const CHALLENGE_TTL_SECONDS = 5 * 60;

type ChallengePayload = {
  address: string;
  nonce: string;
  expiresAt: number;
};

function authSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || null;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

// Branch on format BEFORE any lowercasing: base58 (Solana) is case-sensitive.
function canonicalAddress(value: string): string | null {
  const trimmed = value.trim();
  if (/^0x/i.test(trimmed)) {
    const address = trimmed.toLowerCase();
    if (!/^0x[0-9a-f]{1,64}$/.test(address)) return null;
    return `0x${address.slice(2).padStart(64, "0")}`;
  }
  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    return null;
  }
}

export function normalizeWalletAddress(value: string): string | null {
  return canonicalAddress(value);
}

export function walletChain(canonical: string): "sui" | "solana" {
  return canonical.startsWith("0x") ? "sui" : "solana";
}

// Solana wallets sign the raw message bytes with the account's ed25519 key.
// `signature` is the 64-byte signature, base64-encoded by the browser.
export function verifySolanaSignature(address: string, message: string, signature: string): boolean {
  try {
    const bytes = Buffer.from(signature, "base64");
    if (bytes.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, new PublicKey(address).toBuffer()]),
      format: "der",
      type: "spki"
    });
    return verify(null, Buffer.from(message, "utf8"), key, bytes);
  } catch {
    return false;
  }
}

export function walletMessage(payload: Pick<ChallengePayload, "address" | "nonce">): string {
  return [
    "Sign in to Tiba",
    "",
    `Address: ${payload.address}`,
    `Nonce: ${payload.nonce}`,
    "This signature does not authorize a transaction or move funds."
  ].join("\n");
}

export function createWalletChallenge(addressValue: string): {
  address: string;
  nonce: string;
  message: string;
  cookieValue: string;
  maxAge: number;
  expiresAt: number;
} | null {
  const secret = authSecret();
  const address = canonicalAddress(addressValue);
  if (!secret || !address) return null;

  const payload: ChallengePayload = {
    address,
    nonce: randomBytes(24).toString("hex"),
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000
  };
  const encoded = encode(JSON.stringify(payload));
  return {
    ...payload,
    message: walletMessage(payload),
    cookieValue: `${encoded}.${sign(encoded, secret)}`,
    maxAge: CHALLENGE_TTL_SECONDS
  };
}

export function verifyWalletChallenge(input: {
  cookieValue: string | undefined;
  addressValue: string;
  nonce: string;
  message: string;
}): { address: string; nonce: string } | null {
  const secret = authSecret();
  const address = canonicalAddress(input.addressValue);
  if (!secret || !address || !input.cookieValue) return null;

  const [encoded, signature] = input.cookieValue.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(signature);
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    return null;
  }

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(decode(encoded)) as ChallengePayload;
  } catch {
    return null;
  }

  if (
    payload.address !== address ||
    payload.nonce !== input.nonce ||
    payload.expiresAt < Date.now() ||
    walletMessage(payload) !== input.message
  ) {
    return null;
  }

  return { address, nonce: payload.nonce };
}
