import Link from "next/link";
import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <RouterHealthStrip />
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 md:px-6 lg:px-8">
        <header className="max-w-4xl">
          <h1 className="display text-5xl md:text-7xl"><span className="text-accent">Tiba</span></h1>
          <p className="mt-4 max-w-3xl text-xl font-semibold leading-snug md:text-2xl">
            Software pays a person. No human approves each transfer. Policy holds the line.
          </p>
          <p className="mt-3 text-base text-muted">
            Agent-to-human payment rail on Sui testnet, verified through GonkaRouter.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="btn btn-primary"
              href="/console"
            >
              Open console
            </Link>
            <Link
              className="btn btn-secondary"
              href="/ledger"
            >
              Open ledger
            </Link>
          </div>
        </header>

        <section>
          <p className="eyebrow">How a payment happens</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="card p-4">
              <p className="font-semibold">1 Verify</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                An agent submits a payout intent with the untrusted artifact; two isolated channels through GonkaRouter must agree on {"{work_order_id, amount}"}; disagreement is a refusal, never a tie-break.
              </p>
            </div>
            <div className="card p-4">
              <p className="font-semibold">2 Bound</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Per-transfer ceiling, rolling caps, allowlist, kill switch, idempotency - one atomic debit that succeeds or refuses.
              </p>
            </div>
            <div className="card p-4">
              <p className="font-semibold">3 Settle</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                USDC-stand-in (SUI) on Sui testnet; every outcome gets a public receipt with both Gonka request IDs.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <p className="eyebrow">Proof</p>
          {paidIntent ? (
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="eyebrow">Amount</p>
                <p className="mt-1 font-semibold">{microsToUsdc(paidIntent.amountMicros)} <span className="text-xs font-normal text-muted">settled as SUI, testnet stand-in</span></p>
              </div>
              <div className="md:col-span-2">
                <p className="eyebrow">Digest</p>
                {paidIntent.explorerUrl ? (
                  <a
                    className="mt-1 block break-all font-mono text-xs text-primary underline-offset-4 hover:underline"
                    href={paidIntent.explorerUrl}
                  >
                    {paidIntent.digest ?? "missing"}
                  </a>
                ) : (
                  <p className="mt-1 font-mono text-xs text-muted">{paidIntent.digest ?? "missing"}</p>
                )}
              </div>
              <div>
                <p className="eyebrow">Receipt</p>
                <Link
                  className="btn btn-secondary mt-1"
                  href={`/r/${paidIntent.publicToken}`}
                >
                  Public receipt
                </Link>
              </div>
              <div className="md:col-span-4">
                <p className="eyebrow">Gonka request IDs</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  A: {requestIdFor(paidIntent.adjudications, "artifact")} | B: {requestIdFor(paidIntent.adjudications, "payer_record")}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No settled payment yet - run npm run e2e</p>
          )}
        </section>

        <footer className="text-sm text-muted">
          Testnet only. MUBA Blockchain Hackathon 2026 · Rizqey Labs - Faris Irfan, Arthur Wong, Aariz Sajan.{" "}
          <a className="text-primary underline-offset-4 hover:underline" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
