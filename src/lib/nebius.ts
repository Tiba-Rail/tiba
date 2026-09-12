import { isJsonForSchema, parseContent, type GonkaMessage, type GonkaRequest, type GonkaResult, type JsonSchema } from "./gonka.ts";

// Nebius Token Factory: OpenAI-compatible inference serving NVIDIA Nemotron open models.
// Same request/result shape as gonka.ts, so payout-intent.ts can use either reader.
export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";
const TIMEOUT_MS = 60_000;
const MAX_IMAGES = 4;

// Token Factory does not publish every Nemotron id. Defaults follow the published Super id;
// run `npm run nebius:models` with a key and override any that 404.
export function nemotronModels() {
  return {
    super: process.env.NEBIUS_MODEL_SUPER || "nvidia/nemotron-3-super-120b-a12b",
    nano: process.env.NEBIUS_MODEL_NANO || "nvidia/nemotron-3-nano-30b-a3b",
    omni: process.env.NEBIUS_MODEL_OMNI || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  };
}

export function nebiusApiKey(): string {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set. Add it to .env (local) or the Vercel env to run the Nemotron checks.");
  return key;
}

/** READER_PROVIDER=nebius|gonka. Unset: Nebius when NEBIUS_API_KEY exists, else GonkaRouter. */
export function readerProvider(): "nebius" | "gonka" {
  const chosen = (process.env.READER_PROVIDER ?? "").trim().toLowerCase();
  if (chosen === "nebius" || chosen === "gonka") return chosen;
  if (chosen) throw new Error(`READER_PROVIDER must be "nebius" or "gonka", got "${chosen}".`);
  return process.env.NEBIUS_API_KEY ? "nebius" : "gonka";
}

const IMAGE_REF =
  /data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>\\]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>\\]*)?(?=[\s"'<>\\]|$)/gi;
const DATA_URI = /data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi;

/** Image links or data URIs inside the delivery note (a photo of the invoice, a delivery proof). */
export function artifactImages(text: string): string[] {
  return [...new Set(text.match(IMAGE_REF) ?? [])].slice(0, MAX_IMAGES);
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type NebiusMessage = { role: "system" | "user"; content: string | Part[] };

function withImages(messages: GonkaMessage[], images: string[]): NebiusMessage[] {
  if (images.length === 0) return messages;
  return messages.map((message): NebiusMessage =>
    message.role !== "user"
      ? message
      : {
          role: "user",
          // The bytes travel in the image parts; left in the text they would be read as tokens.
          content: [
            { type: "text", text: message.content.replace(DATA_URI, "[attached image]") },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))
          ]
        }
  );
}

/**
 * Which Nemotron reads which channel. The two channels always ask for different models:
 * the delivery note goes to Nano Omni when it carries an image (it reads the picture) and to
 * Super otherwise; the payer's own records go to Nano 30B.
 */
export function nemotronFor(request: Pick<GonkaRequest, "channel" | "messages">): { model: string; images: string[] } {
  const models = nemotronModels();
  if (request.channel === "payer_record") return { model: models.nano, images: [] };
  const images = artifactImages(request.messages.map((message) => message.content).join("\n"));
  return { model: images.length > 0 ? models.omni : models.super, images };
}

type Format = "json_schema" | "json_object";
type Outcome = { result: GonkaResult; status?: number; retry?: "json_object" | "repair" | "same" };

function jsonObjectInstruction(schema: JsonSchema): string {
  const keys = Object.keys((schema.schema as { properties?: object }).properties ?? {});
  return `Respond with exactly one JSON object and nothing else. Required keys: ${keys.join(", ")}. Every value is a string. No prose, no markdown fences.`;
}

async function chatOnce(
  model: string,
  messages: NebiusMessage[],
  schema: JsonSchema,
  format: Format,
  apiKey: string,
  fetcher: typeof fetch
): Promise<Outcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  const sent =
    format === "json_schema"
      ? messages
      : messages.map((m) => (m.role === "system" && typeof m.content === "string" ? { ...m, content: `${m.content}\n\n${jsonObjectInstruction(schema)}` } : m));
  try {
    const response = await fetcher(`${NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: sent,
        temperature: 0,
        // Nemotron 3 reasons before it answers; leave room for that plus the JSON.
        max_tokens: 4096,
        ...(process.env.NEBIUS_REASONING_EFFORT ? { reasoning_effort: process.env.NEBIUS_REASONING_EFFORT } : {}),
        response_format: format === "json_schema" ? { type: "json_schema", json_schema: schema } : { type: "json_object" }
      })
    });
    const latencyMs = Date.now() - started;
    const headerId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      const retry = response.status === 400 && format === "json_schema" ? "json_object" : response.status === 429 || response.status >= 500 ? "same" : undefined;
      const errorCode = response.status >= 500 ? "INFERENCE_UNAVAILABLE" : "REQUEST_REJECTED";
      return { status: response.status, retry, result: { ok: false, model, requestId: headerId, latencyMs, errorCode } };
    }
    const body = (await response.json()) as { id?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const content = parseContent(body);
    const base = {
      model,
      requestId: headerId ?? body.id,
      latencyMs,
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens
    };
    if (content !== null && isJsonForSchema(content, schema)) return { result: { ...base, ok: true, content } };
    return { retry: "repair", result: { ...base, ok: false, content: content ?? undefined, errorCode: "SCHEMA_INVALID" } };
  } catch {
    const retry = controller.signal.aborted ? undefined : "same";
    return { retry, result: { ok: false, model, latencyMs: Date.now() - started, errorCode: "INFERENCE_UNAVAILABLE" } };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One reader check on Token Factory. Structured output via response_format json_schema, then
 * validated here; at most one retry (json_object if the schema form is rejected, a repair
 * prompt if the JSON is off, or the same call after a 5xx/429/network drop). Throws only when
 * NEBIUS_API_KEY is missing, so a misconfigured deploy is loud rather than quietly held.
 */
export async function runNebius(request: GonkaRequest): Promise<GonkaResult> {
  const apiKey = nebiusApiKey();
  const fetcher = request.fetcher ?? fetch;
  const started = Date.now();
  const { model, images } = nemotronFor(request);
  let served = model;
  let messages = withImages(request.messages, images);
  let outcome = await chatOnce(served, messages, request.schema, "json_schema", apiKey, fetcher);

  // An unpublished default id that 404s runs on Nemotron Super instead, recorded as a
  // substitution exactly like a Gonka fallback (a split on swapped models is held, not refused).
  const superModel = nemotronModels().super;
  if (outcome.status === 404 && served !== superModel) {
    served = superModel;
    messages = request.messages;
    outcome = await chatOnce(served, messages, request.schema, "json_schema", apiKey, fetcher);
  }

  if (outcome.retry) {
    const retryMessages: NebiusMessage[] =
      outcome.retry === "repair"
        ? [...messages, { role: "user", content: "Return only valid JSON that exactly matches the schema. Do not add commentary." }]
        : messages;
    outcome = await chatOnce(served, retryMessages, request.schema, outcome.retry === "json_object" ? "json_object" : "json_schema", apiKey, fetcher);
  }

  const result: GonkaResult = { ...outcome.result, model, latencyMs: Date.now() - started };
  if (served !== model) result.fallback = served;
  return result;
}
