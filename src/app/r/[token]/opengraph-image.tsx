import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { receiptComparisonFromStored, receiptShareLines } from "@/lib/receipt-comparison";
import { microsToCoin, receiptNetwork } from "@/lib/receipt-network";

export const alt = "Tiba receipt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paid = "#1F6B4A";
const refused = "#7A2E2E";
const held = "#8A5E12";
const ink = "#14161A";
const muted = "#6A7078";
const paper = "#FBFAF7";
const action = "#2D4FC7";

function outcomeColor(outcome: string): string {
  if (outcome === "PAID") return paid;
  if (outcome === "REFUSED") return refused;
  if (outcome === "NEEDS APPROVAL") return held;
  return ink;
}

function card(lines: { outcome: string; amount: string; network: string; mismatch: string | null }) {
  const color = outcomeColor(lines.outcome);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: paper, color: ink }}>
      <div style={{ width: 18, background: color }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px" }}>
        <div style={{ fontSize: 22, letterSpacing: 4, color: action }}>TIBA</div>
        <div style={{ fontSize: 84, marginTop: 18, color }}>{lines.outcome}</div>
        {lines.amount ? <div style={{ fontSize: 46, marginTop: 12 }}>{lines.amount}</div> : null}
        <div style={{ fontSize: 28, marginTop: 16, color: muted }}>{lines.network}</div>
        {lines.mismatch ? (
          <div style={{ display: "flex", marginTop: 28 }}>
            <div style={{ background: "#F2E4E4", color: refused, fontSize: 28, padding: "12px 18px" }}>
              {`Mismatch: ${lines.mismatch}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intent = await prisma.payoutIntent.findUnique({
    where: { publicToken: token },
    include: { adjudications: true }
  });

  if (!intent) {
    return new ImageResponse(
      card({ outcome: "Receipt not found", amount: "", network: "Test network", mismatch: null }),
      { ...size }
    );
  }

  const artifact = intent.adjudications.find((row) => row.channel === "artifact") ?? null;
  const payerRecord = intent.adjudications.find((row) => row.channel === "payer_record") ?? null;
  const share = receiptShareLines({
    decisionClass: intent.decisionClass,
    amount: microsToCoin(intent.amountMicros, intent.chain),
    chain: intent.chain,
    comparison: receiptComparisonFromStored({
      artifact: artifact ? { tupleJson: artifact.tupleJson } : null,
      payerRecord: payerRecord ? { tupleJson: payerRecord.tupleJson } : null
    })
  });

  return new ImageResponse(card({ ...share, network: receiptNetwork(intent.chain) }), { ...size });
}
