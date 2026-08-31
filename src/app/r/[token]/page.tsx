import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";
import { channelTuple, disagreementLine } from "@/lib/adjudication-display";
import { SiteNav } from "@/components/site-nav";
import { explainDecision } from "@/app/console/types";

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

  // Determine channel match status
  function getChannelMatchStatus(channelA: any, channelB: any): string {
    const tupleA = channelTuple(channelA?.tupleJson);
    const tupleB = channelTuple(channelB?.tupleJson);
    
    if (!tupleA || !tupleB) return "Unavailable";
    if (tupleA.workOrderId === tupleB.workOrderId && tupleA.amount === tupleB.amount) return "Match";
    return "Mismatch";
  }

  // Determine agreement status
  function getAgreementStatus(decisionClass: string, reasonCode: string | null): string {
    if (decisionClass === "PAID") return "Agreed";
    if (reasonCode?.startsWith("QUORUM_SPLIT")) return "Refused";
    return "Agreed";
  }

  // Determine policy status
  function getPolicyStatus(reasonCode: string | null): string {
    const policyRefusalCodes = [
      "DAY_AMOUNT_CAP", "DAY_COUNT_CAP", "HOUR_AMOUNT_CAP", "HOUR_COUNT_CAP",
      "TRANSACTION_CEILING", "WORK_ORDER_CEILING", "WORK_ORDER_EXPIRED", 
      "WORK_ORDER_NOT_OPEN", "NO_OPEN_OBLIGATION", "RECIPIENT_INACTIVE", 
      "RECIPIENT_NOT_FOUND", "KILL_SWITCH"
    ];
    
    if (policyRefusalCodes.includes(reasonCode || "")) return "Refused";
    return "Passed";
  }

  // Determine settlement status
  function getSettlementStatus(decisionClass: string, reasonCode: string | null): string {
    if (decisionClass === "PAID") return "Paid";
    if (reasonCode === "SETTLEMENT_FAILED" || reasonCode === "SUI_EXECUTION_FAILED") return "Failed";
    return "Not attempted";
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
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
          <h2 className="text-xl font-bold">Decision pipeline</h2>
          <table className="mt-4 w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 px-3">Gate</th>
                <th className="text-left py-2 px-3">Result</th>
                <th className="text-left py-2 px-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Channel A — artifact</td>
                <td className="py-3 px-3">{getChannelMatchStatus(adjudicationsByChannel.get("artifact"), adjudicationsByChannel.get("payer_record"))}</td>
                <td className="py-3 px-3">
                  {adjudicationsByChannel.get("artifact") ? (
                    <div className="text-sm">
                      <div>Model: {adjudicationsByChannel.get("artifact")?.model}</div>
                      <div>x-request-id: {adjudicationsByChannel.get("artifact")?.requestId ?? "missing"}</div>
                      <div>Latency: {formatLatency(adjudicationsByChannel.get("artifact")?.latencyMs)}</div>
                    </div>
                  ) : (
                    "No adjudication recorded for this channel."
                  )}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Channel B — payer record</td>
                <td className="py-3 px-3">{getChannelMatchStatus(adjudicationsByChannel.get("payer_record"), adjudicationsByChannel.get("artifact"))}</td>
                <td className="py-3 px-3">
                  {adjudicationsByChannel.get("payer_record") ? (
                    <div className="text-sm">
                      <div>Model: {adjudicationsByChannel.get("payer_record")?.model}</div>
                      <div>x-request-id: {adjudicationsByChannel.get("payer_record")?.requestId ?? "missing"}</div>
                      <div>Latency: {formatLatency(adjudicationsByChannel.get("payer_record")?.latencyMs)}</div>
                    </div>
                  ) : (
                    "No adjudication recorded for this channel."
                  )}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Agreement</td>
                <td className="py-3 px-3">{getAgreementStatus(intent.decisionClass, intent.reasonCode)}</td>
                <td className="py-3 px-3">{disagreement || "—"}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Policy</td>
                <td className="py-3 px-3">{getPolicyStatus(intent.reasonCode)}</td>
                <td className="py-3 px-3">{getPolicyStatus(intent.reasonCode) === "Refused" ? explainDecision(intent.decisionClass, intent.reasonCode) : "—"}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Settlement</td>
                <td className="py-3 px-3">{getSettlementStatus(intent.decisionClass, intent.reasonCode)}</td>
                <td className="py-3 px-3">
                  {intent.explorerUrl ? (
                    <a href={intent.explorerUrl} className="text-primary underline-offset-4 hover:underline">
                      {intent.digest}
                    </a>
                  ) : (
                    "No settlement digest for this decision."
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
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