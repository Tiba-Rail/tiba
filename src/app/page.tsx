import Link from "next/link";
import { RotatingWord } from "@/components/rotating-word";
import { SiteNav } from "@/components/site-nav";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { channelTuple } from "@/lib/adjudication-display";
import { disagreementLine, decisionSentence } from "@/app/console/types";
import { formatDollars } from "@/app/format";
import { getSettlementAddress, getSettlementBalance } from "@/app/settlement";

export const dynamic = "force-dynamic";

function requestIdFor(adjudications: Array<{ channel: string; requestId: string | null }>, channel: string): string {
  return adjudications.find((row) => row.channel === channel)?.requestId ?? "missing";
}

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
  const [paidIntent, refusedIntent, agent, heldIntents, recentIntents] = await Promise.all([
    prisma.payoutIntent.findFirst({
      where: { decisionClass: "PAID" },
      include: { adjudications: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payoutIntent.findFirst({
      where: { decisionClass: "RED" },
      include: { adjudications: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" }
    }),
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
      take: 5,
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const refusedDisagreement = refusedIntent
    ? disagreementLine(
        refusedIntent.reasonCode,
        channelTuple(refusedIntent.adjudications.find((row) => row.channel === "artifact")?.tupleJson),
        channelTuple(refusedIntent.adjudications.find((row) => row.channel === "payer_record")?.tupleJson)
      )
    : null;

  const settlementAddress = getSettlementAddress();
  const balanceMicros = settlementAddress && agent ? await getSettlementBalance(settlementAddress) : 0n;

  const remainingDay = agent ? maxBig(0n, agent.dayCapMicros - agent.spentMicrosDay) : 0n;
  const spendableMicros = agent ? minBig(balanceMicros, remainingDay) : 0n;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-16 pt-16 md:gap-16 md:px-6 md:pt-24 lg:px-8">
        <header>
          <p className="eyebrow">A wallet for AI agents · test network</p>
          <h1 className="display-xl mt-4 max-w-[20ch]">
            A wallet your <RotatingWord words={["AI agents", "software", "apps", "workflows"]} intervalMs={2500} /> can <em>pay people</em> from.
          </h1>
          <p className="lede mt-6">
            Tiba pays on your behalf, within the limits you set, and only after two separate checks agree
            on the invoice and the amount. Anything else is refused or held for approval, and the receipt
            says why.
          </p>
        </header>

        {/* Wallet block */}
        <section className="border-t border-line pt-8 md:pt-12">
          {agent ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <div className="flex flex-col-reverse gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="eyebrow">Spendable today</p>
                    <p className="display-l mt-2 tabular-nums" aria-live="polite">
                      {formatDollars(spendableMicros)}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Balance {formatDollars(balanceMicros)} · resets 00:00 UTC
                    </p>
                    <Link className="link mt-2 inline-block text-sm" href="/fund">
                      Add funds
                    </Link>
                  </div>
                  <Link className="btn btn-primary w-full md:w-auto" href="/console">
                    Send
                  </Link>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">Today</span>
                  <span className="num text-muted">
                    {formatDollars(agent.spentMicrosDay)} of {formatDollars(agent.dayCapMicros)}
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosDay, agent.dayCapMicros)))}%` }}
                  />
                </div>

                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">This hour</span>
                  <span className="num text-muted">
                    {formatDollars(agent.spentMicrosHour)} of {formatDollars(agent.hourCapMicros)}
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosHour, agent.hourCapMicros)))}%` }}
                  />
                </div>

                <p className="text-sm text-muted">
                  Per invoice max {formatDollars(agent.ceilingMicros)}
                </p>
              </div>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="title">Nothing is set up yet</h2>
              <p className="lede mt-2">This wallet has no software attached yet.</p>
              <Link className="btn btn-primary mt-5" href="/console">
                Send
              </Link>
            </div>
          )}

          {heldIntents.length > 0 ? (
            <Link
              className="card mt-8 flex items-center justify-between p-4 transition-colors hover:bg-action-tint/40"
              href="/console#approvals"
            >
              <span className="font-medium">
                {heldIntents.length} payment{heldIntents.length === 1 ? "" : "s"} need your approval
              </span>
              <span className="num text-sm text-muted">→</span>
            </Link>
          ) : null}

          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Recent</p>
              <Link className="link text-sm" href="/ledger">
                All →
              </Link>
            </div>
            <div className="mt-4 divide-y divide-line border-t border-line">
              {recentIntents.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted">No activity yet.</p>
                  <p className="mt-1 text-sm text-muted">Send a payment and it will appear here.</p>
                </div>
              ) : (
                recentIntents.map((intent) => (
                  <div
                    key={intent.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-4 md:grid md:grid-cols-[1fr_auto_auto_auto] md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{intent.recipient.displayName}</p>
                    </div>
                    <p className="num font-medium">{formatDollars(intent.amountMicros)}</p>
                    <p className={`text-sm font-medium ${statusClass(intent.decisionClass)}`}>
                      {decisionSentence(intent.decisionClass)}
                    </p>
                    <p className="text-sm text-muted" title={new Date(intent.createdAt).toISOString()}>
                      {formatRelativeTime(intent.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <Link className="btn btn-primary mt-8 w-full" href="/console">
              Send
            </Link>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Measured on the test network</p>
          <div className="mt-6 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <p className="num display-l">20 / 20</p>
              <p className="eyebrow mt-2">honest notes paid</p>
            </div>
            <div>
              <p className="num display-l">10 / 10</p>
              <p className="eyebrow mt-2">tampered notes refused</p>
            </div>
            <div>
              <p className="num display-l">0</p>
              <p className="eyebrow mt-2">false refusals</p>
            </div>
            <div>
              <p className="num display-l">~13 s</p>
              <p className="eyebrow mt-2">per decision</p>
            </div>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">How a payment gets checked</p>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            <li>
              <p className="num text-sm text-muted">01</p>
              <p className="lede mt-3">
                Your software submits a delivery note for an invoice.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">02</p>
              <p className="lede mt-3">
                Two separate automated checks read it: one the delivery note, one your own
                records. Neither sees the other&apos;s answer.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">03</p>
              <p className="lede mt-3">
                Same invoice and same amount from both: paid. Otherwise: refused or held for
                approval, and the receipt says why.
              </p>
            </li>
          </ol>
          <div className="mt-10 space-y-4">
            <p className="lede">
              A forged note, an inflated amount, or a hidden instruction can change one check but not
              the other — so it does not go through.
            </p>
            <p className="lede">
              If a check cannot run, the payment is held for approval. Tiba never fills the gap with
              a guess.
            </p>
            <p className="lede">
              Around both checks sit limits you set and your software can only read: a per-payment
              ceiling, hourly and daily spending limits, a list of saved recipients, and a freeze.
            </p>
            <p className="lede">Paid to the wallet you already have.</p>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">A real example</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {refusedIntent ? (
              <div className="card p-5">
                <span className="pill pill-refused">Refused</span>
                <p className="mt-3 text-sm">
                  {refusedDisagreement ??
                    "The two checks gave different answers, so Tiba refused."}
                </p>
                <Link className="btn btn-ghost mt-3" href={`/r/${refusedIntent.publicToken}`}>
                  Open receipt →
                </Link>
              </div>
            ) : null}
            {paidIntent ? (
              <div className="card p-5">
                <span className="pill pill-paid">Paid</span>
                <p className="mt-3 text-sm">
                  <span className="num">{microsToUsdc(paidIntent.amountMicros)}</span> — test
                  transfer, no real money moved
                </p>
                <p className="eyebrow mt-4">Transaction</p>
                {paidIntent.explorerUrl ? (
                  <a className="link mt-1 inline-block text-sm" href={paidIntent.explorerUrl}>
                    View on test network
                  </a>
                ) : (
                  <p className="num mt-1 break-all text-xs text-muted">{paidIntent.digest ?? "missing"}</p>
                )}
                <p className="eyebrow mt-4">Check references</p>
                <p className="num mt-1 break-all text-xs text-muted">
                  A: {requestIdFor(paidIntent.adjudications, "artifact")} · B:{" "}
                  {requestIdFor(paidIntent.adjudications, "payer_record")}
                </p>
                <div>
                  <Link className="btn btn-ghost mt-3" href={`/r/${paidIntent.publicToken}`}>
                    Open receipt →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="card p-5">
                <span className="pill pill-paid">Paid</span>
                <p className="mt-3 text-sm text-muted">
                  No paid example yet. Send a payment from Send.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-line pt-12 text-sm text-muted">
          Tiba · Test network only — no real money moves yet ·{" "}
          <a className="link" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
