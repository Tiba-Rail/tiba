import { NextRequest, NextResponse } from "next/server";
import { isOperatorRequest } from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // 1. Authorise with the operator token
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  
  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  
  const { artifact, recipient_ref } = body;
  
  if (typeof artifact !== "string" || !artifact.trim() || 
      typeof recipient_ref !== "string" || !recipient_ref.trim()) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  
  // 3. Generate idempotency key
  const idempotencyKey = `console-${crypto.randomUUID()}`;
  
  // 4. Forward to the existing pipeline
  const origin = new URL(request.url).origin;
  const agentKey = process.env.SEED_AGENT_KEY ?? "tiba_testnet_demo_key";
  
  try {
    const response = await fetch(`${origin}/api/v1/intents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${agentKey}`
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        artifact,
        recipient_ref
      })
    });
    
    const responseData = await response.json();
    
    // 5. Return the upstream JSON and the upstream status code
    return new NextResponse(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "UPSTREAM_ERROR" }, { status: 500 });
  }
}