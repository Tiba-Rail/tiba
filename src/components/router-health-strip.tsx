import { prisma } from "@/lib/db";

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
        Checks online {"\u00b7"} no checks yet
      </div>
    );
  }

  const slowestLatencyMs = latest.reduce(
    (slowest, row) => Math.max(slowest, row.latencyMs),
    0
  );
  const slowestSeconds = Math.round(slowestLatencyMs / 1000);
  const modelNames = latest.map((row) => labelFor(row.model)).join(" \u00b7 ");

  return (
    <div className={stripClass} title={modelNames}>
      Checks online {"\u00b7"} about {slowestSeconds} s per check
    </div>
  );
}
