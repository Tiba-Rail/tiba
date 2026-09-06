import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { prisma } from "@/lib/db";
import { decisionSentence } from "@/app/console/types";
import { formatDollars } from "@/app/format";
import { getSettlementAddress, getSettlementBalance } from "@/app/settlement";

export const dynamic = "force-dynamic";

function percent(spent: bigint, cap: bigint): number {
  if (cap <= 0n) return 0;
  return Number((spent * 10_000n) / cap) / 100;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(date);
}

function statusClass(decisionClass: string): string {
  if (decisionClass === "PAID") return "text-paid";
  if (decisionClass === "AMBER") return "text-held";
  return "text-refused";
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export default async function Home() {
  const [agent, heldIntents, recentIntents] = await Promise.all([
    prisma.agent.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.payoutIntent.findMany({
      where: {
        OR: [
          { decisionClass: "AMBER" },
          { decisionClass: "RED", reasonCode: { startsWith: "QUORUM_SPLIT" } }
        ]
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payoutIntent.findMany({
      take: 6,
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const settlementAddress = getSettlementAddress();
  const balanceMicros = settlementAddress && agent ? await getSettlementBalance(settlementAddress) : 0n;

  const remainingDay = agent ? maxBig(0n, agent.dayCapMicros - agent.spentMicrosDay) : 0n;
  const spendableMicros = agent ? minBig(balanceMicros, remainingDay) : 0n;
  const empty = balanceMicros === 0n;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-3xl flex-col px-4 pb-16 pt-10 md:px-6 md:pt-14 lg:px-8">

        {/* Spendable today — the number */}
        <header>
          <p className="eyebrow">Spendable today</p>
          <p className="display-xl mt-3 tabular-nums" aria-live="polite">
            {formatDollars(spendableMicros)}
          </p>
          <p className="mt-3 text-sm text-muted">
            {empty ? (
              "Add funds so your agent can pay someone."
            ) : (
              <>Balance <span className="tabular-nums">{formatDollars(balanceMicros)}</span> · resets 00:00 UTC</>
            )}
          </p>
        </header>

        {/* Primary actions */}
        <div className="mt-8 flex gap-3">
          <Link className="btn btn-primary flex-1 md:flex-none" href="/console">
            Send
          </Link>
          <Link className="btn btn-secondary flex-1 md:flex-none" href="/fund">
            Add funds
          </Link>
        </div>

        {/* Limits — thin rules, not cards */}
        {agent ? (
          <div className="mt-10 divide-y divide-line border-y border-line">
            <div className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>Today</span>
                <span className="tabular-nums text-muted">
                  {formatDollars(agent.spentMicrosDay)} of {formatDollars(agent.dayCapMicros)}
                </span>
              </div>
              <div className="mt-2 h-0.5 bg-line">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosDay, agent.dayCapMicros)))}%` }}
                />
              </div>
            </div>
            <div className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>This hour</span>
                <span className="tabular-nums text-muted">
                  {formatDollars(agent.spentMicrosHour)} of {formatDollars(agent.hourCapMicros)}
                </span>
              </div>
              <div className="mt-2 h-0.5 bg-line">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosHour, agent.hourCapMicros)))}%` }}
                />
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span>Per invoice</span>
              <span className="tabular-nums text-muted">
                max {formatDollars(agent.ceilingMicros)}
              </span>
            </div>
          </div>
        ) : null}

        {/* Attention strip — only when something needs it */}
        {heldIntents.length > 0 ? (
          <Link
            className="card mt-8 flex items-center justify-between p-4 transition-colors hover:bg-action-tint/40"
            href="/console#approvals"
          >
            <span className="text-sm font-medium">
              {heldIntents.length} payment{heldIntents.length === 1 ? "" : "s"} need your approval
            </span>
            <span className="text-sm text-muted">→</span>
          </Link>
        ) : null}

        {/* Recent */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">Recent</p>
            <Link className="link text-sm" href="/ledger">
              All →
            </Link>
          </div>
          <div className="mt-3 divide-y divide-line border-t border-line">
            {recentIntents.length === 0 ? (
              <p className="py-8 text-sm text-muted">
                No payments yet. When your software pays someone, it shows up here.
              </p>
            ) : (
              recentIntents.map((intent) => (
                <Link
                  key={intent.id}
                  href={`/r/${intent.publicToken}`}
                  className="flex items-baseline justify-between gap-3 py-3 text-sm transition-colors hover:bg-action-tint/40"
                >
                  <span className="min-w-0 truncate font-medium">{intent.recipient.displayName}</span>
                  <span className="flex shrink-0 items-baseline gap-4">
                    <span className="tabular-nums">{formatDollars(intent.amountMicros)}</span>
                    <span className={statusClass(intent.decisionClass)}>
                      {decisionSentence(intent.decisionClass)}
                    </span>
                    <span className="w-10 text-right text-muted" title={new Date(intent.createdAt).toISOString()}>
                      {formatRelativeTime(intent.createdAt)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <p className="mt-10 text-sm text-muted">
          New here?{" "}
          <Link className="link" href="/how">
            See how Tiba works →
          </Link>
        </p>

        <footer className="mt-12 border-t border-line pt-8 text-sm text-muted">
          Tiba · Test network only — no real money moves yet ·{" "}
          <Link className="link" href="/how">
            How Tiba works
          </Link>{" "}
          ·{" "}
          <a className="link" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
