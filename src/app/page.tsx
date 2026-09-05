import Link from "next/link";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { SiteNav } from "@/components/site-nav";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { channelTuple } from "@/lib/adjudication-display";
import { disagreementLine } from "@/app/console/types";

export const dynamic = "force-dynamic";

function requestIdFor(adjudications: Array<{ channel: string; requestId: string | null }>, channel: string): string {
  return adjudications.find((row) => row.channel === channel)?.requestId ?? "missing";
}

export default async function Home() {
  const paidIntent = await prisma.payoutIntent.findFirst({
    where: { decisionClass: "PAID" },
    include: {
      adjudications: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  const refusedIntent = await prisma.payoutIntent.findFirst({
    where: { decisionClass: "RED" },
    include: {
      adjudications: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  const refusedDisagreement = refusedIntent
    ? disagreementLine(
        refusedIntent.reasonCode,
        channelTuple(refusedIntent.adjudications.find((row) => row.channel === "artifact")?.tupleJson),
        channelTuple(refusedIntent.adjudications.find((row) => row.channel === "payer_record")?.tupleJson)
      )
    : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <RouterHealthStrip />
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-16 pt-16 md:gap-16 md:px-6 md:pt-24 lg:px-8">
        <header>
          <p className="eyebrow">A wallet for software · test network</p>
          <h1 className="display-xl mt-4 max-w-[20ch]">
            A wallet your software can <em>pay people</em> from.
          </h1>
          <p className="lede mt-6">
            Tiba pays on your behalf, within the limits you set, and only after two separate checks agree
            on the job and the amount. Anything else is refused or held for a human, and the receipt
            says why.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/console">
              Try a test payment
            </Link>
            <Link className="btn btn-secondary" href="/ledger">
              See every decision
            </Link>
          </div>
        </header>

        <section className="mt-12 border-t border-line pt-12">
          <p className="eyebrow">Measured on the test-network pilot</p>
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

        <section className="mt-12 border-t border-line pt-12">
          <p className="eyebrow">How a payment gets checked</p>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            <li>
              <p className="num text-sm text-muted">01</p>
              <p className="lede mt-3">
                A program acting for the payer submits a delivery note for a job.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">02</p>
              <p className="lede mt-3">
                Two separate automated checks read it: one the delivery note, one the payer's own
                record. Neither sees the other's answer.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">03</p>
              <p className="lede mt-3">
                Same job and same amount from both: paid. Otherwise: refused or held for a human, and
                the receipt says why.
              </p>
            </li>
          </ol>
          <div className="mt-10 space-y-4">
            <p className="lede">
              A forged note, an inflated amount, or a hidden instruction can change one check but not
              the other — so it does not go through.
            </p>
            <p className="lede">
              If a check cannot run, the payment is held for a human. Tiba never fills the gap with a
              guess.
            </p>
            <p className="lede">
              Around both checks sit limits a human sets and an agent can only read: a per-payment
              ceiling, hourly and daily spending limits, an allowlist of who may be paid, and a kill
              switch.
            </p>
            <p className="lede">Paid to the wallet you already have.</p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-12">
          <p className="eyebrow">A real example, from this pilot</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {refusedIntent ? (
              <div className="card p-5">
                <span className="pill pill-refused">Refused</span>
                <p className="mt-3 text-sm">
                  {refusedDisagreement ??
                    "The two checks gave different answers, so Tiba refused."}
                </p>
                <p className="num mt-3 text-xs text-muted">
                  Reason code {refusedIntent.reasonCode ?? "none recorded"}
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
                  <p className="num mt-1 text-xs text-muted">{paidIntent.digest ?? "missing"}</p>
                )}
                <p className="eyebrow mt-4">Check references</p>
                <p className="num mt-1 text-xs text-muted">
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
                  No paid example yet. Send a test payment from the console.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-line pt-12 text-sm text-muted">
          Tiba · Test network only — no real money moves yet ·{" "}
          <a className="link" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
