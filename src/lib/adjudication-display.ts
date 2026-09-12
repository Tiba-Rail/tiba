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

/** Nemotron ids are served by Nebius Token Factory here; the Gonka readers are Kimi and DeepSeek. */
export function onNebius(model: string): boolean {
  return model.toLowerCase().startsWith("nvidia/");
}

/** "nvidia/nemotron-3-super-120b-a12b" -> "NVIDIA Nemotron 3 Super 120B A12B on Nebius Token Factory". */
export function modelLabel(model: string): string {
  if (!onNebius(model)) return model;
  const name = model
    .slice(model.indexOf("/") + 1)
    .split("-")
    .map((word) => (/^a?\d+b$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
  return `NVIDIA ${name} on Nebius Token Factory`;
}

export type AuditView = {
  verdict: "clear" | "hold";
  reasons: string[];
  sources: Array<{ title: string; url: string }>;
  toolCalls: number;
} | null;

/** The auditor row's stored verdict. Only http(s) source links are ever rendered. */
export function auditView(value: unknown): AuditView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const verdict = row.verdict;
  if (verdict !== "clear" && verdict !== "hold") return null;
  const reasons = Array.isArray(row.reasons) ? row.reasons.filter((reason): reason is string => typeof reason === "string") : [];
  const sources = Array.isArray(row.sources)
    ? row.sources.flatMap((item) => {
        const source = item as { title?: unknown; url?: unknown } | null;
        if (!source || typeof source.url !== "string" || !/^https?:\/\//i.test(source.url)) return [];
        return [{ title: typeof source.title === "string" && source.title ? source.title : source.url, url: source.url }];
      })
    : [];
  return { verdict, reasons, sources, toolCalls: typeof row.tool_calls === "number" ? row.tool_calls : 0 };
}