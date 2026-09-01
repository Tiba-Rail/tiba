import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { agentCard } from "@/lib/a2a";

export const runtime = "nodejs";

// A2A 1.0 §8.2: the Agent Card lives at /.well-known/agent-card.json.
export async function GET(request: NextRequest) {
  const body = JSON.stringify(agentCard(new URL(request.url).origin), null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      etag: `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`
    }
  });
}
