/** Bitcoin/Solana base58, enough to turn a 64-byte signature into its transaction id. No dependency. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A Solana signature or transaction id: 64 bytes in base58, 64 to 88 characters. */
export const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export function isBase58Signature(value: string): boolean {
  return BASE58_SIGNATURE.test(value);
}

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}
