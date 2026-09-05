import Link from "next/link";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { explainDecision } from "@/app/console/types";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

interface IntentRow {
  id: string;
  publicToken: string;
  decisionClass: string;
  reasonCode: string | null;
  amountMicros: bigint;
  createdAt: Date;
  recipient: { ref: string; displayName: string };
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function IntentGroup({ title, intents }: { title: string; intents: IntentRow[] }) {
  return (
    <section className="card">
      <h2 className="title px-5 pt-5">{title}</h2>
      {intents.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">None yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-line">
          {intents.map((intent) => (
            <Link
              key={intent.id}
              href={`/r/${intent.publicToken}`}
              className="block px-5 py-4 hover:bg-[rgba(20,22,26,.03)]"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{intent.recipient.displayName}</p>
                  <p className="num text-xs text-muted">ID {intent.recipient.ref}</p>
                </div>
                <div className="mt-2 md:mt-0 md:text-right">
                  <p className="num font-semibold">{microsToUsdc(intent.amountMicros)}</p>
                  <p className="text-sm text-muted">{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                  <p className="text-xs text-muted mt-1">{formatTime(intent.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function IntentsPage() {
  const intents = await prisma.payoutIntent.findMany({
    include: {
      recipient: true,
      adjudications: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  // Group intents into buckets
  const paidIntents = intents.filter(intent => intent.decisionClass === "PAID");
  const refusedIntents = intents.filter(intent =>
    intent.decisionClass === "RED" &&
    intent.reasonCode !== "SETTLEMENT_FAILED" &&
    intent.reasonCode !== "SUI_EXECUTION_FAILED"
  );
  const settlementFailedIntents = intents.filter(intent =>
    intent.decisionClass === "RED" &&
    (intent.reasonCode === "SETTLEMENT_FAILED" || intent.reasonCode === "SUI_EXECUTION_FAILED")
  );
  const heldIntents = intents.filter(intent => intent.decisionClass === "AMBER");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="intents" />
      <RouterHealthStrip />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-8">
          <p className="eyebrow">Payment attempts</p>
          <h1 className="display-l mt-2">Every payment, start to finish</h1>
          <p className="lede mt-4">
            Every payment the program has tried to make, grouped by what happened. Open one to read
            its receipt.
          </p>
        </header>

        <div className="space-y-6">
          <IntentGroup title={`Paid (${paidIntents.length})`} intents={paidIntents} />
          <IntentGroup title={`Refused (${refusedIntents.length})`} intents={refusedIntents} />
          <IntentGroup title={`Approved but the transfer failed (${settlementFailedIntents.length})`} intents={settlementFailedIntents} />
          <IntentGroup title={`Waiting for a human (${heldIntents.length})`} intents={heldIntents} />
        </div>
      </div>
    </main>
  );
}
