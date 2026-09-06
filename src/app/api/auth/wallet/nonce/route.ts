import { NextRequest, NextResponse } from "next/server";
import { createWalletChallenge, WALLET_NONCE_COOKIE } from "@/lib/wallet-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address : "";
  const challenge = createWalletChallenge(address);
  if (!challenge) {
    return NextResponse.json({ error: "AUTH_SECRET_REQUIRED_OR_INVALID_ADDRESS" }, { status: 400 });
  }

  const response = NextResponse.json({
    address: challenge.address,
    nonce: challenge.nonce,
    message: challenge.message,
    expires_at: new Date(challenge.expiresAt).toISOString()
  });
  response.cookies.set(WALLET_NONCE_COOKIE, challenge.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: challenge.maxAge,
    path: "/"
  });
  return response;
}
