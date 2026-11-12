import { microsToUsdc } from "./money.ts";

/** Non-negative micros from a stored intent amount or a check's tuple field. */
export function parseNonNegativeMicros(value: unknown): bigint | null {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function tupleRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Amount Check 1 read on the bill. Null when that check did not name one. */
export function billAmountMicros(adjudications: unknown): bigint | null {
  if (!Array.isArray(adjudications)) return null;
  for (const row of adjudications) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (record.channel !== "artifact") continue;
    const tuple = tupleRecord(record.tupleJson);
    return parseNonNegativeMicros(tuple ? tuple.amount_micros : null);
  }
  return null;
}

/**
 * Amount a refusal was asked to pay. A refusal before the debit stores 0, which is
 * not the ask. The bill's reading is the amount asked for. A stored non-zero amount
 * was written down and is kept.
 * Null when nothing named an amount: do not render that as 0.00.
 */
export function amountAskedMicros(stored: unknown, adjudications: unknown): bigint | null {
  const storedMicros = parseNonNegativeMicros(stored);
  if (storedMicros !== null && storedMicros > 0n) return storedMicros;
  const bill = billAmountMicros(adjudications);
  if (bill !== null && bill > 0n) return bill;
  return null;
}

/** Header amount on a receipt. Digits only; the page adds the coin name. */
export function receiptAmountLines(input: {
  paid: boolean;
  amountMicros: unknown;
  adjudications: unknown;
}): { label: string; digits: string; unread: boolean; micros: bigint | null } {
  const stored = parseNonNegativeMicros(input.amountMicros) ?? 0n;
  if (input.paid) {
    return {
      label: "Amount",
      digits: microsToUsdc(stored).replace(/ USDC$/, ""),
      unread: false,
      micros: stored
    };
  }
  if (stored === 0n) {
    const asked = amountAskedMicros(stored, input.adjudications);
    if (asked !== null) {
      return {
        label: "Bill asked for",
        digits: microsToUsdc(asked).replace(/ USDC$/, ""),
        unread: false,
        micros: asked
      };
    }
    return { label: "Amount", digits: "Not read", unread: true, micros: null };
  }
  return {
    label: "Amount asked for",
    digits: microsToUsdc(stored).replace(/ USDC$/, ""),
    unread: false,
    micros: stored
  };
}
