import type { ReactNode } from "react";
import Link from "next/link";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { channelTuple } from "@/lib/adjudication-display";
import { decisionWord, disagreementLine, explainDecision } from "@/app/console/types";
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
      <p>Reader A (the delivery note) saw job {a.workOrderId}, {a.amount}.</p>
      <p>Reader B (the payer's record) saw job {b.workOrderId}, {b.amount}.</p>
      <p className="mt-1">They disagreed, so Tiba refused.</p>
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
          <p className="eyebrow">History</p>
          <h1 className="display-l mt-2">
            Every decision
          </h1>
        </header>

        <section className="card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line eyebrow">
                <tr>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Paid to</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Why</th>
                  <th className="px-4 py-3">Check references</th>
                  <th className="px-4 py-3">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {intents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted">
                      Nothing yet. Send a test payment from the console and it will appear here.
                    </td>
                  </tr>
                ) : intents.map((intent) => (
                  <tr key={intent.id} className="align-top">
                    <td className="px-4 py-5">
                      <span className={intent.decisionClass === "PAID" ? "pill pill-paid" : intent.decisionClass === "AMBER" ? "pill pill-held" : "pill pill-refused"}>
                        {decisionWord(intent.decisionClass)}
                      </span>
                    </td>
                    <td className="px-4 py-5">{formatTime(intent.createdAt)}</td>
                    <td className="px-4 py-5">
                      <p className="font-semibold">{intent.recipient.displayName}</p>
                      <p className="num text-xs text-muted">ID {intent.recipient.ref}</p>
                    </td>
                    <td className="px-4 py-5 num text-right font-semibold">{microsToUsdc(intent.amountMicros)}</td>
                    <td className="px-4 py-5 text-sm">
                      <p>{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                      <p className="num mt-1 text-xs text-muted">
                        {intent.decisionClass === "PAID" ? "PAID" : intent.reasonCode ? `Reason code ${intent.reasonCode}` : "no reason recorded"}
                      </p>
                      {intent.decisionClass !== "PAID" && renderAdjudicationDetails(intent.adjudications, intent.reasonCode)}
                    </td>
                    <td className="px-4 py-5 num text-xs text-muted">
                      <p>A {requestIdFor(intent.adjudications, "artifact")}</p>
                      <p>B {requestIdFor(intent.adjudications, "payer_record")}</p>
                    </td>
                    <td className="px-4 py-5">
                      {intent.explorerUrl ? (
                        <a className="link num break-all text-xs" href={intent.explorerUrl}>
                          {intent.digest ?? "digest"}
                        </a>
                      ) : (
                        <span className="num text-xs text-muted">—</span>
                      )}
                      <div className="mt-2">
                        <Link
                          className="btn btn-ghost"
                          href={`/r/${intent.publicToken}`}
                        >
                          Receipt →
                        </Link>
                      </div>
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
