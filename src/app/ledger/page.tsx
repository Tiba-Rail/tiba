import type { ReactNode } from "react";
import Link from "next/link";
import { DenialBanner } from "@/components/denial-banner";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { channelTuple, disagreementLine } from "@/lib/adjudication-display";
import { SiteNav } from "@/components/site-nav";

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
  if (decisionClass === "PAID") return "PAID";
  if (decisionClass === "AMBER") return "HELD";
  if (decisionClass === "RED") return "REFUSED";
  return decisionClass;
}

function renderAdjudicationDetails(
  adjudications: Array<{ channel: string; tupleJson: unknown }>,
  reasonCode: string | null
): ReactNode {
  if (!reasonCode?.startsWith("QUORUM_SPLIT")) return null;

  const a = channelTuple(adjudications.find((row) => row.channel === "artifact")?.tupleJson);
  const b = channelTuple(adjudications.find((row) => row.channel === "payer_record")?.tupleJson);

  const disagreement = disagreementLine(reasonCode, a, b);
  
  if (!a || !b) {
    return (
      <p className="mt-2 font-sans text-sm text-muted">
        {disagreement}
      </p>
    );
  }

  return (
    <div className="mt-2 font-sans text-sm text-muted">
      <p>Channel A read {a.workOrderId} · {a.amount}</p>
      <p>Channel B read {b.workOrderId} · {b.amount}</p>
      <p className="mt-1">They disagreed, so Tiba refused rather than guess.</p>
    </div>
  );
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
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="ledger" />
      <RouterHealthStrip />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-8">
          <p className="eyebrow">Ledger</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">
            Payments and refusals
          </h1>
        </header>

        <section className="card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line eyebrow">
                <tr>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reason code</th>
                  <th className="px-4 py-3">Request IDs</th>
                  <th className="px-4 py-3">Digest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {intents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted">
                      No ledger rows yet. Submit an intent to create either a payment or a refusal.
                    </td>
                  </tr>
                ) : intents.map((intent) => (
                  <tr key={intent.id} className="align-top">
                    <td className="px-4 py-5">
                      <span className={intent.decisionClass === "PAID" ? "pill pill-paid" : intent.decisionClass === "AMBER" ? "pill pill-amber" : "pill pill-red"}>
                        {decisionFor(intent.decisionClass)}
                      </span>
                    </td>
                    <td className="px-4 py-5">{formatTime(intent.createdAt)}</td>
                    <td className="px-4 py-5">
                      <p className="font-semibold">{intent.recipient.displayName}</p>
                      <p className="font-mono text-xs text-muted">{intent.recipient.ref}</p>
                    </td>
                    <td className="px-4 py-5 font-semibold">{microsToUsdc(intent.amountMicros)}</td>
                    <td className="px-4 py-5 font-mono text-xs">
                      {intent.decisionClass === "PAID" ? "PAID" : intent.reasonCode ?? "UNKNOWN"}
                      {intent.decisionClass !== "PAID" && renderAdjudicationDetails(intent.adjudications, intent.reasonCode)}
                    </td>
                    <td className="px-4 py-5 font-mono text-xs text-muted">
                      <p>A: {requestIdFor(intent.adjudications, "artifact")}</p>
                      <p>B: {requestIdFor(intent.adjudications, "payer_record")}</p>
                    </td>
                    <td className="px-4 py-5">
                      {intent.explorerUrl ? (
                        <a className="font-mono text-xs text-primary underline-offset-4 hover:underline" href={intent.explorerUrl}>
                          {intent.digest ?? "digest"}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-muted">none</span>
                      )}
                      <details className="mt-3">
                        <summary className="min-h-10 cursor-pointer px-2 py-2 text-sm font-semibold text-primary">
                          Inspect row
                        </summary>
                        <div className="mt-3 space-y-3">
                          <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />
                          <Link
                            className="btn btn-secondary"
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