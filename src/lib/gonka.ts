import { createHash } from "node:crypto";

const API_URL = "https://api.gonkarouter.io/v1/chat/completions";
const TIMEOUT_MS = 60_000;
const PRIMARY: Record<GonkaChannel, string> = {
  artifact: "moonshotai/Kimi-K2.6",
  payer_record: "deepseek-ai/DeepSeek-V4-Flash-0731"
};
const FAILOVER: Record<GonkaChannel, string> = {
  artifact: "deepseek-ai/DeepSeek-V4-Flash-0731",
  payer_record: "moonshotai/Kimi-K2.6"
};

export type GonkaChannel = "artifact" | "payer_record";
export type JsonSchema = { name: string; strict: boolean; schema: object };
export interface GonkaMessage { role: "system" | "user"; content: string }
export interface GonkaResult {
  ok: boolean;
  model: string;
  requestId?: string;
  content?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  errorCode?: "SCHEMA_INVALID" | "INFERENCE_UNAVAILABLE" | "REQUEST_REJECTED";
}

export const health: Record<string, { ok: boolean; latencyMs: number; at: string }> = {};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

function isJsonForSchema(content: string, schema: JsonSchema): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const obj = parsed as Record<string, unknown>;
    const shape = schema.schema as {
      required?: unknown;
      properties?: Record<string, { type?: string; pattern?: string }>;
    };
    const required = shape.required;
    if (!Array.isArray(required) || required.some((key) => typeof key !== "string" || !(key in obj))) return false;
    const properties = shape.properties ?? {};
    if (schema.strict && Object.keys(obj).some((key) => !(key in properties))) return false;
    for (const [key, property] of Object.entries(properties)) {
      if (!(key in obj)) continue;
      if (property.type === "string" && typeof obj[key] !== "string") return false;
      if (property.pattern && typeof obj[key] === "string" && !new RegExp(property.pattern).test(obj[key])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface Attempt {
  result?: GonkaResult;
  status?: number;
  schemaInvalid?: boolean;
}

async function requestOnce(
  model: string,
  messages: GonkaMessage[],
  schema: JsonSchema,
  fetcher: typeof fetch,
  apiKey: string
): Promise<Attempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetcher(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 256,
        response_format: { type: "json_schema", json_schema: schema }
      })
    });
    const latencyMs = Date.now() - started;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) return { status: response.status, result: { ok: false, model, requestId, latencyMs, errorCode: "REQUEST_REJECTED" } };
    const body: unknown = await response.json();
    const content = parseContent(body);
    const usage = body as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const valid = content !== null && isJsonForSchema(content, schema);
    const result: GonkaResult = valid
      ? { ok: true, model, requestId, content, latencyMs, inputTokens: usage.usage?.prompt_tokens, outputTokens: usage.usage?.completion_tokens }
      : { ok: false, model, requestId, content: content ?? undefined, latencyMs, errorCode: "SCHEMA_INVALID" };
    health[model] = { ok: valid, latencyMs, at: new Date().toISOString() };
    return { result, schemaInvalid: !valid };
  } catch {
    const latencyMs = Date.now() - started;
    health[model] = { ok: false, latencyMs, at: new Date().toISOString() };
    return { result: { ok: false, model, latencyMs, errorCode: "INFERENCE_UNAVAILABLE" } };
  } finally {
    clearTimeout(timeout);
  }
}

export interface GonkaRequest {
  channel: GonkaChannel;
  messages: GonkaMessage[];
  schema: JsonSchema;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Retry policy is intentionally narrow: one schema repair, one retry for a
 * transient 429 on the same model, failover for other host failures, and
 * 400/401 stop.
 */
export async function runGonka(request: GonkaRequest): Promise<GonkaResult> {
  const apiKey = process.env.GONKA_API_KEY;
  const model = PRIMARY[request.channel];
  if (!apiKey) return { ok: false, model, latencyMs: 0, errorCode: "INFERENCE_UNAVAILABLE" };
  const fetcher = request.fetcher ?? fetch;
  const sleep = request.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const first = await requestOnce(model, request.messages, request.schema, fetcher, apiKey);
  if (first.result?.ok) return first.result;
  if (first.status === 400 || first.status === 401) return first.result!;
  if (first.status === 429) {
    await sleep(30_000);
    const retried = await requestOnce(model, request.messages, request.schema, fetcher, apiKey);
    return retried.result ?? { ok: false, model, latencyMs: 0, errorCode: "INFERENCE_UNAVAILABLE" };
  }
  if (first.schemaInvalid) {
    const repairMessages = [...request.messages, { role: "user" as const, content: "Return only valid JSON that exactly matches the schema. Do not add commentary." }];
    const repaired = await requestOnce(model, repairMessages, request.schema, fetcher, apiKey);
    if (repaired.result?.ok) return repaired.result;
    const failedOver = await requestOnce(FAILOVER[request.channel], repairMessages, request.schema, fetcher, apiKey);
    return failedOver.result?.ok ? failedOver.result : { ...(failedOver.result ?? { model: FAILOVER[request.channel], latencyMs: 0 }), ok: false, errorCode: "SCHEMA_INVALID" };
  }
  const failedOver = await requestOnce(FAILOVER[request.channel], request.messages, request.schema, fetcher, apiKey);
  return failedOver.result?.ok ? failedOver.result : { ...(failedOver.result ?? { model: FAILOVER[request.channel], latencyMs: 0 }), ok: false, errorCode: "INFERENCE_UNAVAILABLE" };
}

export function fingerprintPrompt(messages: GonkaMessage[]): string {
  return sha256(JSON.stringify(messages));
}

export function fingerprintResponse(content: string | undefined): string | undefined {
  return content === undefined ? undefined : sha256(content);
}
