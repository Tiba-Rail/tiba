import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DenialBanner } from "@/components/denial-banner";
import { formatLatency, microsToUsdc } from "@/lib/money";
import { prisma } from "@/lib/db";
import { channelTuple, type ChannelTuple } from "@/lib/adjudication-display";
import { GROWTH_LINE, growthHref, receiptComparisonFromStored, receiptShareLines } from "@/lib/receipt-comparison";
import { BillRecordMismatch } from "@/components/bill-record-mismatch";
import { SiteNav } from "@/components/site-nav";
import { decisionSentence, disagreementLine, explainDecision } from "@/app/console/types";
import { recipientIdentityOk } from "@/lib/identity";
import { LiveRefresh } from "@/components/live-refresh";
import { coinSymbol, microsToCoin, receiptNetwork, receiptViewingKeyNote } from "@/lib/receipt-network";
import { receiptMakerSentences, receiptSameModelNote } from "@/lib/channel-makers";
import { limitsStatus } from "@/lib/receipt-status";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const intent = await prisma.payoutIntent.findUnique({
    where: { publicToken: token },
    include: { adjudications: true }
  });
  if (!intent) return { title: "Receipt - Tiba" };

  const share = receiptShareLines({
    decisionClass: intent.decisionClass,
    amount: microsToCoin(intent.amountMicros, intent.chain),
    chain: intent.chain,
    comparison: receiptComparisonFromStored({
      artifact: intent.adjudications.find((row) => row.channel === "artifact") ?? null,
      payerRecord: intent.adjudications.find((row) => row.channel === "payer_record") ?? null
    })
  });
  const title = `${share.outcome} · ${share.amount}`;
  const description = `${share.network}.${share.mismatch ? ` Mismatch: ${share.mismatch}.` : ""}`;

  return {
    title: "Receipt - Tiba",
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description }
  };
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

  const bountyClaim = await prisma.bountyClaim.findUnique({
    where: { payoutIntentId: intent.id },
    include: { bounty: true }
  });

  const adjudicationsByChannel = new Map(intent.adjudications.map((row) => [row.channel, row]));
  const paid = intent.decisionClass === "PAID";

  // Get channel tuples for disagreement line. A model can return a tuple with a blank
  // work_order_id -- a real read that just didn't find a number, not the same as no read at
  // all -- so a blank field is named rather than left empty ("saw invoice , 480.00").
  function withoutBlankFields(tuple: ChannelTuple, side: "bill" | "record"): ChannelTuple {
    if (!tuple) return tuple;
    const label = side === "bill" ? "not found on the bill" : "not found on the record";
    return {
      workOrderId: tuple.workOrderId.trim() || label,
      amount: tuple.amount.trim() || label
    };
  }
  const channelATuple = withoutBlankFields(channelTuple(adjudicationsByChannel.get("artifact")?.tupleJson), "bill");
  const channelBTuple = withoutBlankFields(channelTuple(adjudicationsByChannel.get("payer_record")?.tupleJson), "record");
  const disagreement = disagreementLine(intent.reasonCode, channelATuple, channelBTuple);
  const refusedComparison =
    intent.decisionClass === "RED"
      ? receiptComparisonFromStored({
          artifact: adjudicationsByChannel.get("artifact")
            ? { tupleJson: adjudicationsByChannel.get("artifact")?.tupleJson }
            : null,
          payerRecord: adjudicationsByChannel.get("payer_record")
            ? { tupleJson: adjudicationsByChannel.get("payer_record")?.tupleJson }
            : null
        })
      : null;

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
    if (reasonCode === "SETTLEMENT_PENDING") return "Pending";
    if (
      reasonCode === "SETTLEMENT_FAILED" ||
      reasonCode === "SOLANA_EXECUTION_FAILED" ||
      reasonCode === "TEMPO_EXECUTION_FAILED" ||
      reasonCode === "ZCASH_EXECUTION_FAILED"
    ) return "Tried and failed";
    return "Not tried";
  }

  const network = receiptNetwork(intent.chain);
  const artifactRow = adjudicationsByChannel.get("artifact");
  const payerRow = adjudicationsByChannel.get("payer_record");
  const makerSentences = receiptMakerSentences({
    artifactModel: artifactRow?.ok ? artifactRow.model : null,
    payerModel: payerRow?.ok ? payerRow.model : null
  });
  const sameModelNote = receiptSameModelNote(Boolean(artifactRow?.sameMaker || payerRow?.sameMaker));
  const limits = limitsStatus(intent.decisionClass, intent.reasonCode);

  // A refusal before the limits never stores the amount (it stays 0), so show what the
  // bill asked for when Check 1 read it, instead of a false 0.00.
  const unreadAmount = !paid && intent.amountMicros === 0n;
  const amountLabel = paid ? "Amount" : unreadAmount ? (channelATuple ? "Bill asked for" : "Amount") : "Amount asked for";
  const amountValue = unreadAmount
    ? (channelATuple ? channelATuple.amount.replace(/ USDC$/, "") : "Not read")
    : microsToUsdc(intent.amountMicros).replace(/ USDC$/, "");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <LiveRefresh ms={4000} />
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">
              {intent.chain === "zcash"
                ? "Receipt — anyone with the viewing key can check the payment"
                : "Receipt — anyone with this link can read it"}
            </p>
            <h1 className="display-l mt-2">
              {decisionSentence(intent.decisionClass)}
            </h1>
            {paid ? <p className="mt-2 text-sm text-muted">Paid on {network}.</p> : null}
          </div>
          <div className="card p-4 md:min-w-72">
            <p className="text-sm text-muted">{amountLabel}</p>
            <p className="num mt-1 text-2xl">
              {amountValue}
              {amountValue !== "Not read" ? (
                <>
                  {" "}
                  <span className="text-sm text-muted">{coinSymbol(intent.chain)}</span>
                </>
              ) : null}
            </p>
          </div>
        </header>

        {refusedComparison ? <BillRecordMismatch comparison={refusedComparison} /> : null}

        <DenialBanner decisionClass={intent.decisionClass} reasonCode={intent.reasonCode} />

        {bountyClaim ? (
          <section className="card p-5">
            <p className="title text-muted">Bounty</p>
            <p className="mt-2 text-xl font-semibold">{bountyClaim.bounty.title}</p>
            <p className="mt-1 text-sm text-muted">
              Asked: <span className="num">{microsToCoin(bountyClaim.amountAskedMicros, intent.chain)}</span>
            </p>
            <p className="mt-1 text-sm text-muted">Claimed: {bountyClaim.summary}</p>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <Fact
            label={paid ? "Paid to" : "To"}
            value={intent.recipient.displayName}
            detail={`ID ${intent.recipient.ref}`}
          />
          <Fact
            label="Why"
            value={explainDecision(intent.decisionClass, intent.reasonCode, intent.chain)}
          />
        </section>

        <section className="card p-5">
          <h2 className="title">How this decision was made</h2>
          {makerSentences ? <p className="mt-4 text-sm">{makerSentences}</p> : null}
          {sameModelNote ? <p className="mt-2 text-sm">{sameModelNote}</p> : null}
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
                  {adjudicationsByChannel.get("artifact") ? (
                    <div className="text-sm">
                      <div className="break-all">Model used: {adjudicationsByChannel.get("artifact")?.model}</div>
                      {adjudicationsByChannel.get("artifact")?.fallback ? (
                        <div style={{ color: "var(--held)" }}>
                          The reading service swapped in a different model for this reader:{" "}
                          <span className="num break-all text-xs">{adjudicationsByChannel.get("artifact")?.fallback}</span>
                        </div>
                      ) : null}
                      <div>
                        Reference (request ID):{" "}
                        <span className="num break-all text-xs">
                          {adjudicationsByChannel.get("artifact")?.requestId ?? "missing"}
                        </span>
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
                      <div className="break-all">Model used: {adjudicationsByChannel.get("payer_record")?.model}</div>
                      {adjudicationsByChannel.get("payer_record")?.fallback ? (
                        <div style={{ color: "var(--held)" }}>
                          The reading service swapped in a different model for this reader:{" "}
                          <span className="num break-all text-xs">{adjudicationsByChannel.get("payer_record")?.fallback}</span>
                        </div>
                      ) : null}
                      <div>
                        Reference (request ID):{" "}
                        <span className="num break-all text-xs">
                          {adjudicationsByChannel.get("payer_record")?.requestId ?? "missing"}
                        </span>
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
                <td className="py-3 px-3">{limits}</td>
                <td className="py-3 px-3">{limits === "Blocked" ? explainDecision(intent.decisionClass, intent.reasonCode) : "—"}</td>
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
                  {receiptViewingKeyNote(intent.chain) ? (
                    <div>{receiptViewingKeyNote(intent.chain)}</div>
                  ) : null}
                </td>
              </tr>
              {intent.x402Routed ? (
                <tr className="border-b border-line">
                  <td className="py-3 px-3">How it was sent</td>
                  <td className="py-3 px-3">x402</td>
                  <td className="py-3 px-3">This payment went out through x402, after Tiba's checks.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>

        <p className="text-sm">
          <Link className="link" href={growthHref(intent.publicToken)}>
            {GROWTH_LINE}
          </Link>
        </p>

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
