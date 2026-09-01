import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { A2A_VERSION, payloadFromParts, taskFromIntent, type Message, type UpstreamIntent } from "@/lib/a2a";

export const runtime = "nodejs";

// A2A 1.0 JSON-RPC binding over the existing pipeline. Every call is forwarded to
// /api/v1/intents with the caller's Authorization header untouched, so the bearer is a
// Tiba agent API key and verification/policy run exactly as they do for the REST API.

type RpcId = string | number | null;
type ErrorInfo = { reason: string; metadata?: Record<string, string> };
type RpcInit = { status?: number; headers?: Record<string, string> };

function envelope(id: RpcId, body: Record<string, unknown>, init: RpcInit = {}) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, ...body },
    { status: init.status ?? 200, headers: { "A2A-Version": A2A_VERSION, ...init.headers } }
  );
}

function error(id: RpcId, code: number, message: string, info?: ErrorInfo, init?: RpcInit) {
  const data = info
    ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", domain: "a2a-protocol.org", ...info }]
    : undefined;
  return envelope(id, { error: { code, message, ...(data ? { data } : {}) } }, init);
}

async function upstream(origin: string, path: string, authorization: string, init?: RequestInit) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization, ...(init?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep raw text */ }
  return { status: response.status, body };
}

function upstreamError(id: RpcId, result: { status: number; body: unknown }) {
  const info: ErrorInfo = {
    reason: `UPSTREAM_${result.status}`,
    metadata: { status: String(result.status), body: typeof result.body === "string" ? result.body : JSON.stringify(result.body) }
  };
  if (result.status === 400) return error(id, -32602, "Invalid parameters", info);
  if (result.status === 401 || result.status === 403) {
    // A2A §3.3.2: auth failures are HTTP 401/403 (client SDKs key off the status), with a
    // custom JSON-RPC code; -32000 is the first implementation-defined code A2A leaves free.
    const unauthenticated = result.status === 401;
    return error(id, -32000, unauthenticated ? "Unauthorized" : "Forbidden", info, {
      status: result.status,
      headers: unauthenticated ? { "www-authenticate": "Bearer" } : undefined
    });
  }
  return error(id, -32603, "Internal error", info);
}

const UNSUPPORTED = new Set([
  "SendStreamingMessage", "SubscribeToTask", "CancelTask", "ListTasks", "GetExtendedAgentCard",
  "message/stream", "tasks/resubscribe", "tasks/cancel", "agent/getAuthenticatedExtendedCard"
]);
const PUSH = new Set([
  "CreateTaskPushNotificationConfig", "GetTaskPushNotificationConfig",
  "ListTaskPushNotificationConfigs", "DeleteTaskPushNotificationConfig",
  "tasks/pushNotificationConfig/set", "tasks/pushNotificationConfig/get",
  "tasks/pushNotificationConfig/list", "tasks/pushNotificationConfig/delete"
]);

export async function POST(request: NextRequest) {
  // ponytail: only 1.0 is spoken; an explicit other version is refused, a missing header
  // is accepted (spec says treat as 0.3 — add a 0.3 shape layer if a real 0.3 client shows up).
  const version = request.headers.get("a2a-version");
  if (version && version !== A2A_VERSION) return error(null, -32009, `Unsupported A2A version ${version}`);

  let rpc: { jsonrpc?: unknown; id?: RpcId; method?: unknown; params?: Record<string, unknown> };
  try {
    rpc = await request.json();
  } catch {
    return error(null, -32700, "Invalid JSON payload");
  }
  if (!rpc || typeof rpc !== "object") return error(null, -32600, "Request payload validation error");
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return error(id, -32600, "Request payload validation error");
  const params = rpc.params ?? {};
  const origin = new URL(request.url).origin;
  const authorization = request.headers.get("authorization") ?? "";

  switch (rpc.method) {
    case "SendMessage":
    case "message/send": {
      const message = params.message as Message | undefined;
      if (!message || typeof message !== "object" || !Array.isArray(message.parts)) {
        return error(id, -32602, "Invalid parameters", { reason: "MESSAGE_REQUIRED" });
      }
      if (typeof message.taskId === "string" && message.taskId) {
        // Tiba tasks resolve in one SendMessage; a follow-up message cannot continue one.
        const existing = await upstream(origin, `/api/v1/intents/${encodeURIComponent(message.taskId)}`, authorization);
        if (existing.status === 404) return error(id, -32001, "Task not found", { reason: "TASK_NOT_FOUND" });
        if (existing.status !== 200) return upstreamError(id, existing);
        return error(id, -32004, "Task already resolved; send a new message without taskId", { reason: "TASK_TERMINAL" });
      }
      const payload = payloadFromParts(message.parts);
      if (!payload) {
        return error(id, -32602, "Invalid parameters", {
          reason: "PAYLOAD_REQUIRED",
          metadata: { expected: "a DataPart (or JSON TextPart) with string fields recipient_ref and artifact" }
        });
      }
      const idempotencyKey = typeof message.messageId === "string" && message.messageId ? message.messageId : `a2a-${randomUUID()}`;
      const result = await upstream(origin, "/api/v1/intents", authorization, {
        method: "POST",
        body: JSON.stringify({ idempotency_key: idempotencyKey, ...payload })
      });
      if (result.status !== 200) return upstreamError(id, result);
      return envelope(id, { result: { task: taskFromIntent(result.body as UpstreamIntent, origin, message) } });
    }

    case "GetTask":
    case "tasks/get": {
      const taskId = params.id;
      if (typeof taskId !== "string" || !taskId) return error(id, -32602, "Invalid parameters", { reason: "ID_REQUIRED" });
      const result = await upstream(origin, `/api/v1/intents/${encodeURIComponent(taskId)}`, authorization);
      if (result.status === 404) return error(id, -32001, "Task not found", { reason: "TASK_NOT_FOUND" });
      if (result.status !== 200) return upstreamError(id, result);
      return envelope(id, { result: taskFromIntent(result.body as UpstreamIntent, origin) });
    }

    default:
      if (PUSH.has(rpc.method)) return error(id, -32003, "Push notifications are not supported");
      if (UNSUPPORTED.has(rpc.method)) return error(id, -32004, "This operation is not supported");
      return error(id, -32601, "Method not found");
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
