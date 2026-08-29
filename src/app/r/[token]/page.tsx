import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatTime(date: Date | null): string {
  if (!date) return "rate unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function remainingBudget(dayCapMicros: bigint, spentMicrosDay: bigint): string {
  const remaining = dayCapMicros > spentMicrosDay ? dayCapMicros - spentMicrosDay : 0n;
  return microsToUsdc(remaining);
}

function decisionLabel(decisionClass: string): string {
  return decisionClass === "PAID" ? "PAID" : decisionClass;
}

function channelTitle(channel: string): string {
  return channel === "artifact" ? "A - artifact" : channel === "payer_record" ? "B - payer record" : channel;
}

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intent = await prisma.payoutIntent.findUnique({
    where: { publicToken: token },
    include: {
      agent: true,
      recipient: true,
      adjudications: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!intent) notFound();

  const adjudicationsByChannel = new Map(intent.adjudications.map((row) => [row.channel, row]));
  const adjudications = ["artifact", "payer_record"].map((channel) => ({
    channel,
    row: adjudicationsByChannel.get(channel)
  }));
  const paid = intent.decisionClass === "PAID";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Public receipt</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-zinc-50 md:text-5xl">
              {decisionLabel(intent.decisionClass)}
            </h1>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:min-w-72">
            <p className="text-sm text-zinc-400">Amount</p>
            <p className="mt-1 text-2xl font-black text-zinc-50">{microsToUsdc(intent.amountMicros)}</p>
          </div>
        </header>

        <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />

        <section className="grid gap-4 md:grid-cols-3">
          <Fact label="Recipient" value={intent.recipient.displayName} detail={intent.recipient.ref} />
          <Fact label="Rule fired" value={paid ? "PAID" : intent.reasonCode ?? "UNKNOWN"} />
          <Fact label="Remaining day budget" value={remainingBudget(intent.agent.dayCapMicros, intent.agent.spentMicrosDay)} />
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-bold text-zinc-50">Model adjudications</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {adjudications.map(({ channel, row }) => (
              <div key={channel} className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{channelTitle(channel)}</p>
                {row ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="text-zinc-500">Model</dt>
                      <dd className="break-words font-mono text-zinc-100">{row.model}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">x-request-id</dt>
                      <dd className="break-words font-mono text-zinc-100">{row.requestId ?? "missing"}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Latency</dt>
                      <dd className="font-mono text-zinc-100">{formatLatency(row.latencyMs)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-zinc-400">No adjudication recorded for this channel.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-xl font-bold text-zinc-50">Settlement</h2>
            {paid && intent.explorerUrl ? (
              <a
                className="mt-3 block break-all font-mono text-sm text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                href={intent.explorerUrl}
              >
                {intent.digest ?? intent.explorerUrl}
              </a>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">No settlement digest for this decision.</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-xl font-bold text-zinc-50">GNK/USD</h2>
            {intent.gnkUsd ? (
              <p className="mt-3 text-2xl font-black text-zinc-50">
                ${intent.gnkUsd}
                <span className="ml-2 align-middle text-sm font-medium text-zinc-400">
                  at {formatTime(intent.pricingUpdatedAt)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">rate unavailable</p>
            )}
          </div>
        </section>

        <Link
          className="inline-flex min-h-10 w-fit items-center rounded-md border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          href="/ledger"
        >
          View ledger
        </Link>
      </div>
    </main>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 break-words text-xl font-black text-zinc-50">{value}</p>
      {detail ? <p className="mt-1 break-words font-mono text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}
