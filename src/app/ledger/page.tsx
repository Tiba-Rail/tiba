import Link from "next/link";
import { DenialBanner } from "@/components/denial-banner";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";

export const dynamic = "force-dynamic";

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function requestIdFor(adjudications: Array<{ channel: string; requestId: string | null }>, channel: string): string {
  return adjudications.find((row) => row.channel === channel)?.requestId ?? "missing";
}

function decisionFor(decisionClass: string): string {
  return decisionClass === "PAID" ? "PAID" : decisionClass;
}

export default async function LedgerPage() {
  const intents = await prisma.payoutIntent.findMany({
    include: {
      recipient: true,
      adjudications: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <RouterHealthStrip />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Ledger</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-zinc-50 md:text-5xl">
            Payments and refusals
          </h1>
        </header>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Reason code</th>
                  <th className="px-4 py-3">Request IDs</th>
                  <th className="px-4 py-3">Digest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {intents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                      No ledger rows yet. Submit an intent to create either a payment or a refusal.
                    </td>
                  </tr>
                ) : intents.map((intent) => (
                  <tr key={intent.id} className="align-top text-zinc-100">
                    <td className="px-4 py-4">{formatTime(intent.createdAt)}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{intent.recipient.displayName}</p>
                      <p className="font-mono text-xs text-zinc-400">{intent.recipient.ref}</p>
                    </td>
                    <td className="px-4 py-4 font-semibold">{microsToUsdc(intent.amountMicros)}</td>
                    <td className="px-4 py-4">
                      <span className={intent.decisionClass === "PAID" ? "rounded-md bg-emerald-400 px-2 py-1 font-black text-zinc-950" : intent.decisionClass === "AMBER" ? "rounded-md bg-amber-300 px-2 py-1 font-black text-zinc-950" : "rounded-md bg-red-500 px-2 py-1 font-black text-white"}>
                        {decisionFor(intent.decisionClass)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{intent.decisionClass === "PAID" ? "PAID" : intent.reasonCode ?? "UNKNOWN"}</td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-300">
                      <p>A: {requestIdFor(intent.adjudications, "artifact")}</p>
                      <p>B: {requestIdFor(intent.adjudications, "payer_record")}</p>
                    </td>
                    <td className="px-4 py-4">
                      {intent.explorerUrl ? (
                        <a className="font-mono text-xs text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" href={intent.explorerUrl}>
                          {intent.digest ?? "digest"}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-zinc-400">none</span>
                      )}
                      <details className="mt-3">
                        <summary className="min-h-10 cursor-pointer rounded-md px-2 py-2 text-sm font-semibold text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                          Inspect row
                        </summary>
                        <div className="mt-3 space-y-3">
                          <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />
                          <Link
                            className="inline-flex min-h-10 items-center rounded-md border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                            href={`/r/${intent.publicToken}`}
                          >
                            Public receipt
                          </Link>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
