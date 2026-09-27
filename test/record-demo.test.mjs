import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CANDIDATES } from "../src/lib/gonka.ts";
import { onboardingRail } from "../src/lib/rate-limit.ts";
import { configuredRail } from "../src/lib/rails/index.ts";
import {
  RECORD_END_MS,
  assessShots,
  demoShots,
  explorerShot,
  formatResult,
  missingPhrases,
  parseDemoArgs,
  readSource,
  receiptProblems,
  solanaDevnetExplorerHref,
  sourceShots
} from "../scripts/demo-shots.mjs";

const PAID = "https://tiba.rizqey.com/r/8ecd74ca-ef81-4d60-b642-a9a1e8ece93c";
const WRONG = "https://tiba.rizqey.com/r/11111111-1111-4111-8111-111111111111";
const OVER = "https://tiba.rizqey.com/r/22222222-2222-4222-8222-222222222222";

test("receipt links come from arguments or environment settings", () => {
  const fromArgs = parseDemoArgs(["--check", "--paid", PAID, "--wrong-job", WRONG, "--overcharge", OVER]);
  assert.equal(fromArgs.mode, "check");
  assert.equal(fromArgs.paid, PAID);
  assert.equal(fromArgs.wrongJob, WRONG);
  assert.equal(fromArgs.overcharge, OVER);
  assert.deepEqual(fromArgs.errors, []);

  const fromEnv = parseDemoArgs(["--record"], {
    DEMO_PAID_RECEIPT: PAID,
    DEMO_WRONG_JOB_RECEIPT: WRONG,
    DEMO_OVERCHARGE_RECEIPT: OVER,
    DEMO_BASE_URL: "https://tiba.rizqey.com/"
  });
  assert.equal(fromEnv.mode, "record");
  assert.equal(fromEnv.paid, PAID);
  assert.equal(fromEnv.base, "https://tiba.rizqey.com/");
  assert.deepEqual(fromEnv.errors, []);
});

test("check mode refuses to run until both refusal links exist", () => {
  const config = parseDemoArgs(["--check", "--paid", PAID]);
  assert.equal(config.mode, "check");
  assert.ok(config.errors.some((line) => line.startsWith("The wrong-job refusal")));
  assert.ok(config.errors.some((line) => line.startsWith("The small-overcharge refusal")));
  assert.equal(receiptProblems({ paid: "notaurl", wrongJob: "", overcharge: "file:///tmp/r/x", base: "https://tiba.rizqey.com" }).length >= 3, true);
});

test("--check does not record and does not reset the ledger", () => {
  const run = spawnSync(process.execPath, ["scripts/record-demo.mjs", "--check"], { encoding: "utf8" });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.notEqual(run.status, 0);
  assert.match(output, /wrong-job refusal/);
  assert.match(output, /small-overcharge refusal/);
  assert.doesNotMatch(output, /demo:reset/);
  assert.doesNotMatch(output, /Recording/);
  assert.equal(run.stdout.includes("MP4:"), false);
});

test("a paid page must show Solana devnet, and the explorer link must be devnet", async () => {
  const paidHtml = `<a href="https://explorer.solana.com/tx/abc?cluster=devnet">view</a>
    Paid on Solana devnet. Check 2 — read your own records. Both checks agreed.`;
  const href = solanaDevnetExplorerHref(paidHtml, PAID);
  assert.equal(href, "https://explorer.solana.com/tx/abc?cluster=devnet");
  assert.equal(solanaDevnetExplorerHref(`<a href="https://explorer.solana.com/tx/abc?cluster=mainnet-beta">x</a>`, PAID), null);

  const [paid] = await assessShots([{ id: "paid", url: PAID, phrases: ["Paid on Solana devnet", "your own records"] }], async () => ({
    text: paidHtml,
    url: PAID,
    status: 200
  }));
  assert.equal(paid.ok, true);

  const [explorer] = await assessShots([explorerShot(href)], async (shot) => ({
    text: "Transaction",
    url: shot.url,
    status: 200
  }));
  assert.equal(explorer.ok, true, formatResult(explorer));

  const [blocked] = await assessShots([explorerShot(href)], async (shot) => ({
    text: "",
    url: shot.url,
    status: 429
  }));
  assert.equal(blocked.ok, false);
});

test("the two refusals are told apart by the words on the page", async () => {
  const { pages } = demoShots({ paid: PAID, wrongJob: WRONG, overcharge: OVER, base: "https://tiba.rizqey.com" });
  const wrong = pages.find((shot) => shot.id === "wrong-job");
  const over = pages.find((shot) => shot.id === "overcharge");
  const wrongText = "Refused. The bill. The record. Work order WO-A on the bill, WO-B on the record. The two checks named different invoices.";
  const overText = "Refused. The bill. The record. Amount 5.10 USDC on the bill, 5.00 USDC on the record. The two checks named different amounts.";

  const [wrongOk] = await assessShots([wrong], async () => ({ text: wrongText, url: WRONG, status: 200 }));
  const [overOk] = await assessShots([over], async () => ({ text: overText, url: OVER, status: 200 }));
  const [swapped] = await assessShots([over], async () => ({ text: wrongText, url: OVER, status: 200 }));
  assert.equal(wrongOk.ok, true, formatResult(wrongOk));
  assert.equal(overOk.ok, true, formatResult(overOk));
  assert.equal(swapped.ok, false);
  assert.ok(swapped.missing.includes("different amounts") || swapped.forbidden.includes("different invoices"));
});

test("source files still say what the demo claims", () => {
  const prompt = readSource(sourceShots().find((shot) => shot.id === "prompt")).text.split("\n");
  assert.match(prompt[34], /You will never receive the artifact/);

  assert.deepEqual(new Set(CANDIDATES.artifact), new Set(CANDIDATES.payer_record));
  assert.equal(CANDIDATES.artifact.length, 2);
  const gonka = readSource(sourceShots().find((shot) => shot.id === "models")).text.split("\n");
  assert.match(gonka[18], /Artifact asks/);
  assert.match(gonka[19], /OpenAI first/);
  assert.match(gonka[19], /Alibaba first/);
  assert.match(gonka[21], /openai\/gpt-oss-120b/);
  assert.match(gonka[21], /qwen\/qwen3\.8-27b/);
  assert.match(gonka[22], /qwen\/qwen3\.8-27b/);
  assert.match(gonka[22], /openai\/gpt-oss-120b/);

  for (const shot of sourceShots()) {
    const missing = missingPhrases(readSource(shot).text, shot.phrases);
    assert.deepEqual(missing, [], shot.file);
  }

  const previous = process.env.RAIL;
  delete process.env.RAIL;
  try {
    assert.equal(configuredRail(), "solana");
  } finally {
    if (previous === undefined) delete process.env.RAIL;
    else process.env.RAIL = previous;
  }
  assert.equal(onboardingRail({ signedIn: true, userLiveWorkspaces: 0, liveWorkspacesToday: 0, dailyCap: 20 }), "solana");
  assert.equal(onboardingRail({ signedIn: false, userLiveWorkspaces: 0, liveWorkspacesToday: 0, dailyCap: 20 }), "mock");
});

test("spoken lines fit under three minutes", () => {
  const lines = readFileSync("docs/DEMO_SCRIPT.md", "utf8").split("\n");
  const cues = [];
  let time = null;
  let words = [];
  const flush = () => {
    if (time !== null && words.length) cues.push({ t: time, text: words.join(" ") });
  };
  for (const raw of lines) {
    const trimmed = raw.trim();
    const match = /^(?:#+\s*)?(\d+):(\d{2})\s*-\s*(.*)$/.exec(trimmed);
    if (match) {
      flush();
      time = Number(match[1]) * 60 + Number(match[2]);
      words = [];
      const rest = match[3].trim();
      if (rest && !raw.startsWith("#")) words.push(rest);
    } else if (trimmed && time !== null && !trimmed.startsWith("#")) {
      words.push(trimmed);
    }
  }
  flush();

  assert.equal(cues[0].t, 0);
  assert.ok(cues.length >= 8);
  const end = RECORD_END_MS / 1000;
  assert.ok(end <= 180);
  for (let i = 0; i < cues.length; i += 1) {
    const count = cues[i].text.split(/\s+/).filter(Boolean).length;
    const next = i + 1 < cues.length ? cues[i + 1].t : end;
    assert.ok(next - cues[i].t >= count / 2.2, `${cues[i].t}s has ${count} words and only ${next - cues[i].t}s`);
  }
  assert.match(cues.map((cue) => cue.text).join(" "), /test network/i);
  assert.match(cues.map((cue) => cue.text).join(" "), /No real money/);
});

test("the recorder only resets the ledger in the old tour", () => {
  const source = readFileSync("scripts/record-demo.mjs", "utf8");
  const legacyAt = source.indexOf("async function legacyTour");
  const resetAt = source.indexOf("demo:reset");
  assert.ok(legacyAt > 0);
  assert.ok(resetAt > legacyAt);
  assert.equal(source.slice(0, legacyAt).includes("demo:reset"), false);
  assert.equal(source.includes("recordVideo"), true);
});
