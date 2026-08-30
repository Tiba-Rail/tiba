import { NextRequest, NextResponse } from "next/server";
import { isOperatorRequest } from "@/lib/operator-auth";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // 1. Authorise with the operator token
  if (!isOperatorRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // 2. Fetch the 20 most recent payout intents
    const payoutIntents = await prisma.payoutIntent.findMany({
      include: {
        recipient: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    // 3. Transform the data to match the expected format
    const intents = payoutIntents.map(intent => {
      // Map decisionClass to decision string
      let decision: string;
      switch (intent.decisionClass) {
        case "RED":
          decision = "REFUSED";
          break;
        case "AMBER":
          decision = "HELD";
          break;
        case "PAID":
          decision = "PAID";
          break;
        default:
          decision = "UNKNOWN";
      }

      return {
        id: intent.id,
        created_at: intent.createdAt,
        recipient_ref: intent.recipient.ref,
        recipient_name: intent.recipient.displayName,
        amount_usdc: microsToUsdc(intent.amountMicros),
        decision,
        reason_code: intent.reasonCode,
        digest: intent.digest,
        explorer_url: intent.explorerUrl,
        receipt_url: `/r/${intent.publicToken}`
      };
    });

    // 4. Return the formatted data
    return NextResponse.json({ intents });
  } catch (error) {
    console.error("Error fetching ledger data:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}