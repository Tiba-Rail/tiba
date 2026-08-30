type DenialClass = "AMBER" | "RED";

const amberReasons = new Set([
  "SCHEMA_INVALID",
  "INFERENCE_UNAVAILABLE",
  "HUMAN_REVIEW_REQUIRED",
  "MISSING_PAYER_RECORD",
  "MISSING_REQUIRED_CHANNEL"
]);

export function denialClassFor(reasonCode: string | null | undefined, decisionClass: string): DenialClass | null {
  if (decisionClass === "PAID") return null;
  if (decisionClass === "AMBER" || amberReasons.has(reasonCode ?? "")) return "AMBER";
  return "RED";
}

export function denialCopy(kind: DenialClass): string {
  return kind === "AMBER" ? "couldn't decide" : "decided not to pay";
}

export function DenialBanner({
  decisionClass,
  reasonCode
}: {
  decisionClass: string;
  reasonCode: string | null;
}) {
  const kind = denialClassFor(reasonCode, decisionClass);
  if (!kind) return null;
  const isAmber = kind === "AMBER";
  return (
    <div
      className={[
        "card p-5 border-line-strong",
        isAmber
          ? "bg-[var(--amber-bg)] text-[var(--amber-ink)]"
          : "bg-[var(--red-bg)] text-red-ink"
      ].join(" ")}
    >
      <p className="text-sm font-semibold uppercase tracking-widest">{kind} - {denialCopy(kind)}</p>
      <p className="mt-2 break-words text-5xl font-semibold leading-none tracking-normal sm:text-6xl">
        {reasonCode ?? "UNKNOWN"}
      </p>
    </div>
  );
}
