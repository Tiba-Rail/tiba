import { createHash } from "node:crypto";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 60_000;
// Switched off Gonka's router 19 Sep 2026: live tested with a trivial one-word
// prompt and it burned its whole token budget on repeated garbage, confirming
// the reliability problems the old hedging/repair logic below was already
// compensating for. Moved to Groq, verified live 19 Sep against the real
// artifact_decision schema and system prompt: clean, correct JSON, right
// USDC-to-micros conversion, no fabrication.
//   openai/gpt-oss-120b + json_schema: clean, correct on the real schema. Note
//     it reasons before answering (like a <think> model) - give it real
//     max_tokens headroom or it truncates mid-reasoning with empty content.
//   qwen/qwen3.8-27b + json_schema: clean, correct, no reasoning preamble.
// Keeping the hedge-both-candidates pattern even though Groq is far more
// reliable than Gonka was - cheap insurance, and it costs nothing extra since
// Groq's free tier is uncapped for this account.
const CANDIDATES: Record<GonkaChannel, [string, string]> = {
  artifact: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
  payer_record: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
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
  if (typeof content !== "string") return null;
  // Models on the router started emitting <think> reasoning ahead of the JSON, even under a
  // strict schema. Strip any reasoning wrapper and take the JSON object that follows, so a
  // chatty model is a formatting quirk rather than an outage that holds every payment.
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }
  return text.length > 0 ? text : null;
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
  // The router intermittently drops a connection or answers 5xx from some egress paths.
  // One shot per model turned that into a held payment, so each call gets a short retry.
  const attempt = async (): Promise<Response> => await fetcher(API_URL, {
      method: "POST",
      signal: controller.signal,
      // Substitution is allowed so a saturated model does not kill the call. It is recorded
      // per adjudication, and the route refuses to blame the payer when models were swapped.
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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
        // Room for a reasoning preamble plus the JSON; parseContent strips the preamble.
        max_tokens: 1400,
        ...(SCHEMA_FREE.has(model) ? {} : { response_format: { type: "json_schema", json_schema: schema } })
      })
    });
  try {
    let response: Response | null = null;
    let lastError: unknown = null;
    for (let tries = 0; tries < 2; tries += 1) {
      try {
        response = await attempt();
        if (response.status < 500) break;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        response = null;
      }
      if (tries < 1) await new Promise((r) => setTimeout(r, 300));
    }
    if (!response) throw lastError ?? new Error('router unreachable');
    const latencyMs = Date.now() - started;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    // Groq serves the exact model requested and does not silently substitute a
    // different one, unlike Gonka's router. This header will not fire on Groq;
    // kept so the field stays populated (and shown on the receipt) if a future
    // provider does substitute models, rather than silently dropping the check.
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
  const apiKey = process.env.GROQ_API_KEY;
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
