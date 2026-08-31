import { microsToUsdc } from "@/lib/money";

export type ChannelTuple = { workOrderId: string; amount: string } | null;

export function channelTuple(value: unknown): ChannelTuple {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const workOrderId = row.work_order_id;
  const amountMicros = row.amount_micros;
  if (typeof workOrderId !== "string") return null;
  if (typeof amountMicros !== "string" || !/^\d+$/.test(amountMicros)) return null;
  return { workOrderId, amount: microsToUsdc(amountMicros) };
}

export function disagreementLine(
  reasonCode: string | null,
  a: ChannelTuple,
  b: ChannelTuple
): string | null {
  if (!reasonCode?.startsWith("QUORUM_SPLIT")) return null;
  if (!a || !b) return "Two isolated channels disagreed. Tiba refused rather than guess.";
  return `Channel A read ${a.workOrderId} · ${a.amount} · Channel B read ${b.workOrderId} · ${b.amount}. They disagreed, so Tiba refused rather than guess.`;
}