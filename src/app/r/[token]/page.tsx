import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";
import { channelTuple, type ChannelTuple } from "@/lib/adjudication-display";
import { SiteNav } from "@/components/site-nav";
import { decisionSentence, disagreementLine, explainDecision } from "@/app/console/types";
import { recipientIdentityOk } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt - Tiba" };

function formatTime(date: Date | null): string {
  if (!date) return "time unknown";
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
  const paid = intent.decisionClass === "PAID";

  // Get channel tuples for disagreement line
  const channelATuple = channelTuple(adjudicationsByChannel.get("artifact")?.tupleJson);
  const channelBTuple = channelTuple(adjudicationsByChannel.get("payer_record")?.tupleJson);
  const disagreement = disagreementLine(intent.reasonCode, channelATuple, channelBTuple);

  // Determine channel match status
  function getChannelMatchStatus(tupleA: ChannelTuple, tupleB: ChannelTuple): string {
    if (!tupleA || !tupleB) return "Not run";
    if (tupleA.workOrderId === tupleB.workOrderId && tupleA.amount === tupleB.amount) return "Same answer";
    return "Different answer";
  }

  // Determine agreement status -- must mirror the channel-level comparison above it,
  // not guess from the reason code (a kill-switch/policy refusal can still show a real
  // channel mismatch underneath it, and the two rows must not contradict each other).
  function getAgreementStatus(tupleA: ChannelTuple, tupleB: ChannelTuple): string {
    if (!tupleA || !tupleB) return "Not run";
    if (tupleA.workOrderId === tupleB.workOrderId && tupleA.amount === tupleB.amount) return "Yes";
    return "No";
  }

  // Determine policy status
  function getPolicyStatus(reasonCode: string | null): string {
    const policyRefusalCodes = [
      "DAY_AMOUNT_CAP", "DAY_COUNT_CAP", "HOUR_AMOUNT_CAP", "HOUR_COUNT_CAP",
      "TRANSACTION_CEILING", "WORK_ORDER_CEILING", "WORK_ORDER_EXPIRED",
      "WORK_ORDER_NOT_OPEN", "NO_OPEN_OBLIGATION", "RECIPIENT_INACTIVE",
      "RECIPIENT_NOT_FOUND", "KILL_SWITCH", "RECIPIENT_UNVERIFIED",
      "INVALID_AMOUNT", "INVALID_TIMESTAMP"
    ];

    if (policyRefusalCodes.includes(reasonCode || "")) return "Blocked";
    return "Passed";
  }

  // Identity gate is per agent (default off) and sits before inference. No per-intent
  // snapshot is stored, so "Passed" is derived from the recipient's stored verdict at the
  // intent's creation time, never from the flag alone. An intent refused before the gate
  // (no adjudications, not RECIPIENT_UNVERIFIED) was never evaluated.
  const identityStatus = !intent.agent.requireRecipientKyc
    ? "Not required"
    : intent.reasonCode === "RECIPIENT_UNVERIFIED"
      ? "Blocked"
      : intent.adjudications.length === 0
        ? "Never reached"
        : recipientIdentityOk(intent.recipient, intent.createdAt)
          ? "Passed"
          : "Not checked";

  // Recipient KYC state is only shown when the agent actually enforces it.
  const identityDetail = !intent.agent.requireRecipientKyc
    ? "—"
    : intent.recipient.kycProvider
      ? `Identity ${intent.recipient.kycStatus}, checked by ${intent.recipient.kycProvider}`
      : `Identity ${intent.recipient.kycStatus}`;

  // Determine settlement status
  function getSettlementStatus(decisionClass: string, reasonCode: string | null): string {
    if (decisionClass === "PAID") return "Yes";
    if (reasonCode === "SETTLEMENT_FAILED" || reasonCode === "SUI_EXECUTION_FAILED") return "Tried and failed";
    return "Not tried";
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Receipt — anyone with this link can read it</p>
            <h1 className="display-l mt-2">
              {decisionSentence(intent.decisionClass)}
            </h1>
          </div>
          <div className="card p-4 md:min-w-72">
            <p className="text-sm text-muted">{paid ? "Amount" : "Amount asked for"}</p>
            <p className="num mt-1 text-2xl">
              {microsToUsdc(intent.amountMicros).replace(/ USDC$/, "")}{" "}
              <span className="text-sm text-muted">USDC</span>
            </p>
          </div>
        </header>

        <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />

        <section className="grid gap-4 md:grid-cols-3">
          <Fact
            label={paid ? "Paid to" : "To"}
            value={intent.recipient.displayName}
            detail={`ID ${intent.recipient.ref}`}
          />
          <Fact
            label="Why"
            value={explainDecision(intent.decisionClass, intent.reasonCode)}
            detail={paid ? undefined : `Reason code ${intent.reasonCode ?? "none recorded"}`}
          />
          <Fact
            label="Left to spend today (live)"
            value={remainingBudget(intent.agent.dayCapMicros, intent.agent.spentMicrosDay)}
            detail="right now, not at the time of this receipt"
          />
        </section>

        <section className="card p-5">
          <h2 className="title">How this decision was made</h2>
          <table className="mt-4 w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 px-3">Step</th>
                <th className="text-left py-2 px-3">Result</th>
                <th className="text-left py-2 px-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Check 1 — read the delivery note</td>
                <td className="py-3 px-3">{getChannelMatchStatus(channelATuple, channelBTuple)}</td>
                <td className="py-3 px-3">
                  {adjudicationsByChannel.get("artifact") ? (
                    <div className="text-sm">
                      <div>Model used: {adjudicationsByChannel.get("artifact")?.model}</div>
                      {adjudicationsByChannel.get("artifact")?.fallback ? (
                        <div style={{ color: "var(--held)" }}>
                          The reading service (Gonka) swapped in a different model for this reader:{" "}
                          <span className="num text-xs">{adjudicationsByChannel.get("artifact")?.fallback}</span>
                        </div>
                      ) : null}
                      <div>
                        Reference (Gonka request ID):{" "}
                        {adjudicationsByChannel.get("artifact")?.requestId ? (
                          <a
                            className="link num text-xs"
                            href={`https://api.gonkarouter.io/v1/receipts/${adjudicationsByChannel.get("artifact")?.requestId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {adjudicationsByChannel.get("artifact")?.requestId}
                          </a>
                        ) : (
                          "missing"
                        )}
                      </div>
                      <div>Took: <span className="num">{formatLatency(adjudicationsByChannel.get("artifact")?.latencyMs)}</span></div>
                    </div>
                  ) : (
                    "This check was not run."
                  )}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Check 2 — read your own records</td>
                <td className="py-3 px-3">{getChannelMatchStatus(channelBTuple, channelATuple)}</td>
                <td className="py-3 px-3">
                  {adjudicationsByChannel.get("payer_record") ? (
                    <div className="text-sm">
                      <div>Model used: {adjudicationsByChannel.get("payer_record")?.model}</div>
                      {adjudicationsByChannel.get("payer_record")?.fallback ? (
                        <div style={{ color: "var(--held)" }}>
                          The reading service (Gonka) swapped in a different model for this reader:{" "}
                          <span className="num text-xs">{adjudicationsByChannel.get("payer_record")?.fallback}</span>
                        </div>
                      ) : null}
                      <div>
                        Reference (Gonka request ID):{" "}
                        {adjudicationsByChannel.get("payer_record")?.requestId ? (
                          <a
                            className="link num text-xs"
                            href={`https://api.gonkarouter.io/v1/receipts/${adjudicationsByChannel.get("payer_record")?.requestId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {adjudicationsByChannel.get("payer_record")?.requestId}
                          </a>
                        ) : (
                          "missing"
                        )}
                      </div>
                      <div>Took: <span className="num">{formatLatency(adjudicationsByChannel.get("payer_record")?.latencyMs)}</span></div>
                    </div>
                  ) : (
                    "This check was not run."
                  )}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Did both checks agree?</td>
                <td className="py-3 px-3">{getAgreementStatus(channelATuple, channelBTuple)}</td>
                <td className="py-3 px-3">{disagreement || "—"}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Your limits</td>
                <td className="py-3 px-3">{getPolicyStatus(intent.reasonCode)}</td>
                <td className="py-3 px-3">{getPolicyStatus(intent.reasonCode) === "Blocked" ? explainDecision(intent.decisionClass, intent.reasonCode) : "—"}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Identity check</td>
                <td className="py-3 px-3">{identityStatus}</td>
                <td className="py-3 px-3">{identityDetail}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Payment</td>
                <td className="py-3 px-3">{getSettlementStatus(intent.decisionClass, intent.reasonCode)}</td>
                <td className="py-3 px-3">
                  {intent.explorerUrl ? (
                    <a href={intent.explorerUrl} className="link num break-all text-xs">
                      {intent.digest} — view on Sui test network
                    </a>
                  ) : (
                    "No transfer happened, so there is no transaction record."
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="title">Verification cost (GNK/USD)</h2>
            {intent.gnkUsd ? (
              <p className="num mt-3 text-2xl">
                ${intent.gnkUsd}
                <span className="ml-2 align-middle text-sm font-medium text-muted">
                  at {formatTime(intent.pricingUpdatedAt)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">price not available</p>
            )}
          </div>
        </section>

        <Link
          className="btn btn-ghost w-fit"
          href="/ledger"
        >
          See all activity →
        </Link>
      </div>
    </main>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card p-5">
      <p className="title text-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold">{value}</p>
      {detail ? <p className="num mt-1 break-words text-xs text-muted">{detail}</p> : null}
    </div>
  );
}
