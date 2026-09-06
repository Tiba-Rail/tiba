import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

// Telegram delivers updates here. It retries anything it does not get a prompt 200 for, and a
// payment takes far longer than that, so acknowledge first and do the work in after().
export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let update: { message?: { chat?: { id?: number | string }; text?: string } };
  try {
    update = (await request.json()) as typeof update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (chatId === undefined || !text) return NextResponse.json({ ok: true });

  after(async () => {
    try {
      await handleTelegramMessage(String(chatId), text);
    } catch (error) {
      console.error("telegram agent failed", error);
    }
  });

  return NextResponse.json({ ok: true });
}
