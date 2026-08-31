import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";
import { channelTuple, disagreementLine } from "@/lib/adjudication-display";

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

  // Get channel tuples for disagreement line
  const channelATuple = channelTuple(adjudicationsByChannel.get("artifact")?.tupleJson);
  const channelBTuple = channelTuple(adjudicationsByChannel.get("payer_record")?.tupleJson);
  const disagreement = disagreementLine(intent.reasonCode, channelATuple, channelBTuple);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Public receipt</p>
            <h1 className="display mt-2 text-4xl md:text-5xl">
              {decisionLabel(intent.decisionClass)}
            </h1>
          </div>
          <div className="card p-4 md:min-w-72">
            <p className="text-sm text-muted">Amount</p>
            <p className="mt-1 text-2xl font-semibold">{microsToUsdc(intent.amountMicros)}</p>
          </div>
        </header>

        <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />

        <section className="grid gap-4 md:grid-cols-3">
          <Fact label="Recipient" value={intent.recipient.displayName} detail={intent.recipient.ref} />
          <Fact label="Rule fired" value={paid ? "PAID" : intent.reasonCode ?? "UNKNOWN"} />
          <Fact label="Remaining day budget" value={remainingBudget(intent.agent.dayCapMicros, intent.agent.spentMicrosDay)} />
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-bold">Model adjudications</h2>
          {disagreement && (
            <p className="mt-3 text-sm text-muted">{disagreement}</p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {adjudications.map(({ channel, row }) => (
              <div key={channel} className="card p-4">
                <p className="eyebrow">{channelTitle(channel)}</p>
                {row ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="text-muted">Model</dt>
                      <dd className="break-words font-mono">{row.model}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">x-request-id</dt>
                      <dd className="break-words font-mono">{row.requestId ?? "missing"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Latency</dt>
                      <dd className="font-mono">{formatLatency(row.latencyMs)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-muted">No adjudication recorded for this channel.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-xl font-bold">Settlement</h2>
            {paid && intent.explorerUrl ? (
              <a
                className="mt-3 block break-all font-mono text-sm text-primary underline-offset-4 hover:underline"
                href={intent.explorerUrl}
              >
                {intent.digest ?? intent.explorerUrl}
              </a>
            ) : (
              <p className="mt-3 text-sm text-muted">No settlement digest for this decision.</p>
            )}
            {(intent.reasonCode === "SETTLEMENT_FAILED" || intent.reasonCode === "SUI_EXECUTION_FAILED") && (
              <p className="mt-2 text-sm text-muted">Both channels agreed and policy passed — the on-chain transfer itself failed.</p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-xl font-bold">GNK/USD</h2>
            {intent.gnkUsd ? (
              <p className="mt-3 text-2xl font-semibold">
                ${intent.gnkUsd}
                <span className="ml-2 align-middle text-sm font-medium text-muted">
                  at {formatTime(intent.pricingUpdatedAt)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">rate unavailable</p>
            )}
          </div>
        </section>

        <Link
          className="btn btn-secondary w-fit"
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
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 break-words font-mono text-xs text-muted">{detail}</p> : null}
    </div>
  );
}