import { createHash } from "node:crypto";

const API_URL = "https://api.gonkarouter.io/v1/chat/completions";
const TIMEOUT_MS = 60_000;
// Measured 30 Aug 2026 on the live router with the real prompts:
//   DeepSeek + json_schema: clean 47-token JSON; 18.8s cold, 0.4s on a
//     cached identical request. The only reliably valid reader.
//   Kimi + json_schema: sometimes clean, sometimes whitespace-padded; without
//     the schema it reasons in prose and overruns max_tokens.
//   MiniMax: emits <think>... before any JSON and overruns. Not usable here.
// Per-request latency on Gonka nodes swings 10x for the same model, so each
// channel HEDGES: both candidates are fired together and the first
// schema-valid answer wins (see runGonka). Tokens are free for the event.
const CANDIDATES: Record<GonkaChannel, [string, string]> = {
  artifact: ["moonshotai/Kimi-K2.6", "deepseek-ai/DeepSeek-V4-Flash-0731"],
  payer_record: ["deepseek-ai/DeepSeek-V4-Flash-0731", "moonshotai/Kimi-K2.6"]
};
const PRIMARY: Record<GonkaChannel, string> = { artifact: CANDIDATES.artifact[0], payer_record: CANDIDATES.payer_record[0] };
const SCHEMA_FREE = new Set<string>();

export type GonkaChannel = "artifact" | "payer_record";
export type JsonSchema = { name: string; strict: boolean; schema: object };
export interface GonkaMessage { role: "system" | "user"; content: string }
export interface GonkaResult {
  ok: boolean;
  model: string;
  requestId?: string;
  /** Set when Gonka served a different model than requested (X-Gonka-Fallback). */
  fallback?: string;
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
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "X-Gonka-No-Fallback": "true" },
      body: JSON.stringify({
        model,
        messages: SCHEMA_FREE.has(model)
          ? [
              ...messages,
              {
                role: "system",
                content: `Respond with exactly one JSON object and nothing else. Required keys: ${Object.keys(
                  (schema as { schema?: { properties?: Record<string, unknown> } }).schema?.properties ?? {}
                ).join(", ")}. No prose, no markdown fences.`
              }
            ]
          : messages,
        temperature: 0,
        max_tokens: 256,
        ...(SCHEMA_FREE.has(model) ? {} : { response_format: { type: "json_schema", json_schema: schema } })
      })
    });
    const latencyMs = Date.now() - started;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    // Gonka substitutes a saturated model rather than failing the request, and says so
    // only in this header. Isolation here is by evidence, not by model, so a substitution
    // is not a refusal - but it must be recorded and shown, never silently absorbed.
    const fallback = response.headers.get("x-gonka-fallback") ?? undefined;
    if (!response.ok) return { status: response.status, result: { ok: false, model, requestId, fallback, latencyMs, errorCode: "REQUEST_REJECTED" } };
    const body: unknown = await response.json();
    const content = parseContent(body);
    const usage = body as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const valid = content !== null && isJsonForSchema(content, schema);
    const result: GonkaResult = valid
      ? { ok: true, model, requestId, fallback, content, latencyMs, inputTokens: usage.usage?.prompt_tokens, outputTokens: usage.usage?.completion_tokens }
      : { ok: false, model, requestId, fallback, content: content ?? undefined, latencyMs, errorCode: "SCHEMA_INVALID" };
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
 * Hedged dispatch. Both candidate models for the channel are fired at once and
 * the first schema-valid result wins; the other call is left to finish (it only
 * updates `health`). If neither validates, one repair prompt is sent to the
 * primary; if that fails too, the channel is unavailable / schema-invalid and
 * the caller treats it as AMBER. 400/401 are never retried.
 */
export async function runGonka(request: GonkaRequest): Promise<GonkaResult> {
  const apiKey = process.env.GONKA_API_KEY;
  const [primary, secondary] = CANDIDATES[request.channel];
  if (!apiKey) return { ok: false, model: primary, latencyMs: 0, errorCode: "INFERENCE_UNAVAILABLE" };
  const fetcher = request.fetcher ?? fetch;

  const attempts = [primary, secondary].map((model) =>
    requestOnce(model, request.messages, request.schema, fetcher, apiKey).then((r) => ({ model, ...r }))
  );

  const firstValid = await new Promise<(Awaited<(typeof attempts)[number]>) | null>((resolve) => {
    let pending = attempts.length;
    for (const attempt of attempts) {
      attempt.then((r) => {
        if (r.result?.ok) resolve(r);
        else if (--pending === 0) resolve(null);
      }, () => { if (--pending === 0) resolve(null); });
    }
  });
  if (firstValid?.result?.ok) return firstValid.result;

  const settled = await Promise.all(attempts.map((a) => a.catch(() => null)));
  const hardStop = settled.find((r) => r && (r.status === 400 || r.status === 401));
  if (hardStop?.result) return { ...hardStop.result, ok: false };

  const repairMessages = [...request.messages, { role: "user" as const, content: "Return only valid JSON that exactly matches the schema. Do not add commentary." }];
  const repaired = await requestOnce(primary, repairMessages, request.schema, fetcher, apiKey);
  if (repaired.result?.ok) return repaired.result;

  const anySchemaInvalid = settled.some((r) => r?.schemaInvalid) || repaired.schemaInvalid;
  const fallback = repaired.result ?? { model: primary, latencyMs: 0 };
  return { ...fallback, ok: false, errorCode: anySchemaInvalid ? "SCHEMA_INVALID" : "INFERENCE_UNAVAILABLE" };
}

export function fingerprintPrompt(messages: GonkaMessage[]): string {
  return sha256(JSON.stringify(messages));
}

export function fingerprintResponse(content: string | undefined): string | undefined {
  return content === undefined ? undefined : sha256(content);
}
