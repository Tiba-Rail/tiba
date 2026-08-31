import Link from "next/link";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { explainDecision } from "@/app/console/types";

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
      <RouterHealthStrip />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-8">
          <p className="eyebrow">Payout intents</p>
          <h1 className="display mt-2 text-3xl md:text-5xl">One payment, start to finish</h1>
          <p className="mt-4 text-muted">Every payment an agent has attempted, grouped by what happened to it. Click through to the full record.</p>
        </header>

        <div className="space-y-6">
          {/* Paid section */}
          <section className="card p-5">
            <h2 className="text-xl font-bold">Paid ({paidIntents.length})</h2>
            {paidIntents.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {paidIntents.map((intent) => (
                  <Link 
                    key={intent.id} 
                    href={`/r/${intent.publicToken}`}
                    className="block card p-4 hover:border-line-strong"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">{intent.recipient.displayName}</p>
                        <p className="font-mono text-xs text-muted">{intent.recipient.ref}</p>
                      </div>
                      <div className="mt-2 md:mt-0 md:text-right">
                        <p className="font-semibold">{microsToUsdc(intent.amountMicros)}</p>
                        <p className="text-sm text-muted">{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                        <p className="text-xs text-muted mt-1">{formatTime(intent.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Refused section */}
          <section className="card p-5">
            <h2 className="text-xl font-bold">Refused ({refusedIntents.length})</h2>
            {refusedIntents.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {refusedIntents.map((intent) => (
                  <Link 
                    key={intent.id} 
                    href={`/r/${intent.publicToken}`}
                    className="block card p-4 hover:border-line-strong"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">{intent.recipient.displayName}</p>
                        <p className="font-mono text-xs text-muted">{intent.recipient.ref}</p>
                      </div>
                      <div className="mt-2 md:mt-0 md:text-right">
                        <p className="font-semibold">{microsToUsdc(intent.amountMicros)}</p>
                        <p className="text-sm text-muted">{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                        <p className="text-xs text-muted mt-1">{formatTime(intent.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Settlement failed section */}
          <section className="card p-5">
            <h2 className="text-xl font-bold">Settlement failed ({settlementFailedIntents.length})</h2>
            {settlementFailedIntents.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {settlementFailedIntents.map((intent) => (
                  <Link 
                    key={intent.id} 
                    href={`/r/${intent.publicToken}`}
                    className="block card p-4 hover:border-line-strong"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">{intent.recipient.displayName}</p>
                        <p className="font-mono text-xs text-muted">{intent.recipient.ref}</p>
                      </div>
                      <div className="mt-2 md:mt-0 md:text-right">
                        <p className="font-semibold">{microsToUsdc(intent.amountMicros)}</p>
                        <p className="text-sm text-muted">{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                        <p className="text-xs text-muted mt-1">{formatTime(intent.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Held section */}
          <section className="card p-5">
            <h2 className="text-xl font-bold">Held ({heldIntents.length})</h2>
            {heldIntents.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {heldIntents.map((intent) => (
                  <Link 
                    key={intent.id} 
                    href={`/r/${intent.publicToken}`}
                    className="block card p-4 hover:border-line-strong"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold">{intent.recipient.displayName}</p>
                        <p className="font-mono text-xs text-muted">{intent.recipient.ref}</p>
                      </div>
                      <div className="mt-2 md:mt-0 md:text-right">
                        <p className="font-semibold">{microsToUsdc(intent.amountMicros)}</p>
                        <p className="text-sm text-muted">{explainDecision(intent.decisionClass, intent.reasonCode)}</p>
                        <p className="text-xs text-muted mt-1">{formatTime(intent.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}