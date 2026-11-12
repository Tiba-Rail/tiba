import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { isDatabaseError, prisma } from "@/lib/db";
import { amountAskedMicros } from "@/lib/asked-amount";
import {
  buildRefusalWall,
  isSimulatedSettlement,
  type RefusalWall,
  type RefusalWallTotals
} from "@/lib/refusal-wall";
import { SANDBOX_AGENT_ID } from "@/lib/fool-it-sample";
import { EXAMPLE_PAID_INTENT_ID } from "@/lib/public-demo";

// Columns the receipt page already uses for a public link. No agent, recipient
// address, payer record, delivery note, or key material is selected.
const PUBLIC_RECEIPT_SELECT = {
  publicToken: true,
  decisionClass: true,
  reasonCode: true,
  amountMicros: true,
  chain: true,
  createdAt: true,
  adjudications: {
    select: {
      channel: true,
      tupleJson: true
    }
  }
} as const;

const WALL_SCOPE: Prisma.PayoutIntentWhereInput = {
  AND: [
    { agentId: { not: SANDBOX_AGENT_ID } },
    { agent: { intents: { some: { id: EXAMPLE_PAID_INTENT_ID } } } }
  ]
};

const EMPTY_WALL: RefusalWall = {
  checksRun: 0,
  paid: 0,
  simulatedPaid: 0,
  refused: 0,
  refusedWithAmount: 0,
  refusedAmount: null,
  rows: []
};

async function loadRefusalWall(): Promise<RefusalWall> {
  try {
  const [intents, groupedCounts, refusedForAmount] = await Promise.all([
    prisma.payoutIntent.findMany({
      where: WALL_SCOPE,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: PUBLIC_RECEIPT_SELECT
    }),
    prisma.payoutIntent.groupBy({
      by: ["decisionClass", "chain"],
      where: WALL_SCOPE,
      _count: { _all: true }
    }),
    // Stored amountMicros is 0 on a refusal that never reached a debit. The amount
    // asked for is on the bill (Check 1), so the total has to read that reading.
    prisma.payoutIntent.findMany({
      where: { AND: [WALL_SCOPE, { decisionClass: "RED" }] },
      select: {
        amountMicros: true,
        adjudications: {
          where: { channel: "artifact" },
          select: { channel: true, tupleJson: true }
        }
      }
    })
  ]);

  let refusedWithAmount = 0;
  let refusedAmountMicros = 0n;
  for (const intent of refusedForAmount) {
    const asked = amountAskedMicros(intent.amountMicros, intent.adjudications);
    if (asked !== null && asked > 0n) {
      refusedWithAmount += 1;
      refusedAmountMicros += asked;
    }
  }

  const totals: RefusalWallTotals = {
    checksRun: groupedCounts.reduce((sum, row) => sum + row._count._all, 0),
    paid: groupedCounts
      .filter((row) => row.decisionClass === "PAID" && !isSimulatedSettlement(row.chain))
      .reduce((sum, row) => sum + row._count._all, 0),
    simulatedPaid: groupedCounts
      .filter((row) => row.decisionClass === "PAID" && isSimulatedSettlement(row.chain))
      .reduce((sum, row) => sum + row._count._all, 0),
    refused: groupedCounts
      .filter((row) => row.decisionClass === "RED")
      .reduce((sum, row) => sum + row._count._all, 0),
    refusedWithAmount,
    refusedAmountMicros: refusedWithAmount > 0 ? refusedAmountMicros : null
  };

  return buildRefusalWall(
    intents.map((intent) => ({
      publicToken: intent.publicToken,
      decisionClass: intent.decisionClass,
      reasonCode: intent.reasonCode,
      amountMicros: intent.amountMicros.toString(),
      chain: intent.chain,
      createdAt: intent.createdAt.toISOString(),
      adjudications: intent.adjudications.map((row) => ({
        channel: row.channel,
        tupleJson: row.tupleJson
      }))
    })),
    totals
  );
  } catch (err) {
    if (!isDatabaseError(err)) throw err;
    console.error("[tiba] refusal wall database lookup failed:", err instanceof Error ? err.message : err);
    return EMPTY_WALL;
  }
}

// Server-rendered page data, reused for 60 seconds. The page itself sets the same window.
export const getRefusalWall = unstable_cache(loadRefusalWall, ["public-refusal-wall"], {
  revalidate: 60
});
