import Link from "next/link";
import { RotatingWord } from "@/components/rotating-word";
import { SiteNav } from "@/components/site-nav";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { channelTuple } from "@/lib/adjudication-display";
import { disagreementLine } from "@/app/console/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiba — a wallet for AI agents" };

function requestIdFor(adjudications: Array<{ channel: string; requestId: string | null }>, channel: string): string {
  return adjudications.find((row) => row.channel === channel)?.requestId ?? "missing";
}

// Pinned to the 11 Sep devnet payout of 0.01 USDC to recipient sol-test-0911. The newest PAID row
// was a treasury self-pay test that moved the money back into the payer's own account.
const EXAMPLE_PAID_INTENT_ID = "0e4d1636-dad4-4369-8fde-1e4d1fa57fc3";

export default async function Home() {
  const [paidIntent, refusedIntent] = await Promise.all([
    prisma.payoutIntent.findUnique({
      where: { id: EXAMPLE_PAID_INTENT_ID },
      include: { adjudications: { orderBy: { createdAt: "asc" } } }
    }),
    prisma.payoutIntent.findFirst({
      where: { decisionClass: "RED" },
      include: { adjudications: { orderBy: { createdAt: "asc" } } },
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
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/start">
              Create your wallet
            </Link>
            <Link className="btn btn-secondary" href="/signin">
              Sign in
            </Link>
            <Link className="btn btn-ghost" href="/app">
              See the demo wallet
            </Link>
          </div>
        </header>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Eval of an earlier build, 29 Aug 2026, on a mock settlement rail. Not live figures.</p>
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
              <p className="num display-l">0 / 20</p>
              <p className="eyebrow mt-2">false refusals</p>
            </div>
            <div>
              <p className="num display-l">13 s</p>
              <p className="eyebrow mt-2">mean per decision</p>
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
                  <span className="num">{microsToUsdc(paidIntent.amountMicros)}</span> sent to a
                  separate recipient wallet on the test network. No real money moved.
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
          <Link className="link" href="/app">
            Open the app
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
