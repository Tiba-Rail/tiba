import { channelTuple, type ChannelTuple } from "./adjudication-display.ts";
import { receiptNetwork } from "./receipt-network.ts";

export const GROWTH_LINE =
  "Pay your own contributors with Tiba. Every payment checked, every outcome on a receipt like this one.";

export function growthHref(publicToken: string): string {
  return `/start?ref=${encodeURIComponent(publicToken)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** An adjudication row. Null means that channel did not run. */
export type StoredChannel = { tupleJson: unknown } | null;

export type ComparisonField = {
  label: "Work order" | "Amount" | "Delivery date";
  bill: string;
  record: string;
};

export type ChannelView = {
  title: "The bill" | "The record";
  intro: string;
  /** Set when the channel did not run, or ran without a readable work order and amount. */
  note: string | null;
  workOrderId: string | null;
  amount: string | null;
};

export type ReceiptComparison = {
  bill: ChannelView;
  record: ChannelView;
  /** Fields whose stored values differ. Both values are shown side by side. */
  fields: ComparisonField[];
  /** Shown when there is no side-by-side field. */
  mismatchNote: string | null;
  /** Lowercase names for the share image, such as "work order and amount". */
  mismatchedField: string | null;
};

type ParsedChannel = ChannelView & { tuple: ChannelTuple; delivery: string | null; ran: boolean };

function deliveryTimestamp(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).delivery_timestamp;
  if (typeof raw !== "string") return null;
  if (Number.isNaN(new Date(raw).getTime())) return null;
  return raw;
}

function formatDelivery(iso: string): string {
  const date = new Date(iso);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute} UTC`;
}

/** "not found on the bill"/"not found on the record": a stored tuple can carry a blank
 *  work_order_id or amount -- a real model read that just didn't find a number, not the same as
 *  the channel never running. Showing that as nothing renders an empty "Bill: (blank)" line;
 *  naming the gap is honest about what the model actually reported. */
function notFoundLabel(title: ChannelView["title"]): string {
  return title === "The bill" ? "not found on the bill" : "not found on the record";
}

function displayField(value: string, title: ChannelView["title"]): string {
  const trimmed = value.trim();
  return trimmed || notFoundLabel(title);
}

function channelView(title: ChannelView["title"], intro: string, stored: StoredChannel): ParsedChannel {
  if (!stored) {
    return {
      title,
      intro,
      note: "This check did not run.",
      workOrderId: null,
      amount: null,
      tuple: null,
      delivery: null,
      ran: false
    };
  }

  const tuple = channelTuple(stored.tupleJson);
  const delivery = deliveryTimestamp(stored.tupleJson);
  if (!tuple) {
    return {
      title,
      intro,
      note: "This check ran, but it did not name a work order and an amount.",
      workOrderId: null,
      amount: null,
      tuple: null,
      delivery,
      ran: true
    };
  }

  return {
    title,
    intro,
    note: null,
    workOrderId: displayField(tuple.workOrderId, title),
    amount: displayField(tuple.amount, title),
    tuple,
    delivery,
    ran: true
  };
}

function mismatchedFieldPhrase(fields: ComparisonField[]): string | null {
  if (fields.length === 0) return null;
  const names = fields.map((field) => field.label.toLowerCase());
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function viewOf(parsed: ParsedChannel): ChannelView {
  return {
    title: parsed.title,
    intro: parsed.intro,
    note: parsed.note,
    workOrderId: parsed.workOrderId,
    amount: parsed.amount
  };
}

/**
 * Bill, record, and mismatch from the stored adjudication tuples.
 * The artifact channel is the bill (the evidence). The payer_record channel is the payer's own record.
 */
export function receiptComparisonFromStored(input: {
  artifact: StoredChannel;
  payerRecord: StoredChannel;
}): ReceiptComparison {
  const bill = channelView("The bill", "What the evidence said.", input.artifact);
  const record = channelView("The record", "What your own record said.", input.payerRecord);
  const fields: ComparisonField[] = [];

  if (bill.tuple && record.tuple) {
    if (bill.tuple.workOrderId !== record.tuple.workOrderId) {
      fields.push({
        label: "Work order",
        bill: displayField(bill.tuple.workOrderId, "The bill"),
        record: displayField(record.tuple.workOrderId, "The record")
      });
    }
    if (bill.tuple.amount !== record.tuple.amount) {
      fields.push({
        label: "Amount",
        bill: displayField(bill.tuple.amount, "The bill"),
        record: displayField(record.tuple.amount, "The record")
      });
    }
    if (
      bill.delivery &&
      record.delivery &&
      new Date(bill.delivery).getTime() !== new Date(record.delivery).getTime()
    ) {
      fields.push({
        label: "Delivery date",
        bill: formatDelivery(bill.delivery),
        record: formatDelivery(record.delivery)
      });
    }
  }

  let mismatchNote: string | null = null;
  if (!bill.ran || !record.ran) {
    mismatchNote = "A check did not run, so the bill and the record cannot be compared.";
  } else if (!bill.tuple || !record.tuple) {
    mismatchNote = "One check did not name a work order and an amount, so they cannot be compared.";
  } else if (fields.length === 0) {
    mismatchNote = "No field differed.";
  }

  return {
    bill: viewOf(bill),
    record: viewOf(record),
    fields,
    mismatchNote,
    mismatchedField: mismatchedFieldPhrase(fields)
  };
}

/** The homepage refused card. Null when the database has no refused example — never a placeholder. */
export function homepageRefusedCard(
  intent: {
    publicToken: string;
    adjudications: Array<{ channel: string; tupleJson: unknown }>;
  } | null
  | undefined
): { href: string; comparison: ReceiptComparison } | null {
  if (!intent) return null;
  const artifact = intent.adjudications.find((row) => row.channel === "artifact") ?? null;
  const payerRecord = intent.adjudications.find((row) => row.channel === "payer_record") ?? null;
  return {
    href: `/r/${intent.publicToken}`,
    comparison: receiptComparisonFromStored({
      artifact: artifact ? { tupleJson: artifact.tupleJson } : null,
      payerRecord: payerRecord ? { tupleJson: payerRecord.tupleJson } : null
    })
  };
}

export function receiptShareLines(input: {
  decisionClass: string;
  amount: string;
  chain: string | null;
  comparison: ReceiptComparison;
}): { outcome: string; amount: string; network: string; mismatch: string | null } {
  const outcome =
    input.decisionClass === "PAID"
      ? "PAID"
      : input.decisionClass === "RED"
        ? "REFUSED"
        : input.decisionClass === "AMBER"
          ? "NEEDS APPROVAL"
          : input.decisionClass;
  return {
    outcome,
    amount: input.amount,
    network: receiptNetwork(input.chain),
    mismatch: input.decisionClass === "RED" ? input.comparison.mismatchedField : null
  };
}
