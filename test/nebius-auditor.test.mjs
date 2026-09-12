import assert from "node:assert/strict";
import test from "node:test";
import { auditPayee } from "../src/lib/auditor.ts";
import { artifactImages, nemotronFor, runNebius } from "../src/lib/nebius.ts";
import { payerRecordDecisionSchema } from "../src/lib/prompts.ts";

process.env.NEBIUS_API_KEY = "test-nebius";
process.env.TAVILY_API_KEY = "test-tavily";
for (const name of ["NEBIUS_MODEL_SUPER", "NEBIUS_MODEL_NANO", "NEBIUS_MODEL_OMNI"]) delete process.env[name];

const SUPER = "nvidia/nemotron-3-super-120b-a12b";
const json = (body, headers = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const toolCall = (query) => json({
  id: "chatcmpl-tool",
  choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "tavily_search", arguments: JSON.stringify({ query }) } }] } }]
});
const answer = (verdict, sources = []) => json(
  { id: "chatcmpl-final", choices: [{ message: { role: "assistant", content: JSON.stringify({ verdict, reasons: ["Checked."], sources }) } }] },
  { "x-request-id": "req-final" }
);
const input = {
  payee: { name: "Acme Couriers", ref: "rcp_1", wallet: "So1111", chain: "solana" },
  invoice: "Delivered 3 boxes for WO-1. 12 USDC.",
  workOrders: [{ id: "WO-1", brief: "Courier run", ceiling_micros: "12000000" }]
};

test("auditor searches with Tavily on Nemotron Super, then clears, citing only returned URLs", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.authorization });
    if (url.includes("tavily")) return json({ results: [{ title: "Acme Couriers", url: "https://acme.example/about", content: "Courier firm" }] });
    return body.messages.some((m) => m.role === "tool")
      ? answer("clear", [{ title: "x", url: "https://acme.example/about" }, { title: "invented", url: "https://invented.example" }])
      : toolCall("Acme Couriers scam reports");
  };
  const audit = await auditPayee(input, { fetcher });
  assert.equal(audit.verdict, "clear");
  assert.equal(audit.ok, true);
  assert.equal(audit.toolCalls, 1);
  assert.equal(audit.requestId, "req-final");
  assert.deepEqual(audit.sources, [{ title: "Acme Couriers", url: "https://acme.example/about" }]);
  const search = calls.find((c) => c.url === "https://api.tavily.com/search");
  assert.equal(search.auth, "Bearer test-tavily");
  assert.equal(search.body.query, "Acme Couriers scam reports");
  assert.equal(calls[0].url, "https://api.tokenfactory.nebius.com/v1/chat/completions");
  assert.equal(calls[0].body.model, SUPER);
  assert.equal(calls[0].body.tools[0].function.name, "tavily_search");
});

test("auditor stops at 3 searches and holds without a verdict", async () => {
  let searches = 0;
  const fetcher = async (url) => {
    if (url.includes("tavily")) { searches += 1; return json({ results: [] }); }
    return toolCall("again");
  };
  const audit = await auditPayee(input, { fetcher });
  assert.equal(searches, 3);
  assert.equal(audit.verdict, "hold");
  assert.equal(audit.ok, false);
});

test("auditor holds on provider failure, on no search, on a missing key, and on timeout", async () => {
  assert.equal((await auditPayee(input, { fetcher: async () => new Response("down", { status: 500 }) })).verdict, "hold");
  assert.equal((await auditPayee(input, { fetcher: async () => answer("clear") })).verdict, "hold");

  delete process.env.TAVILY_API_KEY;
  const noKey = await auditPayee(input, { fetcher: async () => answer("clear") });
  process.env.TAVILY_API_KEY = "test-tavily";
  assert.equal(noKey.verdict, "hold");
  assert.match(noKey.reasons[0], /TAVILY_API_KEY/);

  const hang = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const slow = await auditPayee(input, { fetcher: hang, deadlineMs: 30 });
  assert.equal(slow.verdict, "hold");
  assert.match(slow.reasons[0], /ran out of time/);
});

test("readers: image delivery notes go to Nano Omni, text to Super, payer records to Nano", () => {
  const note = JSON.stringify({ artifact_text_and_links: "Proof: https://cdn.example/pod.jpg and data:image/png;base64,iVBORw0KGgo=" });
  assert.deepEqual(artifactImages(note), ["https://cdn.example/pod.jpg", "data:image/png;base64,iVBORw0KGgo="]);
  const user = (content) => [{ role: "system", content: "s" }, { role: "user", content }];
  assert.equal(nemotronFor({ channel: "artifact", messages: user(note) }).model, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
  assert.equal(nemotronFor({ channel: "artifact", messages: user("delivered, WO-1") }).model, SUPER);
  assert.equal(nemotronFor({ channel: "payer_record", messages: user(note) }).model, "nvidia/nemotron-3-nano-30b-a3b");
});

test("reader: json_schema output, repair once, and an unknown model id falls back to Super on record", async () => {
  const valid = JSON.stringify({ work_order_id: "WO-1", amount_micros: "12000000", delivery_timestamp: "2026-09-12T00:00:00Z", record_basis: "verified_complete" });
  const sent = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    if (body.model !== SUPER) return new Response("{}", { status: 404 });
    return json({ id: `chatcmpl-${sent.length}`, choices: [{ message: { content: sent.length === 2 ? "not json" : `<think>ok</think>${valid}` } }] });
  };
  const result = await runNebius({ channel: "payer_record", messages: [{ role: "system", content: "s" }, { role: "user", content: "{}" }], schema: payerRecordDecisionSchema, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.model, "nvidia/nemotron-3-nano-30b-a3b");
  assert.equal(result.fallback, SUPER);
  assert.equal(result.requestId, "chatcmpl-3");
  assert.equal(sent[1].response_format.type, "json_schema");
  assert.match(sent[2].messages.at(-1).content, /Return only valid JSON/);
});
