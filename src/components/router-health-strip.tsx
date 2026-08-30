import { prisma } from "@/lib/db";
import { formatLatency } from "@/lib/money";

function labelFor(model: string): string {
  if (model.toLowerCase().includes("kimi")) return "KIMI";
  if (model.toLowerCase().includes("deepseek")) return "DEEPSEEK";
  return model.split("/").pop()?.toUpperCase() ?? model.toUpperCase();
}

export async function RouterHealthStrip() {
  const adjudications = await prisma.adjudication.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const latestByModel = new Map<string, typeof adjudications[number]>();
  for (const adjudication of adjudications) {
    if (!latestByModel.has(adjudication.model)) latestByModel.set(adjudication.model, adjudication);
  }
  const latest = Array.from(latestByModel.values()).slice(0, 4);
  if (latest.length === 0) {
    return (
      <div className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 py-3 text-sm font-semibold text-muted backdrop-blur">
        ROUTER <span className="text-muted">-</span> no calls yet
      </div>
    );
  }
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface/95 px-4 py-3 text-sm font-semibold backdrop-blur">
      <span className="inline-flex items-center gap-2">
        ROUTER <StatusDot ok /> live
      </span>
      {latest.map((row) => (
        <span key={row.id} className="inline-flex items-center gap-2 text-muted">
          <span className="text-muted">|</span>
          {labelFor(row.model)} <StatusDot ok={row.ok} />
          {formatLatency(row.latencyMs)}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={ok ? "inline-block size-2 rounded-full bg-paid" : "inline-block size-2 rounded-full bg-red-ink"}
    />
  );
}
