import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const WALLET_NONCE_COOKIE = "tiba_wallet_nonce";
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

function canonicalAddress(value: string): string | null {
  const address = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{1,64}$/.test(address)) return null;
  return `0x${address.slice(2).padStart(64, "0")}`;
}

export function normalizeWalletAddress(value: string): string | null {
  return canonicalAddress(value);
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
  expiresAt: number;
  maxAge: number;
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
