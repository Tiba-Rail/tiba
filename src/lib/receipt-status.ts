// No imports on purpose, so node --test can load this file directly.

const policyRefusalCodes = [
  "DAY_AMOUNT_CAP", "DAY_COUNT_CAP", "HOUR_AMOUNT_CAP", "HOUR_COUNT_CAP",
  "TRANSACTION_CEILING", "WORK_ORDER_CEILING", "WORK_ORDER_EXPIRED",
  "WORK_ORDER_NOT_OPEN", "NO_OPEN_OBLIGATION", "RECIPIENT_INACTIVE",
  "RECIPIENT_NOT_FOUND", "KILL_SWITCH", "RECIPIENT_UNVERIFIED", "RECIPIENT_NEEDS_SOLANA_ADDRESS",
  "RECIPIENT_NEEDS_TEMPO_ADDRESS",
  "INVALID_AMOUNT", "INVALID_TIMESTAMP"
];

// Codes set before the limits run (the limits only run after both checks agree),
// so the limits were never evaluated for these.
const beforeLimitsCodes = [
  "MODEL_SUBSTITUTED_SPLIT", "INFERENCE_UNAVAILABLE", "MISSING_PAYER_RECORD",
  "MISSING_REQUIRED_CHANNEL", "HUMAN_REVIEW_REQUIRED"
];

export function limitsStatus(decisionClass: string, reasonCode: string | null): "Blocked" | "Not reached" | "Passed" {
  const code = reasonCode ?? "";
  if (policyRefusalCodes.includes(code)) return "Blocked";
  // An owner override can pay a split, and the override runs the limits.
  if (decisionClass === "PAID") return "Passed";
  if (code.startsWith("QUORUM_SPLIT") || beforeLimitsCodes.includes(code)) return "Not reached";
  return "Passed";
}
