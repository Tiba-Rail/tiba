import { NextRequest, NextResponse } from "next/server";
import { agentForOwnerKey, setOwnerCookie } from "@/lib/operator-auth";

export const runtime = "nodejs";

// Unlocks the workspace pages (/app, /console, /ledger, ...) in this browser for the owner of a
// wallet. The cookie holds only the owner key's hash: it opens the pages, not the owner APIs.
export async function POST(request: NextRequest) {
  let body: { owner_key?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const ownerKey = typeof body.owner_key === "string" ? body.owner_key.trim() : "";
  const agent = ownerKey ? await agentForOwnerKey(ownerKey) : null;
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const response = NextResponse.json({ workspace_id: agent.id, name: agent.name });
  setOwnerCookie(response, ownerKey);
  return response;
}
