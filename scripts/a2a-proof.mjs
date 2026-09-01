// Dev tool: drive Tiba through its A2A adapter as an external agent would.
//   node scripts/a2a-proof.mjs [BASE_URL]        (default https://tiba-omega.vercel.app)
//   A2A_AGENT_KEY=... node scripts/a2a-proof.mjs  (else the seed default agent key)
// Spends real inference and, on a clean note against an open order, real testnet SUI.
const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "https://tiba-omega.vercel.app").replace(/\/$/, "");
const KEY = process.env.A2A_AGENT_KEY ?? "tiba_testnet_demo_key"; // same default as scripts/seed.mjs; never printed

const card = await (await fetch(`${BASE}/.well-known/agent-card.json`)).json();
console.log("agent card:", card.name, card.version, "->", card.supportedInterfaces?.[0]?.url);
console.log("skills:", JSON.stringify(card.skills.map((s) => ({ id: s.id, name: s.name, tags: s.tags })), null, 2));

const endpoint = card.supportedInterfaces[0].url;
const rpc = async (method, params, id) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "A2A-Version": "1.0", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  return res.json();
};

const artifact = [
  "DELIVERY NOTE",
  "Work order: WO-13",
  "Delivered: translation of 4 product documents, reviewed and accepted.",
  "Amount due: 5.00 USDC",
  "Completed: this afternoon, accepted on site",
  "Signed: project lead"
].join("\n");

const sent = await rpc("SendMessage", {
  message: {
    messageId: `a2a-proof-${Date.now()}`,
    role: "ROLE_USER",
    parts: [
      { text: "Authorize and settle the payout for this delivery note." },
      { data: { recipient_ref: "translator-kl", artifact }, mediaType: "application/json" }
    ]
  },
  configuration: { acceptedOutputModes: ["application/json"] }
}, 1);

if (sent.error) {
  console.log("SendMessage error:", JSON.stringify(sent.error, null, 2));
  process.exit(1);
}
const task = sent.result.task;
console.log("task:", task.id, task.status.state);
console.log("decision:", JSON.stringify(task.artifacts[0].parts[0].data, null, 2));

const got = await rpc("GetTask", { id: task.id }, 2);
console.log("GetTask:", got.error ? JSON.stringify(got.error) : `${got.result.id} ${got.result.status.state}`);
