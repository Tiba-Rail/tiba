import Link from "next/link";
import { RotatingWord } from "@/components/rotating-word";
import { SiteNav } from "@/components/site-nav";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { BillRecordMismatch } from "@/components/bill-record-mismatch";
import { homepageRefusedCard } from "@/lib/receipt-comparison";
import { EXAMPLE_PAID_INTENT_ID } from "@/lib/public-demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiba — the check before an agent's payment goes out" };

function requestIdFor(adjudications: Array<{ channel: string; requestId: string | null }>, channel: string): string {
  return adjudications.find((row) => row.channel === channel)?.requestId ?? "missing";
}

export default async function Home() {
  const [paidIntent, refusedIntent] = await Promise.all([
    prisma.payoutIntent.findUnique({
      where: { id: EXAMPLE_PAID_INTENT_ID },
      include: { adjudications: { orderBy: { createdAt: "asc" } } }
    }),
    prisma.payoutIntent.findFirst({
      // Only a refusal from the same demo workspace as the pinned payment. Other workspaces'
      // receipts are public by link, never advertised here.
      where: { decisionClass: "RED", agent: { intents: { some: { id: EXAMPLE_PAID_INTENT_ID } } } },
      include: { adjudications: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const refusedCard = homepageRefusedCard(refusedIntent);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-16 pt-16 md:gap-16 md:px-6 md:pt-24 lg:px-8">
        <header>
          <p className="eyebrow">The check before a payment goes out · test network</p>
          <h1 className="display-xl mt-4 max-w-[20ch]">
            The check that runs before your <RotatingWord words={["AI agents", "software", "apps", "workflows"]} intervalMs={2500} /> <em>pay someone</em>.
          </h1>
          <p className="lede mt-6">
            It reads the bill against your own record — the amount, the job, the payee — and pays
            only when they match. When they don&apos;t, it refuses, and you get a receipt either way.
          </p>
          <p className="lede mt-4">
            Once agents pay bills, the bill itself becomes the attack. The check that reads your
            record is never shown the bill, and the amount paid always comes from your record, so a
            fake or padded bill can&apos;t raise it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href={refusedIntent ? `/r/${refusedIntent.publicToken}` : "/try"}>
              See it refuse a bad bill
            </Link>
            <Link className="btn btn-secondary" href="/try">
              Try it
            </Link>
            <Link className="btn btn-secondary" href="/start">
              Create your wallet
            </Link>
            <Link className="btn btn-ghost" href="/signin">
              Sign in
            </Link>
            <Link className="btn btn-ghost" href="/app">
              See the demo wallet
            </Link>
            <Link className="btn btn-ghost" href="/permissions">
              Explore permissions
            </Link>
          </div>
        </header>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">A real example</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {refusedCard ? (
              <div className="card p-5">
                <span className="pill pill-refused">Refused</span>
                <BillRecordMismatch comparison={refusedCard.comparison} compact />
                <Link className="btn btn-ghost mt-3" href={refusedCard.href}>
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
          <p className="lede mt-8 text-sm text-muted">
            18 rivals checked, 25 Sep 2026 — Coinbase, Stripe, Squads, and thirteen YC companies.
            Of the 18 we compared as of 25 Sep 2026, none offered both a bill check and a public
            receipt for a refusal. Tiba works for any payer and any bill, not one supply chain, and
            every check, paid or refused, gets a public receipt anyone can open by link.
          </p>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Your control, made explicit</p>
          <div className="mt-6 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <p className="num display-l">01</p>
              <p className="eyebrow mt-2">plain-English instruction</p>
            </div>
            <div>
              <p className="num display-l">02</p>
              <p className="eyebrow mt-2">human confirmation</p>
            </div>
            <div>
              <p className="num display-l">03</p>
              <p className="eyebrow mt-2">signed permission</p>
            </div>
            <div>
              <p className="num display-l">04</p>
              <p className="eyebrow mt-2">checkable receipt</p>
            </div>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">How it works</p>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            <li>
              <p className="num text-sm text-muted">01</p>
              <p className="lede mt-3">
                You keep a record of what you owe: the job, the amount, the payee.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">02</p>
              <p className="lede mt-3">
                When a bill comes in, Tiba reads it and checks it against your record before anything
                is signed.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">03</p>
              <p className="lede mt-3">
                If it names a different job or payee, it refuses. Otherwise it pays the amount your
                record approved, never the bill&apos;s. You get a receipt either way.
              </p>
            </li>
          </ol>
          <div className="mt-10 space-y-4">
            <p className="lede">
              Around the check: a signed permission slip, spending limits and a freeze that your agent
              can read but not change.
            </p>
            <p className="lede">
              Most agent-payment plumbing, including x402 — the protocol AWS, Cloudflare, Circle,
              and Coinbase now share — leaves the approval decision out of scope. The wallet is
              supposed to decide whether a payment may go out at all. That check is what Tiba
              runs, before any signature.
            </p>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Signed outcomes</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <span className="pill pill-paid">Recorded</span>
              <p className="mt-3 text-sm">
                A permitted notes action and a live <span className="num">0.01 USDC</span> Solana devnet payment each leave a signed receipt.
              </p>
              <Link className="btn btn-ghost mt-3" href="/receipts">
                See signed receipts →
              </Link>
            </div>
            <div className="card p-5">
              <span className="pill pill-refused">Refused</span>
              <p className="mt-3 text-sm">
                An action outside the permission is refused before it goes out. The refusal is signed, too.
              </p>
              <Link className="btn btn-ghost mt-3" href="/verify">
                Verify a receipt →
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Who this is for</p>
          <p className="lede mt-4 max-w-[60ch]">
            Communities and grant programs on Solana that pay contributors and bounties. An agent
            pays a contributor; Tiba reads the claim against the bounty and the record, pays or
            refuses, leaves a receipt either way.
          </p>
          <p className="eyebrow mt-10">One check, any rail</p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <p className="lede">
                <strong>Solana &middot; home rail.</strong> Where Tiba already runs, and where it
                won Superteam Malaysia&apos;s Solana Lab.
              </p>
            </div>
            <div>
              <p className="lede">
                <strong>Tempo &middot; proof.</strong> Built by Stripe and Paradigm, fees paid in
                the stablecoin itself. Built and tested, not live &mdash; for contractors and
                suppliers too.
              </p>
            </div>
            <div>
              <p className="lede">
                <strong>Zcash &middot; proof.</strong> Payments hidden by default, a viewing key
                for the auditor. Built and tested, not live &mdash; for private payroll and
                grants too.
              </p>
            </div>
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
