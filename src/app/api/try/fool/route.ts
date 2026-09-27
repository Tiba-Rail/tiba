import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { foolItResponseBody, foolItStatus, runFoolItAttempt } from "@/lib/fool-it";
import { readSandboxChannels } from "@/lib/fool-it-read";
import { saveSandboxRefusal } from "@/lib/fool-it-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { work_order_id?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { outcome: "invalid", message: "The bill could not be read. Nothing was sent.", money_sent: false, paid: false },
      { status: 400 }
    );
  }

  try {
    const result = await runFoolItAttempt({
      visitorId: clientIp(request.headers),
      workOrderId: body.work_order_id,
      amount: body.amount,
      readChannels: (input) => readSandboxChannels(input),
      persistRefusal: saveSandboxRefusal
    });
    return NextResponse.json(foolItResponseBody(result), { status: foolItStatus(result) });
  } catch (error) {
    console.error("[try/fool] check failed:", error);
    return NextResponse.json(
      { outcome: "unavailable", message: "The check could not be finished. Nothing was sent.", money_sent: false, paid: false },
      { status: 500 }
    );
  }
}
