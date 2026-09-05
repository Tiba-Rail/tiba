import { prisma } from "@/lib/db";
import { formatLatency } from "@/lib/money";

function labelFor(model: string): string {
  if (model.toLowerCase().includes("kimi")) return "Kimi";
  if (model.toLowerCase().includes("deepseek")) return "DeepSeek";
  const tail = model.split("/").pop() ?? model;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

const stripClass =
  "sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface/95 px-4 py-2 text-xs font-medium text-muted backdrop-blur";

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
      <div className={stripClass}>
        Checks · none run yet
      </div>
    );
  }
  return (
    <div className={stripClass}>
      <span className="inline-flex items-center gap-2">
        Checks online
      </span>
      {latest.map((row) => (
        <span key={row.id} className="inline-flex items-center gap-2">
          <span className="text-muted">·</span>
          {labelFor(row.model)} <StatusDot ok={row.ok} />
          <span className="num">{formatLatency(row.latencyMs)}</span>
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
