import type { Json, Signature } from "./types";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);

export class BrowserTibaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserTibaError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** RFC 8785-compatible for the finite JSON values accepted by Tiba v0.1. */
export function canonicalize(value: Json | unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new BrowserTibaError("Non-finite numbers are not JCS values.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (!isObject(value)) throw new BrowserTibaError("Unsupported JCS value.");
  const entries = Object.keys(value).sort().map((key) => {
    const entry = value[key];
    if (entry === undefined) throw new BrowserTibaError(`Undefined member ${key} is not JSON.`);
    return `${JSON.stringify(key)}:${canonicalize(entry)}`;
  });
  return `{${entries.join(",")}}`;
}

export function withoutSignature<T extends Record<string, unknown>>(value: T): Omit<T, "signature"> {
  const { signature: _signature, ...unsigned } = value;
  return unsigned;
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new BrowserTibaError("Invalid base64url value.");
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = B58[mod] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }
  return encoded || "1";
}

export function base58Decode(input: string): Uint8Array {
  if (!input) throw new BrowserTibaError("Empty base58 key.");
  let value = 0n;
  for (const letter of input) {
    const position = B58.indexOf(letter);
    if (position < 0) throw new BrowserTibaError("did:key contains non-base58 characters.");
    value = value * 58n + BigInt(position);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 255n));
    value >>= 8n;
  }
  let leading = 0;
  while (leading < input.length && input[leading] === "1") leading += 1;
  return new Uint8Array([...Array(leading).fill(0), ...bytes]);
}

export function didFromRawEd25519Key(raw: Uint8Array): string {
  if (raw.length !== 32) throw new BrowserTibaError("Could not extract an Ed25519 public key.");
  const prefixed = new Uint8Array(ED25519_MULTICODEC.length + raw.length);
  prefixed.set(ED25519_MULTICODEC);
  prefixed.set(raw, ED25519_MULTICODEC.length);
  return `did:key:z${base58Encode(prefixed)}`;
}

export type BrowserSigner = {
  did: string;
  signObject: <T extends Record<string, unknown>>(unsigned: T, expectedDid?: string) => Promise<T & { signature: Signature }>;
};

export async function createBrowserSigner(): Promise<BrowserSigner> {
  if (!globalThis.crypto?.subtle) throw new BrowserTibaError("This browser cannot create a signed permission slip.");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const did = didFromRawEd25519Key(rawPublicKey);
  return {
    did,
    async signObject<T extends Record<string, unknown>>(unsigned: T, expectedDid?: string) {
      if (expectedDid && did !== expectedDid) throw new BrowserTibaError("Signing key does not match the permission identity.");
      const bytes = new TextEncoder().encode(canonicalize(withoutSignature(unsigned)));
      const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, bytes));
      return {
        ...withoutSignature(unsigned),
        signature: { alg: "Ed25519", kid: did, value: bytesToBase64url(signature) }
      } as T & { signature: Signature };
    }
  };
}

export async function signObjectInBrowser<T extends Record<string, unknown>>(
  unsigned: T,
  expectedDid?: string
): Promise<T & { signature: Signature }> {
  const signer = await createBrowserSigner();
  return signer.signObject(unsigned, expectedDid);
}
