import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BANNER,
  CSV_COLUMNS,
  WORK_ORDER_WINDOW_MS,
  buildPlans,
  formatDryRun,
  formatRunReport,
  outcomeWord,
  parseWinners,
  plainReason,
  runCli
} from "../scripts/bounty-run.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const samplePath = fileURLToPath(new URL("../scripts/samples/bounty-winners.sample.csv", import.meta.url));
const sampleCsv = readFileSync(samplePath, "utf8");
const source = readFileSync(new URL("../scripts/bounty-run.mjs", import.meta.url), "utf8");
const NOW = Date.parse("2026-09-27T04:00:00.000Z");
const BASE = "https://tiba.rizqey.com";

const ADDRESSES = [
  "AcUGHbyYqYXrNk8HYHpdCRnNnov8hsnRUNbCiQ7dLCwG",
  "m9xU5NrhtH2qWrwM7Lha5oX4FmFFUGPodjtKeaNER29",
  "2tdDoKVUoagCRFGDoSnbDSg8Q2nKANzTMPAaSwR4xLB5"
];

function plansFromSample() {
  const parsed = parseWinners(sampleCsv);
  assert.deepEqual(parsed.errors, []);
  return buildPlans(parsed.winners, { base: `${BASE}/`, now: NOW });
}

function runScript(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/bounty-run.mjs", ...args], {
      cwd: root,
      env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function listen() {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try { body = JSON.parse(raw); } catch { body = raw; }
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization ?? "",
        type: request.headers["content-type"] ?? "",
        body
      });
      const seen = requests.length;
      if (request.url === "/api/v1/intents") {
        const outcomes = [
          { status: "settled", decision_class: "PAID", reason_code: null, chain: "solana", public_token: "paid-token" },
          { status: "refused", decision_class: "RED", reason_code: "QUORUM_SPLIT:amount_micros", chain: "solana", public_token: "refused-token" },
          { status: "held", decision_class: "AMBER", reason_code: "HUMAN_REVIEW_REQUIRED", chain: "solana", public_token: "held-token" }
        ];
        const outcome = outcomes[Math.floor((seen - 1) / 3)] ?? outcomes[2];
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(outcome));
        return;
      }
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: `created-${seen}`, ref: body?.ref ?? "" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, requests, port: server.address().port }));
  });
}

test("the script reads keys only from the environment", () => {
  assert.equal(source.includes("dotenv"), false);
  assert.equal(source.includes('readFileSync(".env"'), false);
  assert.equal(source.includes("readFileSync('.env'"), false);
  assert.match(source, /TIBA_OWNER_KEY/);
  assert.match(source, /TIBA_AGENT_KEY/);
  assert.match(source, /bounty-\$\{winner\.bountyRef\}-\$\{winner\.row\}/);
});

test("the sample CSV is three winners and the dry-run requests match the live routes", () => {
  const plans = plansFromSample();
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map((plan) => plan.idempotencyKey), [
    "bounty-superteam-my-sample-1",
    "bounty-krackeddevs-sample-2",
    "bounty-superteam-my-sample-3"
  ]);
  assert.deepEqual(plans.map((plan) => plan.amountLabel), ["25.00 USDC", "10.5 USDC", "3.25 USDC"]);
  assert.deepEqual(plans.map((plan) => plan.solanaAddress), ADDRESSES);

  const expiresAt = new Date(NOW + WORK_ORDER_WINDOW_MS).toISOString();
  assert.equal(expiresAt, "2026-10-27T04:00:00.000Z");

  for (const [index, plan] of plans.entries()) {
    assert.equal(plan.requests.length, 3);
    const [recipient, workOrder, intent] = plan.requests;
    assert.equal(recipient.method, "POST");
    assert.equal(recipient.url, `${BASE}/api/v1/recipients`);
    assert.equal(recipient.keyEnv, "TIBA_OWNER_KEY");
    assert.equal(recipient.body.display_name, plan.winnerName);
    assert.equal(recipient.body.solana_address, ADDRESSES[index]);
    assert.equal(recipient.body.ref, plan.recipientRef);

    assert.equal(workOrder.url, `${BASE}/api/v1/work-orders`);
    assert.equal(workOrder.keyEnv, "TIBA_OWNER_KEY");
    assert.equal(workOrder.body.required_channels, "both");
    assert.equal(workOrder.body.recipient_ref, recipient.body.ref);
    assert.equal(workOrder.body.ceiling_usdc, ["25", "10.50", "3.25"][index]);
    assert.equal(workOrder.body.expires_at, expiresAt);
    assert.equal(typeof workOrder.body.payer_record, "string");
    assert.equal(typeof workOrder.body.brief_text, "string");
    assert.ok(workOrder.body.brief_text.trim());
    const record = JSON.parse(workOrder.body.payer_record);
    assert.equal(Array.isArray(record), false);
    assert.equal(record.approved_amount_micros, plan.micros);
    assert.equal(record.delivery_status, "verified_complete");
    assert.equal(record.bounty_ref, plan.bountyRef);
    assert.deepEqual(record.approved_amount_micros, ["25000000", "10500000", "3250000"][index]);

    assert.equal(intent.url, `${BASE}/api/v1/intents`);
    assert.equal(intent.keyEnv, "TIBA_AGENT_KEY");
    assert.deepEqual(Object.keys(intent.body), ["idempotency_key", "recipient_ref", "artifact"]);
    assert.equal(intent.body.idempotency_key, plan.idempotencyKey);
    assert.equal(intent.body.recipient_ref, recipient.body.ref);
    assert.match(intent.body.artifact, new RegExp(`Work order: ${plan.workOrderRef}`));
    assert.ok(intent.body.artifact.includes(`Amount due: ${plan.amountLabel}`));
    assert.ok(intent.body.artifact.includes(plan.claimText));
  }

  const printed = formatDryRun(plans, { ownerKeySet: false, agentKeySet: false });
  assert.match(printed, /Nothing was sent/);
  assert.match(printed, /No receipts yet/);
  assert.equal(printed.includes("Bearer tiba"), false);
  for (const key of plans.map((plan) => plan.idempotencyKey)) assert.ok(printed.includes(key), key);
  assert.equal(printed.includes('"required_channels": "both"'), true);
  const blocks = [...printed.matchAll(/\{\n[\s\S]*?\n\}/g)].map((match) => JSON.parse(match[0]));
  assert.equal(blocks.length, 9);
  assert.equal(blocks[1].required_channels, "both");
  assert.equal(JSON.parse(blocks[1].payer_record).approved_amount_micros, "25000000");
  assert.equal(blocks[2].idempotency_key, "bounty-superteam-my-sample-1");
});

test("quoted claim text and a blank line still number rows in file order", () => {
  const csv = [
    "winner_name,solana_address,amount_usdc,bounty_ref,claim_text",
    "",
    `Ada,"${ADDRESSES[0]}",1.5,ref-a,"She said ""done"", and shipped."`,
    `Bo,${ADDRESSES[1]},2,ref-a,Second claim`
  ].join("\n");
  const parsed = parseWinners(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.winners[0].claimText, 'She said "done", and shipped.');
  assert.deepEqual(parsed.winners.map((winner) => winner.row), [1, 2]);
  assert.equal(parsed.winners[0].amountUsdc, "1.5");
  assert.equal(parsed.winners[0].micros, "1500000");
});

test("a bad file is rejected before any request would be built", () => {
  const badAddress = parseWinners(`winner_name,solana_address,amount_usdc,bounty_ref,claim_text\nAda,not-an-address,5,ref,Did the work\n`);
  assert.equal(badAddress.winners.length, 0);
  assert.match(badAddress.errors[0], /not a Solana address/);

  const badAmount = parseWinners(`${CSV_COLUMNS.join(",")}\nAda,${ADDRESSES[0]},0,ref,Did the work\n`);
  assert.match(badAmount.errors[0], /amount_usdc/);

  const missing = parseWinners("winner_name,solana_address\nAda,x\n");
  assert.match(missing.errors[0], /Missing column/);

  const openQuote = parseWinners(`${CSV_COLUMNS.join(",")}\n"Ada,${ADDRESSES[0]},1,ref,nope\n`);
  assert.match(openQuote.errors[0], /not closed/);
});

test("PAID, REFUSED, and HELD use the console's plain reasons", () => {
  assert.equal(outcomeWord({ decisionClass: "PAID", status: "settled" }), "PAID");
  assert.equal(outcomeWord({ decisionClass: "RED", status: "refused" }), "REFUSED");
  assert.equal(outcomeWord({ decisionClass: "AMBER", status: "held" }), "HELD");
  assert.equal(plainReason("PAID", null, "solana"), "Both checks agreed, the limits passed, and the test transfer completed.");
  assert.match(plainReason("PAID", null, "mock"), /No devnet USDC moved/);
  assert.equal(plainReason("REFUSED", "QUORUM_SPLIT:amount_micros", "solana"), "The two checks named different amounts.");
  assert.equal(plainReason("REFUSED", "NO_OPEN_OBLIGATION", "solana"), "No invoice awaiting delivery matches this delivery note.");
  assert.equal(plainReason("REFUSED", "SETTLEMENT_FAILED", "solana"), "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.");
  assert.equal(plainReason("HELD", "HUMAN_REVIEW_REQUIRED", "solana"), "This amount is large enough that your limits require you to decide.");

  const report = formatRunReport([
    {
      winnerName: "Ada",
      bountyRef: "superteam-my-sample",
      amountLabel: "25.00 USDC",
      outcome: "PAID",
      reason: plainReason("PAID", null, "solana"),
      receipt: "https://tiba.rizqey.com/r/paid-token"
    },
    {
      winnerName: "Bo",
      bountyRef: "krackeddevs-sample",
      amountLabel: "10.5 USDC",
      outcome: "REFUSED",
      reason: plainReason("REFUSED", "QUORUM_SPLIT:amount_micros", "solana"),
      receipt: "https://tiba.rizqey.com/r/refused-token"
    }
  ]);
  assert.match(report, /\| Ada \| superteam-my-sample \| 25\.00 USDC \| PAID \|/);
  assert.match(report, /https:\/\/tiba\.rizqey\.com\/r\/paid-token/);
  assert.match(report, /For the program owner/);
  assert.match(report, /No real money/);
  assert.match(report, /superteam-my-sample: 1 winner, 1 paid, 0 refused, 0 held/);
  assert.match(report, /krackeddevs-sample: 1 winner, 0 paid, 1 refused, 0 held/);
  assert.match(report, /The two checks named different amounts/);
});

test("--dry-run on the sample prints the requests and calls nothing", async () => {
  const { server, requests, port } = await listen();
  const owner = "owner-key-canary-do-not-print";
  const agent = "agent-key-canary-do-not-print";
  try {
    const result = await runScript(["--dry-run", "scripts/samples/bounty-winners.sample.csv"], {
      ...process.env,
      TIBA_BASE: `http://127.0.0.1:${port}`,
      TIBA_OWNER_KEY: owner,
      TIBA_AGENT_KEY: agent,
      SOLANA_NETWORK: "devnet"
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 0);
    assert.match(result.stdout, new RegExp(BANNER.replace(".", "\\.")));
    assert.match(result.stdout, /Nothing was sent/);
    assert.match(result.stdout, /TIBA_OWNER_KEY: present/);
    assert.match(result.stdout, /TIBA_AGENT_KEY: present/);
    assert.match(result.stdout, /bounty-superteam-my-sample-1/);
    assert.match(result.stdout, /bounty-krackeddevs-sample-2/);
    assert.match(result.stdout, /bounty-superteam-my-sample-3/);
    assert.match(result.stdout, /POST http:\/\/127\.0\.0\.1:\d+\/api\/v1\/recipients/);
    assert.match(result.stdout, /POST http:\/\/127\.0\.0\.1:\d+\/api\/v1\/work-orders/);
    assert.match(result.stdout, /POST http:\/\/127\.0\.0\.1:\d+\/api\/v1\/intents/);
    assert.match(result.stdout, /"required_channels": "both"/);
    assert.match(result.stdout, /approved_amount_micros\\":\\"25000000/);
    assert.match(result.stdout, /approved_amount_micros\\":\\"10500000/);
    assert.match(result.stdout, /approved_amount_micros\\":\\"3250000/);
    assert.match(result.stdout, /Wrote the devnet guide, linked in the thread/);
    assert.match(result.stdout, /Authorization: Bearer \(TIBA_OWNER_KEY\)/);
    assert.match(result.stdout, /Authorization: Bearer \(TIBA_AGENT_KEY\)/);
    assert.equal(result.stdout.includes(owner), false);
    assert.equal(result.stdout.includes(agent), false);
    assert.equal(result.stderr.includes(owner), false);
    assert.equal(result.stderr.includes(agent), false);
    assert.match(result.stdout, /No receipts yet/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a real run prints PAID, REFUSED, and HELD with receipt links and does not print keys", async () => {
  const { server, requests, port } = await listen();
  const owner = "owner-key-canary-do-not-print";
  const agent = "agent-key-canary-do-not-print";
  try {
    const result = await runScript(["scripts/samples/bounty-winners.sample.csv"], {
      ...process.env,
      TIBA_BASE: `http://127.0.0.1:${port}/`,
      TIBA_OWNER_KEY: owner,
      TIBA_AGENT_KEY: agent,
      SOLANA_NETWORK: "devnet"
    });
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(requests.length, 9);
    const paths = requests.map((seen) => seen.url);
    assert.deepEqual(paths, [
      "/api/v1/recipients", "/api/v1/work-orders", "/api/v1/intents",
      "/api/v1/recipients", "/api/v1/work-orders", "/api/v1/intents",
      "/api/v1/recipients", "/api/v1/work-orders", "/api/v1/intents"
    ]);
    for (const [index, seen] of requests.entries()) {
      assert.equal(seen.method, "POST");
      assert.match(seen.type, /^application\/json/);
      const expectAgent = seen.url === "/api/v1/intents";
      assert.equal(seen.authorization, `Bearer ${expectAgent ? agent : owner}`);
      if (expectAgent) {
        assert.equal(seen.body.idempotency_key, [
          "bounty-superteam-my-sample-1",
          "bounty-krackeddevs-sample-2",
          "bounty-superteam-my-sample-3"
        ][Math.floor(index / 3)]);
      }
      if (seen.url === "/api/v1/work-orders") {
        assert.equal(seen.body.required_channels, "both");
        assert.equal(typeof seen.body.payer_record, "string");
        assert.match(seen.body.payer_record, /"delivery_status":"verified_complete"/);
      }
    }
    assert.match(result.stdout, /\| Sample Winner A \| superteam-my-sample \| 25\.00 USDC \| PAID \|/);
    assert.match(result.stdout, /\| Sample Winner B \| krackeddevs-sample \| 10\.5 USDC \| REFUSED \|/);
    assert.match(result.stdout, /\| Sample Winner C \| superteam-my-sample \| 3\.25 USDC \| HELD \|/);
    assert.match(result.stdout, /The two checks named different amounts/);
    assert.match(result.stdout, /This amount is large enough that your limits require you to decide/);
    assert.match(result.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}/r/paid-token`));
    assert.match(result.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}/r/refused-token`));
    assert.match(result.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}/r/held-token`));
    assert.match(result.stdout, /For the program owner/);
    assert.match(result.stdout, /superteam-my-sample: 2 winners, 1 paid, 0 refused, 1 held/);
    assert.match(result.stdout, /krackeddevs-sample: 1 winner, 0 paid, 1 refused, 0 held/);
    assert.match(result.stdout, /No real money/);
    assert.equal(result.stdout.includes(owner), false);
    assert.equal(result.stdout.includes(agent), false);
    assert.equal(result.stderr.includes(owner), false);
    assert.equal(result.stderr.includes(agent), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dry-run of a bad file and a real run without keys call nothing", async () => {
  const { server, requests, port } = await listen();
  const dir = mkdtempSync(join(tmpdir(), "bounty-run-"));
  const badPath = join(dir, "bad.csv");
  writeFileSync(badPath, "winner_name,solana_address,amount_usdc,bounty_ref,claim_text\nAda,not-an-address,5,ref,Did the work\n");
  const env = { ...process.env, TIBA_BASE: `http://127.0.0.1:${port}`, SOLANA_NETWORK: "devnet" };
  delete env.TIBA_OWNER_KEY;
  delete env.TIBA_AGENT_KEY;
  try {
    const dry = await runScript(["--dry-run", badPath], env);
    assert.equal(dry.code, 1);
    assert.match(dry.stderr, /not a Solana address/);
    assert.match(dry.stdout, /Nothing was sent/);
    assert.equal(requests.length, 0);

    const missingKeys = await runScript(["scripts/samples/bounty-winners.sample.csv"], env);
    assert.equal(missingKeys.code, 1);
    assert.match(missingKeys.stderr, /Set TIBA_OWNER_KEY and TIBA_AGENT_KEY/);
    assert.match(missingKeys.stdout, /Nothing was sent/);
    assert.equal(requests.length, 0);

    const mainnet = await runCli(["--dry-run", samplePath], { TIBA_BASE: "https://example-mainnet.invalid" }, {
      stdout: () => {},
      stderr: () => {},
      readFile: () => sampleCsv,
      fetch: () => { throw new Error("fetch was called"); }
    });
    assert.equal(mainnet, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a refused HTTP error stays on that row and the key is scrubbed from the report", async () => {
  const owner = "owner-key-canary-do-not-print";
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(options.headers.authorization.startsWith("Bearer "), true);
    assert.equal(options.headers.authorization.includes(owner), true);
    if (String(url).endsWith("/api/v1/work-orders")) {
      return new Response(JSON.stringify({ error: `RECIPIENT_NOT_FOUND ${owner}` }), { status: 404 });
    }
    return new Response(JSON.stringify({ id: "ok" }), { status: 201 });
  };
  let stdout = "";
  const code = await runCli(["winners.csv"], {
    TIBA_BASE: "http://127.0.0.1:9",
    TIBA_OWNER_KEY: owner,
    TIBA_AGENT_KEY: "agent-key-canary-do-not-print",
    SOLANA_NETWORK: "devnet"
  }, {
    stdout: (text) => { stdout += text; },
    stderr: () => {},
    readFile: () => sampleCsv,
    fetch: fetchImpl,
    now: NOW
  });
  assert.equal(code, 1);
  assert.equal(calls, 6);
  assert.match(stdout, /NOT SENT/);
  assert.match(stdout, /Tiba returned RECIPIENT_NOT_FOUND \[redacted\]\./);
  assert.equal(stdout.includes(owner), false);
});
