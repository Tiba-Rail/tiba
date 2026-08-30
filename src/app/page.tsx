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
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <RouterHealthStrip />
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 md:px-6 lg:px-8">
        <header className="max-w-4xl">
          <h1 className="text-5xl font-black tracking-normal text-zinc-50 md:text-7xl">Tiba</h1>
          <p className="mt-4 max-w-3xl text-xl font-semibold leading-snug text-zinc-100 md:text-2xl">
            Software pays a person. No human approves each transfer. Policy holds the line.
          </p>
          <p className="mt-3 text-base text-zinc-300">
            Agent-to-human payment rail on Sui testnet, verified through GonkaRouter.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-10 items-center rounded-md bg-cyan-300 px-4 py-2 text-sm font-black text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              href="/console"
            >
              Open console
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              href="/ledger"
            >
              Open ledger
            </Link>
          </div>
        </header>

        <section>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">How a payment happens</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="font-black text-zinc-50">1 Verify</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                An agent submits a payout intent with the untrusted artifact; two isolated channels through GonkaRouter must agree on {"{work_order_id, amount}"}; disagreement is a refusal, never a tie-break.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="font-black text-zinc-50">2 Bound</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Per-transfer ceiling, rolling caps, allowlist, kill switch, idempotency - one atomic debit that succeeds or refuses.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="font-black text-zinc-50">3 Settle</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                USDC-stand-in (SUI) on Sui testnet; every outcome gets a public receipt with both Gonka request IDs.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Proof</p>
          {paidIntent ? (
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500">Amount</p>
                <p className="mt-1 font-semibold text-zinc-100">{microsToUsdc(paidIntent.amountMicros)} <span className="text-xs font-normal text-zinc-500">settled as SUI, testnet stand-in</span></p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Digest</p>
                {paidIntent.explorerUrl ? (
                  <a
                    className="mt-1 block break-all font-mono text-xs text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    href={paidIntent.explorerUrl}
                  >
                    {paidIntent.digest ?? "missing"}
                  </a>
                ) : (
                  <p className="mt-1 font-mono text-xs text-zinc-400">{paidIntent.digest ?? "missing"}</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500">Receipt</p>
                <Link
                  className="mt-1 inline-flex min-h-10 items-center rounded-md border border-zinc-700 px-3 py-2 font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  href={`/r/${paidIntent.publicToken}`}
                >
                  Public receipt
                </Link>
              </div>
              <div className="md:col-span-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Gonka request IDs</p>
                <p className="mt-1 font-mono text-xs text-zinc-300">
                  A: {requestIdFor(paidIntent.adjudications, "artifact")} | B: {requestIdFor(paidIntent.adjudications, "payer_record")}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">No settled payment yet - run npm run e2e</p>
          )}
        </section>

        <footer className="text-sm text-zinc-400">
          Testnet only. MUBA Blockchain Hackathon 2026 · Rizqey Labs - Faris Irfan, Arthur Wong, Aariz Sajan.{" "}
          <a className="text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
