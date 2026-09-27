import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { payoutIntentRequest } from "../scripts/quickstart-payout.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const routeSource = readFileSync(new URL("../src/app/api/v1/intents/route.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/api/v1/workspaces/route.ts", import.meta.url), "utf8");
const quickstart = readFileSync(new URL("../docs/QUICKSTART.md", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/developers/quickstart.tsx", import.meta.url), "utf8");

/** The three non-empty strings the payout route demands before it will run an intent. */
function fieldsRequiredByRoute(source) {
  const marker = 'error: "INVALID_REQUEST"';
  const end = source.indexOf(marker);
  const start = source.lastIndexOf("typeof body.", end);
  assert.ok(start > 0 && end > start, "payout route no longer shows its INVALID_REQUEST checks");
  const block = source.slice(source.lastIndexOf("if (", start), end);
  const typed = [...block.matchAll(/typeof body\.([a-z_]+) !== "string"/g)].map((match) => match[1]);
  const nonempty = [...block.matchAll(/!body\.([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(nonempty, typed);
  return typed;
}

/** Same accept/reject split the route uses: each required field must be a non-empty string. */
function routeWouldReject(body, fields) {
  return fields.some((field) => typeof body[field] !== "string" || !body[field]);
}

const fields = fieldsRequiredByRoute(routeSource);

test("quickstart payout body is one the intents route accepts", () => {
  assert.deepEqual(fields, ["idempotency_key", "artifact", "recipient_ref"]);
  assert.match(routeSource, /header\.startsWith\("Bearer "\)/);
  assert.match(workspaceSource, /approved_amount_micros: "5000000"/);
  assert.match(workspaceSource, /ceilingMicros: 5n \* MICROS_PER_USDC/);

  const call = payoutIntentRequest({
    TIBA_BASE: "https://tiba.rizqey.com/",
    TIBA_AGENT_KEY: "tiba_live_examplekey",
    TIBA_RECIPIENT_REF: "owner-abc",
    TIBA_WORK_ORDER_REF: "WO-ABC",
    TIBA_IDEMPOTENCY_KEY: "quickstart-pay-WO-ABC"
  });
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://tiba.rizqey.com/api/v1/intents");
  assert.equal(call.headers["content-type"], "application/json");
  assert.equal(call.headers.authorization, "Bearer tiba_live_examplekey");
  assert.ok(call.headers.authorization.startsWith("Bearer "));
  assert.ok(call.headers.authorization.slice("Bearer ".length));

  const body = JSON.parse(call.body);
  assert.equal(routeWouldReject(body, fields), false);
  assert.equal(routeWouldReject({ ...body, artifact: "" }, fields), true);
  assert.equal(routeWouldReject({ ...body, recipient_ref: 5 }, fields), true);
  assert.equal(body.idempotency_key, "quickstart-pay-WO-ABC");
  assert.equal(body.recipient_ref, "owner-abc");
  assert.equal(
    body.artifact,
    "DELIVERY NOTE\nWork order: WO-ABC\nDelivered: first invoice, accepted.\nAmount due: 5.00 USDC\nSigned: onboarding"
  );

  for (const copy of [quickstart, page]) {
    assert.match(copy, /Amount due: 5\.00 USDC/);
    assert.match(copy, /Signed: onboarding/);
    assert.match(copy, /https:\/\/faucet\.solana\.com/);
    assert.match(copy, /https:\/\/faucet\.circle\.com/);
    assert.match(copy, /4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU/);
    assert.match(copy, /require_recipient_kyc/);
    assert.match(copy, /NO_OPEN_OBLIGATION/);
    assert.match(copy, /Share your receipt link with Faris\./);
  }
});

test("running the script posts a request the payout route accepts", async () => {
  let seen;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const authorization = request.headers.authorization ?? "";
      seen = {
        method: request.method,
        url: request.url,
        authorization,
        type: request.headers["content-type"],
        body
      };
      const secret = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
      if (!secret || routeWouldReject(body, fields)) {
        response.writeHead(secret ? 400 : 401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: secret ? "INVALID_REQUEST" : "UNAUTHORIZED" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        status: "settled",
        decision_class: "PAID",
        public_token: "receipt-token",
        chain: "solana"
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const child = spawn(process.execPath, ["scripts/quickstart-payout.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        TIBA_BASE: `http://127.0.0.1:${port}`,
        TIBA_AGENT_KEY: "tiba_live_examplekey",
        TIBA_RECIPIENT_REF: "owner-abc",
        TIBA_WORK_ORDER_REF: "WO-ABC",
        TIBA_IDEMPOTENCY_KEY: "quickstart-pay-WO-ABC"
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    assert.equal(code, 0, stderr);
    assert.equal(stdout.trim(), `settled http://127.0.0.1:${port}/r/receipt-token`);
    assert.ok(seen, "script made no request");
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/api/v1/intents");
    assert.equal(seen.authorization, "Bearer tiba_live_examplekey");
    assert.match(String(seen.type), /^application\/json/);
    assert.equal(routeWouldReject(seen.body, fields), false);
    assert.equal(seen.body.idempotency_key, "quickstart-pay-WO-ABC");
    assert.equal(seen.body.recipient_ref, "owner-abc");
    assert.match(seen.body.artifact, /Work order: WO-ABC/);
    assert.match(seen.body.artifact, /Amount due: 5\.00 USDC/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
