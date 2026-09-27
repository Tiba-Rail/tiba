import { createHash } from "node:crypto";
import { fingerprintPrompt, fingerprintResponse, type GonkaMessage } from "./gonka.ts";
import { microsToUsdc, parseUsdcToMicros } from "./money.ts";
import { artifactSystemPrompt, payerRecordSystemPrompt } from "./prompts.ts";
import { reconcile, type DecisionTuple } from "./reconcile.ts";
import { disagreementLine } from "../app/console/types.ts";
import {
  SANDBOX_AMOUNT_MICROS,
  SANDBOX_AMOUNT_USDC,
  SANDBOX_AGENT_ID,
  SANDBOX_BRIEF,
  SANDBOX_PAYEE_NAME,
  SANDBOX_PAYER_RECORD,
  SANDBOX_RECIPIENT_ID,
  SANDBOX_RECIPIENT_REF,
  SANDBOX_WORK_ORDER_ID,
  SANDBOX_WORK_ORDER_ROW_ID,
  sandboxBillText
} from "./fool-it-sample.ts";

/** Burst cap. A sixth try inside the window does not call the model. */
export const FOOL_IT_TRIES_PER_WINDOW = 5;
export const FOOL_IT_WINDOW_MS = 10 * 60 * 1000;
/** Per visitor, then the whole sandbox. Stops one browser — or a crowd — from burning the model budget. */
export const FOOL_IT_TRIES_PER_DAY = 20;
export const FOOL_IT_DAY_MS = 24 * 60 * 60 * 1000;
export const FOOL_IT_DEPLOYMENT_TRIES_PER_DAY = 200;

const MAX_BILL_USDC_MICROS = 10_000_000_000n;
const WORK_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export type FoolItLimitStore = Map<string, { count: number; resetAt: number }>;

// ponytail: per-instance memory, same shape as the workspace limiter. Each serverless instance
// counts on its own. Enough to stop a casual loop; not a global ledger.
export const foolItLimitStore: FoolItLimitStore = new Map();

export type ChannelRead = {
  ok: boolean;
  model: string;
  requestId?: string;
  fallback?: string;
  content?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  errorCode?: string;
};

export type Readout = { workOrderId: string; amount: string };

export type FoolItResult =
  | { outcome: "invalid"; message: string }
  | { outcome: "rate_limited"; message: string; retryAt: number; moneySent: false }
  | { outcome: "would_pay"; message: string; moneySent: false; paid: false; bill: Readout; record: Readout }
  | {
      outcome: "refused";
      message: string;
      moneySent: false;
      paid: false;
      reasonCode: string;
      bill: Readout;
      record: Readout;
      mismatch: string;
      receiptPath: string;
    }
  | { outcome: "unavailable"; message: string; moneySent: false; paid: false };

type LimitScope = "window" | "day" | "deployment";

export function takeFoolItTry(
  store: FoolItLimitStore,
  visitorId: string,
  now = Date.now()
): { ok: true } | { ok: false; retryAt: number; scope: LimitScope } {
  const visitor = visitorId.trim() || "unknown";
  const checks: Array<{ key: string; windowMs: number; max: number; scope: LimitScope }> = [
    { key: `v:${visitor}:window`, windowMs: FOOL_IT_WINDOW_MS, max: FOOL_IT_TRIES_PER_WINDOW, scope: "window" },
    { key: `v:${visitor}:day`, windowMs: FOOL_IT_DAY_MS, max: FOOL_IT_TRIES_PER_DAY, scope: "day" },
    { key: "deployment:day", windowMs: FOOL_IT_DAY_MS, max: FOOL_IT_DEPLOYMENT_TRIES_PER_DAY, scope: "deployment" }
  ];
  const blocked = checks
    .map((check) => ({ ...check, gate: gate(store, check.key, now, check.windowMs, check.max) }))
    .find((check) => !check.gate.ok);
  if (blocked && !blocked.gate.ok) {
    return { ok: false, retryAt: blocked.gate.resetAt, scope: blocked.scope };
  }
  for (const check of checks) bump(store, check.key, now, check.windowMs);
  return { ok: true };
}

function gate(
  store: FoolItLimitStore,
  key: string,
  now: number,
  windowMs: number,
  max: number
): { ok: true; resetAt: number } | { ok: false; resetAt: number } {
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) return { ok: true, resetAt: now + windowMs };
  if (entry.count < max) return { ok: true, resetAt: entry.resetAt };
  return { ok: false, resetAt: entry.resetAt };
}

function bump(store: FoolItLimitStore, key: string, now: number, windowMs: number) {
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
}

export function limitMessage(scope: LimitScope): string {
  if (scope === "window") return "This sandbox allows 5 tries every 10 minutes. Nothing was sent.";
  if (scope === "day") return "Your daily cap for this sandbox is used up. Nothing was sent.";
  return "This sandbox's daily cap is used up. Nothing was sent.";
}

export function parseFoolItBill(
  workOrderId: unknown,
  amount: unknown
): { ok: true; workOrderId: string; amountUsdc: string; amountMicros: bigint } | { ok: false; message: string } {
  if (typeof workOrderId !== "string" || !WORK_ORDER_ID.test(workOrderId.trim())) {
    return { ok: false, message: "Enter a work order number using letters, numbers, and dashes." };
  }
  const micros = parseUsdcToMicros(amount);
  if (micros === null || micros <= 0n) {
    return { ok: false, message: "Enter an amount in USDC, up to 6 decimal places." };
  }
  if (micros > MAX_BILL_USDC_MICROS) {
    return { ok: false, message: "This sandbox only checks bills up to 10,000 USDC. Nothing was sent." };
  }
  return {
    ok: true,
    workOrderId: workOrderId.trim(),
    amountUsdc: microsToUsdc(micros).replace(/ USDC$/, ""),
    amountMicros: micros
  };
}

/** Same two messages a live payment builds: the bill on one side, the payer record on the other. */
export function sandboxChannelRequests(input: { billText: string; receivedAt: string }): {
  artifact: GonkaMessage[];
  payer: GonkaMessage[];
} {
  const metadata = { received_at: input.receivedAt, recipient_ref: SANDBOX_RECIPIENT_REF };
  return {
    artifact: [
      { role: "system", content: artifactSystemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          open_work_order_ids: [SANDBOX_WORK_ORDER_ID],
          delivery_event_metadata: metadata,
          artifact_text_and_links: input.billText
        })
      }
    ],
    payer: [
      { role: "system", content: payerRecordSystemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          open_work_orders: [
            {
              id: SANDBOX_WORK_ORDER_ID,
              ceiling_micros: SANDBOX_AMOUNT_MICROS,
              brief_text: SANDBOX_BRIEF,
              payer_record: SANDBOX_PAYER_RECORD
            }
          ],
          delivery_event_metadata: metadata
        })
      }
    ]
  };
}

/** Same tuple rules as a live payment. A chatty or partial model answer is not a payable amount. */
export function modelTuple(result: ChannelRead): DecisionTuple | null {
  if (!result.ok || !result.content) return null;
  try {
    const value = JSON.parse(result.content) as Record<string, unknown>;
    if (typeof value.work_order_id !== "string") return null;
    if (typeof value.amount_micros !== "string" || !/^\d+$/.test(value.amount_micros)) return null;
    if (typeof value.delivery_timestamp !== "string" || Number.isNaN(new Date(value.delivery_timestamp).getTime())) return null;
    return {
      workOrderId: value.work_order_id,
      amountMicros: BigInt(value.amount_micros),
      deliveryTimestamp: value.delivery_timestamp
    };
  } catch {
    return null;
  }
}

function modelTupleJson(result: ChannelRead): Record<string, unknown> | undefined {
  if (!result.content) return undefined;
  try {
    const parsed = JSON.parse(result.content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** "not found on the bill"/"not found on the record": a model can return a tuple whose
 *  work_order_id is present but blank (a real read that just didn't find a number), which is
 *  different from not answering at all. Showing nothing in that case reads as a broken receipt
 *  ("saw invoice , 480.00"); naming the gap instead is honest about what actually happened. */
function readoutOf(tuple: DecisionTuple | null, fallback: Readout, side: "bill" | "record"): Readout {
  if (!tuple) return fallback;
  const workOrderId = tuple.workOrderId.trim() || (side === "bill" ? "not found on the bill" : "not found on the record");
  return { workOrderId, amount: microsToUsdc(tuple.amountMicros) };
}

export type RefusalAdjudication = {
  channel: "artifact" | "payer_record";
  model: string;
  requestId?: string;
  fallback?: string;
  promptSha: string;
  responseSha?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  tupleJson?: Record<string, unknown>;
  ok: boolean;
};

export type RefusalDraft = {
  reasonCode: string;
  amountMicros: bigint;
  billText: string;
  bill: Readout;
  record: Readout;
  mismatch: string;
  adjudications: RefusalAdjudication[];
};

/**
 * The row a refusal writes. Status is refused, and there is no transaction id.
 * Calling this cannot settle a payment.
 */
export function refusalRecord(draft: RefusalDraft, publicToken: string, idempotencyKey: string) {
  return {
    intent: {
      agentId: SANDBOX_AGENT_ID,
      recipientId: SANDBOX_RECIPIENT_ID,
      workOrderId: SANDBOX_WORK_ORDER_ROW_ID,
      amountMicros: draft.amountMicros,
      status: "refused" as const,
      decisionClass: "RED" as const,
      reasonCode: draft.reasonCode,
      idempotencyKey,
      publicToken,
      digest: null,
      explorerUrl: null,
      chain: "sandbox",
      x402Routed: false
    },
    artifact: {
      rawText: draft.billText,
      sha256: createHash("sha256").update(draft.billText).digest("hex")
    },
    adjudications: draft.adjudications
  };
}

/**
 * Workspace this sandbox is allowed to use. The rail is simulated, the spend ceiling is zero,
 * and the payee has no address, so a live payout path has nowhere to send money.
 */
export function sandboxWorkspacePlan(now: Date, apiKeyHash: string) {
  return {
    agent: {
      id: SANDBOX_AGENT_ID,
      name: "Sandbox (try to fool it)",
      apiKeyHash,
      apiKeyPrefix: "sandbox",
      ceilingMicros: 0n,
      hourCapMicros: 0n,
      dayCapMicros: 0n,
      hourCountCap: 0,
      dayCountCap: 0,
      killSwitch: false,
      requireRecipientKyc: false,
      rail: "mock" as const
    },
    recipient: {
      id: SANDBOX_RECIPIENT_ID,
      ref: SANDBOX_RECIPIENT_REF,
      displayName: SANDBOX_PAYEE_NAME,
      solanaAddress: null as string | null,
      active: true,
      agentId: SANDBOX_AGENT_ID
    },
    workOrder: {
      id: SANDBOX_WORK_ORDER_ROW_ID,
      recipientId: SANDBOX_RECIPIENT_ID,
      ref: SANDBOX_WORK_ORDER_ID,
      ceilingMicros: BigInt(SANDBOX_AMOUNT_MICROS),
      briefText: SANDBOX_BRIEF,
      payerRecord: { ...SANDBOX_PAYER_RECORD },
      requiredChannels: "both" as const,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      status: "open" as const,
      dischargedByIntentId: null as string | null
    }
  };
}

export type ChannelReader = (input: {
  artifact: GonkaMessage[];
  payer: GonkaMessage[];
  billText: string;
  receivedAt: string;
}) => Promise<{ artifact: ChannelRead; payer: ChannelRead }>;

function adjudication(channel: "artifact" | "payer_record", result: ChannelRead, messages: GonkaMessage[]): RefusalAdjudication {
  return {
    channel,
    model: result.model,
    requestId: result.requestId,
    fallback: result.fallback,
    promptSha: fingerprintPrompt(messages),
    responseSha: fingerprintResponse(result.content),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
    tupleJson: modelTupleJson(result),
    ok: result.ok
  };
}

export async function runFoolItAttempt(input: {
  visitorId: string;
  workOrderId: unknown;
  amount: unknown;
  now?: number;
  store?: FoolItLimitStore;
  readChannels: ChannelReader;
  persistRefusal: (draft: RefusalDraft) => Promise<{ publicToken: string }>;
}): Promise<FoolItResult> {
  const parsed = parseFoolItBill(input.workOrderId, input.amount);
  if (!parsed.ok) return { outcome: "invalid", message: parsed.message };

  const now = input.now ?? Date.now();
  const store = input.store ?? foolItLimitStore;
  const limit = takeFoolItTry(store, input.visitorId, now);
  if (!limit.ok) {
    return { outcome: "rate_limited", message: limitMessage(limit.scope), retryAt: limit.retryAt, moneySent: false };
  }

  const billText = sandboxBillText(parsed.workOrderId, parsed.amountUsdc);
  const receivedAt = new Date(now).toISOString();
  const messages = sandboxChannelRequests({ billText, receivedAt });
  let reads: { artifact: ChannelRead; payer: ChannelRead };
  try {
    reads = await input.readChannels({ ...messages, billText, receivedAt });
  } catch {
    return { outcome: "unavailable", message: "The check could not be finished. Nothing was sent.", moneySent: false, paid: false };
  }

  const artifactTuple = modelTuple(reads.artifact);
  const payerTuple = modelTuple(reads.payer);
  // This work order requires both channels, including under 50 USDC, so a changed amount is a mismatch.
  const reconciled = reconcile("both", {
    artifact: artifactTuple ?? undefined,
    payer_record: payerTuple ?? undefined
  });
  const substituted = Boolean(reads.artifact.fallback || reads.payer.fallback);
  const splitOnSubstitutedModels =
    !reconciled.ok &&
    reconciled.decisionClass === "RED" &&
    reconciled.reasonCode.startsWith("QUORUM_SPLIT") &&
    substituted;

  const bill = readoutOf(artifactTuple, { workOrderId: parsed.workOrderId, amount: `${parsed.amountUsdc} USDC` }, "bill");
  const record = readoutOf(payerTuple, { workOrderId: SANDBOX_WORK_ORDER_ID, amount: `${SANDBOX_AMOUNT_USDC} USDC` }, "record");

  if (!reconciled.ok) {
    if (reconciled.decisionClass !== "RED" || splitOnSubstitutedModels) {
      return { outcome: "unavailable", message: "The check could not be finished. Nothing was sent.", moneySent: false, paid: false };
    }
    const mismatch =
      disagreementLine(reconciled.reasonCode, bill, record) ??
      "The bill and the record did not match, so Tiba refused.";
    const draft: RefusalDraft = {
      reasonCode: reconciled.reasonCode,
      amountMicros: artifactTuple?.amountMicros ?? parsed.amountMicros,
      billText,
      bill,
      record,
      mismatch,
      adjudications: [
        adjudication("artifact", reads.artifact, messages.artifact),
        adjudication("payer_record", reads.payer, messages.payer)
      ]
    };
    const saved = await input.persistRefusal(draft);
    return {
      outcome: "refused",
      message: "Refused. The bill does not match the payer's record. Nothing was sent.",
      moneySent: false,
      paid: false,
      reasonCode: reconciled.reasonCode,
      bill,
      record,
      mismatch,
      receiptPath: `/r/${saved.publicToken}`
    };
  }

  return {
    outcome: "would_pay",
    message: `Would pay. Both checks read invoice ${bill.workOrderId}, ${bill.amount}. This is a sandbox. Nothing was sent.`,
    moneySent: false,
    paid: false,
    bill,
    record
  };
}

export function foolItStatus(result: FoolItResult): number {
  if (result.outcome === "invalid") return 400;
  if (result.outcome === "rate_limited") return 429;
  return 200;
}

export function foolItResponseBody(result: FoolItResult): Record<string, unknown> {
  if (result.outcome === "invalid") return { outcome: "invalid", message: result.message, money_sent: false, paid: false };
  if (result.outcome === "rate_limited") {
    return {
      outcome: "rate_limited",
      message: result.message,
      retry_at: result.retryAt,
      money_sent: false,
      paid: false
    };
  }
  if (result.outcome === "would_pay") {
    return {
      outcome: "would_pay",
      message: result.message,
      money_sent: false,
      paid: false,
      bill: result.bill,
      record: result.record
    };
  }
  if (result.outcome === "refused") {
    return {
      outcome: "refused",
      message: result.message,
      money_sent: false,
      paid: false,
      reason_code: result.reasonCode,
      bill: result.bill,
      record: result.record,
      mismatch: result.mismatch,
      receipt_url: result.receiptPath
    };
  }
  return { outcome: "unavailable", message: result.message, money_sent: false, paid: false };
}
