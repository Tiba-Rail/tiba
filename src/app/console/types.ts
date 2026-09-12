export type Recipient = {
  ref: string;
  displayName: string;
  suiAddress: string;
  solanaAddress?: string | null;
  active: boolean;
};

export type WorkOrder = {
  ref: string;
  recipientRef: string;
  recipientName: string;
  ceiling: string;
  expiresAt: string;
  status: string;
};

export type HeldIntent = {
  id: string;
  createdAt: string;
  recipientName: string;
  amount: string;
  decisionClass: string;
  reasonCode: string | null;
};

export type Budget = {
  agentName: string;
  spentDay: string;
  capDay: string;
  spentHour: string;
  capHour: string;
  capInvoice: string;
  dayPercent: number;
  hourPercent: number;
  killSwitch: boolean;
};

export type TestIntentResponse = {
  id?: string;
  decision: string;
  reasonCode?: string;
  digest?: string;
  explorerUrl?: string;
  publicToken?: string;
};

export function decisionWord(decisionClass: string): string {
  if (decisionClass === "AMBER") return "NEEDS APPROVAL";
  if (decisionClass === "RED") return "REFUSED";
  return decisionClass;
}

export function decisionSentence(decisionClass: string): string {
  if (decisionClass === "PAID") return "Paid";
  if (decisionClass === "AMBER") return "Needs approval";
  if (decisionClass === "RED") return "Refused";
  return decisionClass;
}

export function explainDecision(decisionClass: string, reasonCode: string | null): string {
  if (decisionClass === "PAID") {
    return "Both checks agreed, the limits passed, and the test transfer completed.";
  }

  if (decisionClass === "AMBER") {
    switch (reasonCode) {
      case "HUMAN_REVIEW_REQUIRED": return "This amount is large enough that your limits require you to decide.";
      case "INFERENCE_UNAVAILABLE": return "Neither check could run, so the payment is held for approval.";
      case "MISSING_PAYER_RECORD":
      case "MISSING_REQUIRED_CHANNEL": return "Your own records could not be read, so the payment is held for approval.";
      case "SCHEMA_INVALID": return "A check returned an unreadable answer, so the payment is held for approval.";
      case "REQUEST_REJECTED": return "The reading service turned the request away, so the payment is held for approval.";
      case "AUDITOR_HOLD": return "First payment to this recipient, and the web check did not clear it, so the payment is held for approval.";
      default: return "Held for approval.";
    }
  }

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
    case "RECIPIENT_NO_CHAIN_ADDRESS": return "Recipient has no saved wallet address.";
    case "SETTLEMENT_FAILED":
    case "SUI_EXECUTION_FAILED":
    case "SOLANA_EXECUTION_FAILED":
      return "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.";
    default:
      return "Refused before any money moved.";
  }
}

// Send result (YC_STUDY.md §4 step 5). The send response carries no per-check
// detail, so the two check rows are derived from decisionClass + reasonCode.
export type CheckRow = {
  name: string;
  mark: "pass" | "fail" | "pending" | "skip";
  text: string;
};

const CHECK_1 = "Check 1 — the delivery note";
const CHECK_2 = "Check 2 — your records";

// Reason codes refused before either check runs.
const PRE_CHECK_REFUSALS = new Set([
  "KILL_SWITCH",
  "RECIPIENT_NOT_FOUND",
  "RECIPIENT_INACTIVE",
  "RECIPIENT_UNVERIFIED",
  "RECIPIENT_NO_CHAIN_ADDRESS",
  "INVALID_AMOUNT",
  "INVALID_TIMESTAMP"
]);

export function sendResultChecks(decisionClass: string, reasonCode: string | null): CheckRow[] {
  if (decisionClass === "PAID") {
    return [
      { name: CHECK_1, mark: "pass", text: "Read the delivery note." },
      { name: CHECK_2, mark: "pass", text: "Same invoice, same amount — agreed." }
    ];
  }

  if (decisionClass === "AMBER") {
    return [
      { name: CHECK_1, mark: "pass", text: "Done." },
      { name: CHECK_2, mark: "pending", text: explainDecision(decisionClass, reasonCode) }
    ];
  }

  if (reasonCode?.startsWith("QUORUM_SPLIT")) {
    const what =
      reasonCode === "QUORUM_SPLIT:work_order_id" ? "a different invoice" :
      reasonCode === "QUORUM_SPLIT:amount_micros" ? "a different amount" :
      reasonCode === "QUORUM_SPLIT:delivery_timestamp" ? "a different delivery date" :
      "a different answer";
    return [
      { name: CHECK_1, mark: "pass", text: "Read the delivery note." },
      { name: CHECK_2, mark: "fail", text: `Named ${what} — the checks disagreed.` }
    ];
  }

  if (reasonCode && PRE_CHECK_REFUSALS.has(reasonCode)) {
    return [
      { name: CHECK_1, mark: "skip", text: "Not run — refused first." },
      { name: CHECK_2, mark: "skip", text: "Not run — refused first." }
    ];
  }

  if (reasonCode === "SETTLEMENT_FAILED" || reasonCode === "SUI_EXECUTION_FAILED" || reasonCode === "SOLANA_EXECUTION_FAILED") {
    return [
      { name: CHECK_1, mark: "pass", text: "Agreed." },
      { name: CHECK_2, mark: "pass", text: "Agreed — the transfer itself failed." }
    ];
  }

  // Limit and invoice refusals: the checks ran, your limits refused.
  return [
    { name: CHECK_1, mark: "pass", text: "Read the delivery note." },
    { name: CHECK_2, mark: "fail", text: explainDecision(decisionClass, reasonCode) }
  ];
}

// Where a refusal can be fixed, as a quiet link — label + route, no narration.
export function refusalNextStepLink(reasonCode: string | null): { label: string; href: string } | null {
  switch (reasonCode) {
    case "DAY_AMOUNT_CAP":
    case "DAY_COUNT_CAP":
    case "HOUR_AMOUNT_CAP":
    case "HOUR_COUNT_CAP":
    case "TRANSACTION_CEILING":
      return { label: "Raise the limit", href: "/policies" };
    case "WORK_ORDER_CEILING":
      return { label: "Raise this invoice's maximum", href: "/work-orders" };
    case "WORK_ORDER_EXPIRED":
    case "WORK_ORDER_NOT_OPEN":
    case "NO_OPEN_OBLIGATION":
      return { label: "Fix the invoice", href: "/work-orders" };
    case "RECIPIENT_NOT_FOUND":
      return { label: "Save this recipient", href: "/recipients" };
    case "RECIPIENT_INACTIVE":
    case "RECIPIENT_UNVERIFIED":
      return { label: "Check the recipient", href: "/recipients" };
    case "RECIPIENT_NO_CHAIN_ADDRESS":
      return { label: "Add a wallet address", href: "/recipients" };
    case "KILL_SWITCH":
      return { label: "Unfreeze the wallet", href: "/policies" };
    default:
      return null;
  }
}

// Every refusal ends with what happens next.
export function refusalNextStep(reasonCode: string | null): string {
  switch (reasonCode) {
    case "DAY_AMOUNT_CAP":
    case "DAY_COUNT_CAP":
    case "HOUR_AMOUNT_CAP":
    case "HOUR_COUNT_CAP":
    case "TRANSACTION_CEILING":
      return "What next: raise the limit under Limits, or split the invoice.";
    case "WORK_ORDER_CEILING":
      return "What next: raise this invoice's maximum under Invoices, or split it.";
    case "WORK_ORDER_EXPIRED":
    case "WORK_ORDER_NOT_OPEN":
    case "NO_OPEN_OBLIGATION":
      return "What next: add or fix the invoice under Invoices.";
    case "RECIPIENT_NOT_FOUND":
      return "What next: save this recipient under Recipients.";
    case "RECIPIENT_INACTIVE":
    case "RECIPIENT_UNVERIFIED":
      return "What next: check the recipient under Recipients.";
    case "RECIPIENT_NO_CHAIN_ADDRESS":
      return "What next: save a Solana or Sui wallet address for this recipient under Recipients.";
    case "KILL_SWITCH":
      return "What next: unfreeze the wallet under Limits.";
    case "SETTLEMENT_FAILED":
    case "SUI_EXECUTION_FAILED":
    case "SOLANA_EXECUTION_FAILED":
      return "What next: try again — the checks passed, the transfer failed.";
    default:
      if (reasonCode?.startsWith("QUORUM_SPLIT")) {
        return "What next: make sure the delivery note and your records name the same invoice and amount.";
      }
      return "What next: check the delivery note and try again.";
  }
}

// Human reference printed on every result, e.g. TB-9F3K-04ZQ.
export function humanReference(intentId: string | undefined): string | null {
  if (!intentId) return null;
  const clean = intentId.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length < 8) return `TB-${clean.toUpperCase()}`;
  return `TB-${clean.slice(0, 4).toUpperCase()}-${clean.slice(-4).toUpperCase()}`;
}

export function humanError(code: string | null | undefined): { text: string; code: string } {
  const map: Record<string, string> = {
    UNAUTHORIZED: "Wrong owner key.",
    OPERATOR_TOKEN_NOT_SET: "Enter the owner key first.",
    OPERATOR_TOKEN_REQUIRED: "Enter the owner key first.",
    REQUEST_FAILED: "Something went wrong. Try again.",
    INVALID_REQUEST: "Something in the form is not valid.",
    NOT_FOUND: "Not found.",
    NOT_OVERRIDABLE: "This one cannot be approved.",
    ALREADY_PAID: "Already paid.",
    RECIPIENT_NOT_FOUND: "That recipient is not saved.",
    RECIPIENT_NO_CHAIN_ADDRESS: "Add a Solana or Sui wallet address.",
    INVALID_SOLANA_ADDRESS: "That is not a valid Solana address.",
    INVALID_SUI_ADDRESS: "That is not a valid Sui address (0x followed by up to 64 hex characters).",
    INVALID_PAYER_RECORD_JSON: "Your record is not valid JSON.",
    INVALID_TIMESTAMP: "The date is not valid.",
    IDENTITY_PROVIDER_UNAVAILABLE: "The identity-check service is unavailable. Try again later.",
  };
  const c = code ?? "UNKNOWN";
  return { text: map[c] ?? `Something went wrong (${c}).`, code: c };
}

export function workOrderStatusWord(status: string): string {
  if (status === "open") return "Awaiting delivery";
  if (status === "closed") return "Closed";
  if (status === "expired") return "Expired";
  if (status === "discharged") return "Paid";
  return status;
}

// Check 1/2 wording for quorum-split disagreements. Lives here (not in
// src/lib/adjudication-display.ts) because the redesign may not touch src/lib.
export function disagreementLine(
  reasonCode: string | null,
  a: ChannelTupleLike,
  b: ChannelTupleLike
): string | null {
  if (!reasonCode?.startsWith("QUORUM_SPLIT")) return null;
  if (!a || !b) return "The two checks gave different answers, so Tiba refused.";
  return `Check 1 (the delivery note) saw invoice ${a.workOrderId}, ${a.amount}. Check 2 (your own records) saw invoice ${b.workOrderId}, ${b.amount}. They disagreed, so Tiba refused.`;
}

export type ChannelTupleLike = { workOrderId: string; amount: string } | null;