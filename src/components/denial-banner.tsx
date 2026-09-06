import { explainDecision } from "@/app/console/types";

export function DenialBanner({
  decisionClass,
  reasonCode,
}: {
  decisionClass: string;
  reasonCode: string | null;
}) {
  const isHeld = decisionClass === "AMBER";
  if (decisionClass === "PAID") return null;

  return (
    <div
      className={[
        "rounded-lg border p-5",
        isHeld
          ? "border-[var(--held)]/20 bg-[var(--held-bg)] text-[var(--held)]"
          : "border-[var(--refused)]/20 bg-[var(--refused-bg)] text-[var(--refused)]",
      ].join(" ")}
    >
      <p className="eyebrow" style={{ color: "inherit" }}>
        {isHeld ? "Needs approval" : "Refused — Tiba decided not to pay"}
      </p>
      <p className="display-m mt-2" style={{ color: "var(--foreground)" }}>
        {explainDecision(decisionClass, reasonCode)}
      </p>
      <p className="num mt-3 text-xs opacity-70">
        Reason code {reasonCode ?? "none recorded"}
      </p>
    </div>
  );
}
