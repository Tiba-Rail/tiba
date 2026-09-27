import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";

export const runtime = "nodejs";
export const alt = "Tiba bounty";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bounty = await prisma.bounty.findUnique({ where: { shareCode: code } });

  const title = bounty?.title ?? "Bounty not found";
  const amount = bounty ? microsToUsdc(bounty.amountMicros) : "";
  const criteria = bounty?.doneCriteria ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          backgroundColor: "#0B0F0E",
          color: "#F5F7F6",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#8FE3C0", textTransform: "uppercase" }}>
          Tiba · Bounty
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>
            {title}
          </div>
          {criteria && (
            <div style={{ display: "flex", fontSize: 28, color: "#B7C2BE", maxWidth: 980 }}>
              {criteria.length > 140 ? `${criteria.slice(0, 140)}…` : criteria}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#8FE3C0" }}>
          {amount}
        </div>
      </div>
    ),
    { ...size }
  );
}
