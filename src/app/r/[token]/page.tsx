import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";
import { auditView, channelTuple, modelLabel, onNebius, type ChannelTuple } from "@/lib/adjudication-display";
import { SiteNav } from "@/components/site-nav";
import { decisionSentence, disagreementLine, explainDecision } from "@/app/console/types";
import { recipientIdentityOk } from "@/lib/identity";
import { LiveRefresh } from "@/components/live-refresh";
import { chainName, chainOf } from "@/app/format";

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
  const auditRow = adjudicationsByChannel.get("auditor");
  const audit = auditView(auditRow?.tupleJson);

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
      "RECIPIENT_NOT_FOUND", "KILL_SWITCH", "RECIPIENT_UNVERIFIED", "RECIPIENT_NO_CHAIN_ADDRESS",
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
    if (
      reasonCode === "SETTLEMENT_FAILED" ||
      reasonCode === "SUI_EXECUTION_FAILED" ||
      reasonCode === "SOLANA_EXECUTION_FAILED"
    ) return "Tried and failed";
    // RECIPIENT_NO_CHAIN_ADDRESS is refused before any debit, so it falls through to "Not tried".
    return "Not tried";
  }

  // Old intents have no stored chain and settled on Sui.
  const network = `${chainName(chainOf(intent.chain))} test network`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <LiveRefresh ms={4000} />
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
          />
          <Fact
            label="Left to spend today (live)"
            value={remainingBudget(intent.agent.dayCapMicros, intent.agent.spentMicrosDay)}
            detail="right now, not at the time of this receipt"
          />
        </section>

        <section className="card p-5">
          <h2 className="title">How this decision was made</h2>
          <div className="mt-4 max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
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
                  <CheckDetail row={adjudicationsByChannel.get("artifact")} />
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Check 2 — read your own records</td>
                <td className="py-3 px-3">{getChannelMatchStatus(channelBTuple, channelATuple)}</td>
                <td className="py-3 px-3">
                  <CheckDetail row={adjudicationsByChannel.get("payer_record")} />
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Did both checks agree?</td>
                <td className="py-3 px-3">{getAgreementStatus(channelATuple, channelBTuple)}</td>
                <td className="py-3 px-3">{disagreement || "—"}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 px-3">Check 3 — web check on a new recipient</td>
                <td className="py-3 px-3">{audit ? (audit.verdict === "clear" ? "Clear" : "Held") : "Not run"}</td>
                <td className="py-3 px-3">
                  {auditRow && audit ? (
                    <div className="text-sm">
                      <div className="break-all">
                        Auditor: {modelLabel(auditRow.model)}, searching the web with Tavily ({audit.toolCalls}{" "}
                        {audit.toolCalls === 1 ? "search" : "searches"})
                      </div>
                      <ul className="mt-1 list-disc pl-5">
                        {audit.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                      {audit.sources.length > 0 ? (
                        <div className="mt-1">
                          Sources:{" "}
                          {audit.sources.map((source, index) => (
                            <span key={source.url}>
                              {index > 0 ? " · " : ""}
                              <a className="link break-all text-xs" href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                                {source.title}
                              </a>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div>
                        Reference (Nebius request ID):{" "}
                        {auditRow.requestId ? <span className="num break-all text-xs">{auditRow.requestId}</span> : "missing"}
                      </div>
                      <div>Took: <span className="num">{formatLatency(auditRow.latencyMs)}</span></div>
                    </div>
                  ) : (
                    "Runs only before Tiba's first payment to a recipient."
                  )}
                </td>
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
                    <a href={intent.explorerUrl} className="link num break-all text-xs" target="_blank" rel="noopener noreferrer">
                      {intent.digest} — view on the {network}
                    </a>
                  ) : (
                    "No transfer happened, so there is no transaction record."
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        {/* GNK pricing only applies to checks that ran on GonkaRouter. */}
        {intent.adjudications.some((row) => onNebius(row.model)) ? null : (
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
        )}

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

type CheckRow = { model: string; fallback: string | null; requestId: string | null; latencyMs: number };

function CheckDetail({ row }: { row?: CheckRow }) {
  if (!row) return <>This check was not run.</>;
  const nebius = onNebius(row.model);
  return (
    <div className="text-sm">
      <div className="break-all">Model used: {modelLabel(nebius && row.fallback ? row.fallback : row.model)}</div>
      {row.fallback ? (
        <div style={{ color: "var(--held)" }}>
          {nebius ? (
            <>
              Asked for <span className="num break-all text-xs">{row.model}</span>, which Nebius Token Factory did not serve,
              so this check ran on the model above.
            </>
          ) : (
            <>
              The reading service (Gonka) swapped in a different model for this reader:{" "}
              <span className="num break-all text-xs">{row.fallback}</span>
            </>
          )}
        </div>
      ) : null}
      <div>
        Reference ({nebius ? "Nebius request ID" : "Gonka request ID"}):{" "}
        {!row.requestId ? (
          "missing"
        ) : nebius ? (
          <span className="num inline-block max-w-full break-all text-xs">{row.requestId}</span>
        ) : (
          <a
            className="link num inline-block max-w-full break-all text-xs"
            href={`https://api.gonkarouter.io/v1/receipts/${row.requestId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {row.requestId}
          </a>
        )}
      </div>
      <div>Took: <span className="num">{formatLatency(row.latencyMs)}</span></div>
    </div>
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
