export type Recipient = {
  ref: string;
  displayName: string;
  suiAddress: string;
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
      default: return "Held for approval.";
    }
  }

  if (reasonCode?.startsWith("QUORUM_SPLIT")) {
    if (reasonCode === "QUORUM_SPLIT:work_order_id") return "The two checks named different invoices, so Tiba refused.";
    if (reasonCode === "QUORUM_SPLIT:amount_micros") return "The two checks named different amounts, so Tiba refused.";
    if (reasonCode === "QUORUM_SPLIT:delivery_timestamp") return "The two checks gave different delivery dates, so Tiba refused.";
    return "The two checks disagreed, so Tiba refused.";
  }

  switch (reasonCode) {
    case "DAY_AMOUNT_CAP": return "This would take your software past its daily spending limit, so Tiba refused.";
    case "HOUR_AMOUNT_CAP": return "This would take your software past its hourly spending limit, so Tiba refused.";
    case "DAY_COUNT_CAP": return "Your software has already made its maximum number of payments today, so Tiba refused.";
    case "HOUR_COUNT_CAP": return "Your software has already made its maximum number of payments this hour, so Tiba refused.";
    case "TRANSACTION_CEILING": return "The amount is more than any single payment may be, so Tiba refused.";
    case "WORK_ORDER_CEILING": return "The amount is more than this invoice allows, so Tiba refused.";
    case "WORK_ORDER_EXPIRED": return "The invoice named has passed its deadline, so Tiba refused.";
    case "WORK_ORDER_NOT_OPEN": return "The invoice named is closed, so Tiba refused.";
    case "NO_OPEN_OBLIGATION": return "There is no invoice awaiting delivery matching this delivery note, so there was nothing to pay.";
    case "RECIPIENT_NOT_FOUND": return "This recipient is not saved, so Tiba refused.";
    case "RECIPIENT_INACTIVE": return "This recipient is saved but blocked, so Tiba refused.";
    case "RECIPIENT_UNVERIFIED": return "This recipient's identity is not verified, and your limits require it, so Tiba refused.";
    case "KILL_SWITCH": return "The wallet is frozen, so every payment is refused before any check runs.";
    case "INVALID_AMOUNT": return "The amount in this request was not valid, so Tiba refused.";
    case "INVALID_TIMESTAMP": return "A date in this request was not valid, so Tiba refused.";
    case "SETTLEMENT_FAILED":
    case "SUI_EXECUTION_FAILED":
      return "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.";
    default:
      return "Refused before any money moved.";
  }
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