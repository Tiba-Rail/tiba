/**
 * Check 2, with no model. The open work orders are already limited to this
 * recipient by processPayoutIntent (status open, not expired, not discharged).
 * This function does not look anything else up and does not move money.
 * Solana devnet test amounts only.
 *
 * Exactly one payer_record whose delivery_status is "verified_complete" becomes
 * the tuple. Zero or several returns null, so the payment is held and nothing
 * is guessed.
 */

export const PAYER_RECORD_RULES_MODEL = "rules" as const;

export type ScopedWorkOrder = {
  ref?: string;
  id?: string;
  ceilingMicros?: bigint | string | number;
  ceiling_micros?: bigint | string | number;
  payerRecord?: unknown;
  payer_record?: unknown;
};

export type PayerRecordTuple = {
  ref: string;
  /** Digits from payer_record.approved_amount_micros, or the ceiling when that field is absent. */
  approved_amount_micros: string;
  received_at: string;
};

export type PayerRecordRulesResult = {
  ok: boolean;
  model: typeof PAYER_RECORD_RULES_MODEL;
  latencyMs: number;
  content?: string;
};

function digitString(value: unknown): string | null {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

function recordOf(order: ScopedWorkOrder): Record<string, unknown> | null {
  const raw = order.payerRecord !== undefined ? order.payerRecord : order.payer_record;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function isVerifiedComplete(order: ScopedWorkOrder): boolean {
  return recordOf(order)?.delivery_status === "verified_complete";
}

function refOf(order: ScopedWorkOrder): string | null {
  if (typeof order.ref === "string" && order.ref.length > 0) return order.ref;
  if (typeof order.id === "string" && order.id.length > 0) return order.id;
  return null;
}

function amountOf(order: ScopedWorkOrder): string | null {
  const record = recordOf(order);
  const approved = record ? digitString(record.approved_amount_micros) : null;
  if (approved !== null) return approved;
  return digitString(order.ceilingMicros) ?? digitString(order.ceiling_micros);
}

export function selectPayerRecordTuple(
  openWorkOrders: readonly ScopedWorkOrder[],
  receivedAt: string
): PayerRecordTuple | null {
  const matches = openWorkOrders.filter(isVerifiedComplete);
  if (matches.length !== 1) return null;
  const only = matches[0];
  const ref = refOf(only);
  const approvedAmountMicros = amountOf(only);
  if (!ref || approvedAmountMicros === null) return null;
  return {
    ref,
    approved_amount_micros: approvedAmountMicros,
    received_at: receivedAt
  };
}

type PayerMessage = { role: string; content: string };

/**
 * The shape processPayoutIntent already sends as the payer-record user message.
 * A message that is not that shape is zero matching orders, not a guess and not a model call.
 */
export function readPayerRecordByRules(messages: readonly PayerMessage[]): PayerRecordRulesResult {
  const user = [...messages].reverse().find((message) => message.role === "user");
  let orders: ScopedWorkOrder[] = [];
  let receivedAt = "";
  if (user) {
    try {
      const parsed = JSON.parse(user.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        if (Array.isArray(body.open_work_orders)) {
          orders = body.open_work_orders.filter(
            (row): row is ScopedWorkOrder => Boolean(row) && typeof row === "object" && !Array.isArray(row)
          );
        }
        const meta = body.delivery_event_metadata;
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
          const received = (meta as Record<string, unknown>).received_at;
          if (typeof received === "string") receivedAt = received;
        }
      }
    } catch {
      orders = [];
      receivedAt = "";
    }
  }

  const tuple = selectPayerRecordTuple(orders, receivedAt);
  if (!tuple) return { ok: false, model: PAYER_RECORD_RULES_MODEL, latencyMs: 0 };
  return {
    ok: true,
    model: PAYER_RECORD_RULES_MODEL,
    latencyMs: 0,
    content: JSON.stringify({
      work_order_id: tuple.ref,
      amount_micros: tuple.approved_amount_micros,
      delivery_timestamp: tuple.received_at,
      record_basis: "verified_complete"
    })
  };
}
