import { microsToUsdc } from "./money.ts";
import { receiptNetwork } from "./receipt-network.ts";

// What the public receipt page already shows, and nothing past it.
// Workspace secrets (keys, addresses, payer records, delivery notes) are not read.
export type WallOutcome = "PAID" | "REFUSED" | "HELD";

export type WallMismatch = {
  field: string;
  bill: string;
  record: string;
};

export type WallRow = {
  outcome: WallOutcome;
  outcomeLabel: string;
  amount: string;
  chain: string;
  time: string;
  timeIso: string;
  href: string;
  mismatch: WallMismatch | null;
  reason: string | null;
};

export type RefusalWall = {
  checksRun: number;
  paid: number;
  simulatedPaid: number;
  refused: number;
  /** Of `refused`, how many named a real (nonzero) amount asked for -- older refusals from
   *  before an amount was ever attached, and many gate refusals (no open invoice, wrong
   *  recipient), never had one. */
  refusedWithAmount: number;
  /** Sum over refusedWithAmount only. Null when refusedWithAmount is 0: there is nothing to
   *  add up, and "0.00 USDC" would misreport that as a real total instead of "no data yet". */
  refusedAmount: string | null;
  rows: WallRow[];
};

export type RefusalWallTotals = Omit<RefusalWall, "refusedAmount" | "rows"> & {
  refusedAmountMicros: bigint | string | null;
};

const NOT_READ = "not read";

// Same plain sentences the receipt uses for a refusal that is not a field mismatch.
function publicRefusalReason(reasonCode: string | null): string {
  if (reasonCode?.startsWith("QUORUM_SPLIT")) {
    if (reasonCode === "QUORUM_SPLIT:work_order_id") return "The two checks named different invoices.";
    if (reasonCode === "QUORUM_SPLIT:amount_micros") return "The two checks named different amounts.";
    if (reasonCode === "QUORUM_SPLIT:delivery_timestamp") return "The two checks gave different delivery dates.";
    return "The two checks disagreed.";
  }

  switch (reasonCode) {
    case "DAY_AMOUNT_CAP": return "This would take your software past its daily spending limit.";
    case "HOUR_AMOUNT_CAP": return "This would take your software past its hourly spending limit.";
    case "DAY_COUNT_CAP": return "Your software has already made its maximum number of payments today.";
    case "HOUR_COUNT_CAP": return "Your software has already made its maximum number of payments this hour.";
    case "TRANSACTION_CEILING": return "The amount is more than any single payment may be.";
    case "WORK_ORDER_CEILING": return "The amount is more than this invoice allows.";
    case "WORK_ORDER_EXPIRED": return "The invoice named has passed its deadline.";
    case "WORK_ORDER_NOT_OPEN": return "The invoice named is closed.";
    case "NO_OPEN_OBLIGATION": return "No invoice awaiting delivery matches this delivery note.";
    case "RECIPIENT_NOT_FOUND": return "This recipient is not saved.";
    case "RECIPIENT_INACTIVE": return "This recipient is saved but blocked.";
    case "RECIPIENT_UNVERIFIED": return "This recipient's identity is not verified, and your limits require it.";
    case "KILL_SWITCH": return "The wallet is frozen.";
    case "INVALID_AMOUNT": return "The amount in this request was not valid.";
    case "INVALID_TIMESTAMP": return "A date in this request was not valid.";
    case "RECIPIENT_NEEDS_SOLANA_ADDRESS": return "Recipient needs a Solana address.";
    case "RECIPIENT_NEEDS_TEMPO_ADDRESS": return "Recipient needs a Tempo address.";
    case "SETTLEMENT_FAILED":
    case "SOLANA_EXECUTION_FAILED":
    case "TEMPO_EXECUTION_FAILED":
    case "ZCASH_EXECUTION_FAILED":
      return "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.";
    default:
      return "Refused before any money moved.";
  }
}

const SPLIT_FIELDS: Record<string, { key: "work_order_id" | "amount_micros" | "delivery_timestamp"; label: string }> = {
  "QUORUM_SPLIT:work_order_id": { key: "work_order_id", label: "Invoice" },
  "QUORUM_SPLIT:amount_micros": { key: "amount_micros", label: "Amount" },
  "QUORUM_SPLIT:delivery_timestamp": { key: "delivery_timestamp", label: "Delivery date" }
};

export function formatWallTime(value: Date): string {
  const formatted = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC"
  }).format(value);
  return `${formatted} UTC`;
}

function publicToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) return null;
  return token;
}

function parseMicros(value: unknown): bigint | null {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function asDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

function tupleRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function reading(adjudications: unknown, channel: "artifact" | "payer_record"): Record<string, unknown> | null {
  if (!Array.isArray(adjudications)) return null;
  for (const row of adjudications) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (record.channel !== channel) continue;
    return tupleRecord(record.tupleJson);
  }
  return null;
}

function fieldText(tuple: Record<string, unknown> | null, key: string): string | null {
  if (!tuple) return null;
  const value = tuple[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 120) return null;
  return trimmed;
}

function fieldAmount(tuple: Record<string, unknown> | null): string | null {
  const micros = parseMicros(tuple ? tuple.amount_micros : null);
  if (micros === null) return null;
  return microsToUsdc(micros);
}

function fieldTime(tuple: Record<string, unknown> | null): string | null {
  const raw = fieldText(tuple, "delivery_timestamp");
  if (!raw) return null;
  const date = asDate(raw);
  if (!date) return null;
  return formatWallTime(date);
}

function sideValue(
  tuple: Record<string, unknown> | null,
  key: "work_order_id" | "amount_micros" | "delivery_timestamp"
): string {
  if (key === "amount_micros") return fieldAmount(tuple) ?? NOT_READ;
  if (key === "delivery_timestamp") return fieldTime(tuple) ?? NOT_READ;
  return fieldText(tuple, key) ?? NOT_READ;
}

function mismatchFor(reasonCode: string | null, adjudications: unknown): WallMismatch | null {
  if (!reasonCode?.startsWith("QUORUM_SPLIT")) return null;
  const spec = SPLIT_FIELDS[reasonCode];
  if (!spec) return null;
  const bill = reading(adjudications, "artifact");
  const record = reading(adjudications, "payer_record");
  return {
    field: spec.label,
    bill: sideValue(bill, spec.key),
    record: sideValue(record, spec.key)
  };
}

function outcomeFor(decisionClass: unknown): { outcome: WallOutcome; outcomeLabel: string } | null {
  if (decisionClass === "PAID") return { outcome: "PAID", outcomeLabel: "Paid" };
  if (decisionClass === "RED") return { outcome: "REFUSED", outcomeLabel: "Refused" };
  if (decisionClass === "AMBER") return { outcome: "HELD", outcomeLabel: "Needs approval" };
  if (typeof decisionClass === "string" && decisionClass.trim()) {
    return { outcome: "HELD", outcomeLabel: "Receipt" };
  }
  return null;
}

type Prepared = WallRow & { at: number; refusedMicros: bigint; simulated: boolean };

export function isSimulatedSettlement(chain: string | null): boolean {
  return chain === "mock" || chain === "sandbox" || chain === null;
}

function prepare(input: unknown): Prepared | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const token = publicToken(row.publicToken);
  const outcome = outcomeFor(row.decisionClass);
  const at = asDate(row.createdAt);
  if (!token || !outcome || !at) return null;

  const micros = parseMicros(row.amountMicros) ?? 0n;
  const reasonCode = typeof row.reasonCode === "string" ? row.reasonCode : null;
  const mismatch = outcome.outcome === "REFUSED" ? mismatchFor(reasonCode, row.adjudications) : null;
  const reason = outcome.outcome === "REFUSED" && !mismatch
    ? publicRefusalReason(reasonCode)
    : null;
  const rawChain = typeof row.chain === "string" ? row.chain : null;

  return {
    outcome: outcome.outcome,
    outcomeLabel: outcome.outcomeLabel,
    amount: microsToUsdc(micros),
    chain: receiptNetwork(rawChain),
    time: formatWallTime(at),
    timeIso: at.toISOString(),
    href: `/r/${token}`,
    mismatch,
    reason,
    at: at.getTime(),
    refusedMicros: outcome.outcome === "REFUSED" ? micros : 0n,
    simulated: isSimulatedSettlement(rawChain)
  };
}

export function buildRefusalWall(
  records: readonly unknown[],
  aggregateTotals?: RefusalWallTotals
): RefusalWall {
  const prepared = records
    .map(prepare)
    .filter((row): row is Prepared => row !== null)
    .sort((a, b) => b.at - a.at || b.href.localeCompare(a.href));

  const withAmount = prepared.filter((row) => row.refusedMicros > 0n);
  const refusedMicros = withAmount.reduce((sum, row) => sum + row.refusedMicros, 0n);
  const rows: WallRow[] = prepared.map(
    ({ at: _at, refusedMicros: _refused, simulated: _simulated, ...row }) => row
  );
  const aggregateRefusedMicros = aggregateTotals
    ? parseMicros(aggregateTotals.refusedAmountMicros)
    : null;

  return {
    checksRun: aggregateTotals?.checksRun ?? rows.length,
    paid: aggregateTotals?.paid ??
      prepared.filter((row) => row.outcome === "PAID" && !row.simulated).length,
    simulatedPaid: aggregateTotals?.simulatedPaid ??
      prepared.filter((row) => row.outcome === "PAID" && row.simulated).length,
    refused: aggregateTotals?.refused ?? rows.filter((row) => row.outcome === "REFUSED").length,
    refusedWithAmount: aggregateTotals?.refusedWithAmount ?? withAmount.length,
    refusedAmount: aggregateTotals
      ? aggregateTotals.refusedWithAmount > 0 && aggregateRefusedMicros !== null
        ? microsToUsdc(aggregateRefusedMicros)
        : null
      : withAmount.length > 0
        ? microsToUsdc(refusedMicros)
        : null,
    rows
  };
}

// Every string the wall renders, so a test can prove a private field never appears.
export function visibleWallText(wall: RefusalWall): string {
  const lines = [
    String(wall.checksRun),
    String(wall.paid),
    String(wall.simulatedPaid),
    String(wall.refused),
    wall.refusedAmount ?? "",
    "test money",
    ...wall.rows.flatMap((row) => [
      row.outcomeLabel,
      row.amount,
      row.chain,
      row.time,
      row.href,
      row.mismatch
        ? `${row.mismatch.field} did not match. The bill said ${row.mismatch.bill}. The record said ${row.mismatch.record}.`
        : "",
      row.reason ?? ""
    ])
  ];
  return lines.filter(Boolean).join("\n");
}
