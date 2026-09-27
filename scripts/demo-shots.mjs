// Shot list for the Colosseum technical demo.
// Receipt links are arguments or environment settings. This file does not
// record, pay, or talk to a network. scripts/record-demo.mjs does the loading.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Last moment of the recording, in ms. 2:56, under the 3:00 cap. */
export const RECORD_END_MS = 176_000;

export const BEATS = [
  { id: "home", atMs: 0 },
  { id: "payer-record", atMs: 14_000 },
  { id: "paid", atMs: 34_000 },
  { id: "explorer", atMs: 50_000 },
  { id: "wrong-job", atMs: 68_000 },
  { id: "overcharge", atMs: 86_000 },
  { id: "prompt", atMs: 104_000 },
  { id: "models", atMs: 126_000 },
  { id: "rails", atMs: 146_000 },
  { id: "close", atMs: 164_000 }
];

const PAID_PHRASES = [
  "Paid on Solana devnet",
  "Check 2",
  "your own records",
  "Both checks agreed"
];

const REFUSAL_SHARED = ["Refused", "The bill", "The record", "on the bill", "on the record"];

export function usage() {
  return [
    "Technical demo recorder. Test network only. Does not create a payment.",
    "",
    "Check that each page loads and shows the expected words (no recording):",
    "  node scripts/record-demo.mjs --check \\",
    "    --paid https://tiba.rizqey.com/r/<paid-token> \\",
    "    --wrong-job https://tiba.rizqey.com/r/<wrong-job-token> \\",
    "    --overcharge https://tiba.rizqey.com/r/<overcharge-token>",
    "",
    "Record the shot list in docs/DEMO_SCRIPT.md (only after those receipts exist):",
    "  node scripts/record-demo.mjs --record --paid <url> --wrong-job <url> --overcharge <url>",
    "",
    "The same links can be environment settings:",
    "  DEMO_PAID_RECEIPT, DEMO_WRONG_JOB_RECEIPT, DEMO_OVERCHARGE_RECEIPT, DEMO_BASE_URL",
    "",
    "The old ledger tour, which resets demo data, is only:",
    "  node scripts/record-demo.mjs --legacy-tour",
    "",
    "Narration, after a silent mp4 exists:",
    "  python scripts/narrate.py docs/DEMO_SCRIPT.md <silent.mp4> <out.mp4> <workdir>"
  ].join("\n");
}

export function parseDemoArgs(argv, env = {}) {
  const config = {
    mode: "usage",
    help: false,
    paid: env.DEMO_PAID_RECEIPT?.trim() ?? "",
    wrongJob: env.DEMO_WRONG_JOB_RECEIPT?.trim() ?? "",
    overcharge: env.DEMO_OVERCHARGE_RECEIPT?.trim() ?? "",
    base: env.DEMO_BASE_URL?.trim() || "https://tiba.rizqey.com",
    errors: []
  };

  const setMode = (next) => {
    config.mode = config.mode === "usage" || config.mode === next ? next : "conflict";
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) return "";
      i += 1;
      return value.trim();
    };
    if (arg === "--help" || arg === "-h") config.help = true;
    else if (arg === "--check") setMode("check");
    else if (arg === "--record") setMode("record");
    else if (arg === "--legacy-tour") setMode("legacy-tour");
    else if (arg === "--paid") config.paid = next();
    else if (arg === "--wrong-job") config.wrongJob = next();
    else if (arg === "--overcharge") config.overcharge = next();
    else if (arg === "--base") config.base = next() || config.base;
    else config.errors.push(`Unknown argument: ${arg}`);
  }

  if (config.help) config.mode = "help";
  if (config.mode === "conflict") {
    config.errors.push("Pass either --check or --record, not both.");
  }
  if ((config.mode === "check" || config.mode === "record") && config.errors.length === 0) {
    config.errors.push(...receiptProblems(config));
  }
  return config;
}

function linkProblem(label, value, receipt) {
  if (!value) {
    return `${label} is missing. Pass the link when that page exists.`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return `${label} is not a link.`;
  }
  if (url.username || url.password) return `${label} must not carry a username or password.`;
  if (url.protocol !== "http:" && url.protocol !== "https:") return `${label} must start with http:// or https://.`;
  if (receipt && !url.pathname.includes("/r/")) return `${label} must be a receipt link. Its path should contain /r/.`;
  return null;
}

export function receiptProblems(config) {
  return [
    linkProblem("The paid receipt", config.paid, true),
    linkProblem("The wrong-job refusal", config.wrongJob, true),
    linkProblem("The small-overcharge refusal", config.overcharge, true),
    linkProblem("The site address", config.base, false)
  ].filter(Boolean);
}

export function demoShots(config) {
  const base = config.base.replace(/\/$/, "");
  return {
    pages: [
      {
        id: "home",
        url: `${base}/`,
        phrases: ["test network", "no real money", "Tempo", "Zcash", "Built and tested", "not live", "home rail"]
      },
      {
        id: "payer-record",
        url: `${base}/try`,
        phrases: ["Payer's record", "Work order", "Approved", "no money sent"]
      },
      {
        id: "paid",
        url: config.paid,
        phrases: PAID_PHRASES
      },
      {
        id: "wrong-job",
        url: config.wrongJob,
        phrases: [...REFUSAL_SHARED, "Work order", "different invoices"]
      },
      {
        id: "overcharge",
        url: config.overcharge,
        phrases: [...REFUSAL_SHARED, "Amount", "different amounts"],
        forbid: ["different invoices"]
      }
    ],
    files: sourceShots()
  };
}

export function sourceShots() {
  return [
    {
      id: "prompt",
      file: "src/lib/prompts.ts",
      focusLine: 35,
      phrases: ["You will never receive the artifact"]
    },
    {
      id: "models",
      file: "src/lib/gonka.ts",
      focusLine: 22,
      phrases: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "OpenAI first", "Alibaba first"]
    },
    {
      id: "rails",
      file: "src/lib/rails/index.ts",
      focusLine: 55,
      phrases: ['?? "solana"', 'if (rail === "tempo")', 'if (name === "zcash")']
    },
    {
      id: "tempo-code",
      file: "src/lib/rails/evm.ts",
      focusLine: 16,
      phrases: ["TEMPO_MODERATO_CHAIN_ID", "explore.testnet.tempo.xyz"]
    },
    {
      id: "zcash-code",
      file: "src/lib/rails/zcash.ts",
      focusLine: 24,
      phrases: ["ZCASH_NETWORK_NOT_TESTNET", "testnet"]
    }
  ];
}

export function explorerShot(url) {
  return {
    id: "explorer",
    url,
    phrases: ["devnet"],
    phrasesIn: "text-or-url",
    urlIncludes: ["explorer.solana.com/tx/", "cluster=devnet"],
    requireOkStatus: true
  };
}

/** First Solana devnet transaction link in a receipt page. */
export function solanaDevnetExplorerHref(html, pageUrl) {
  const re = /href\s*=\s*"([^"]*explorer\.solana\.com[^"]*)"/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1].replaceAll("&amp;", "&");
    try {
      const absolute = new URL(raw, pageUrl).href;
      if (absolute.includes("explorer.solana.com/tx/") && absolute.includes("cluster=devnet")) return absolute;
    } catch {
      // skip a broken href
    }
  }
  return null;
}

export function missingPhrases(text, phrases) {
  const hay = text.toLowerCase();
  return phrases.filter((phrase) => !hay.includes(phrase.toLowerCase()));
}

export function presentPhrases(text, phrases) {
  const hay = text.toLowerCase();
  return phrases.filter((phrase) => hay.includes(phrase.toLowerCase()));
}

export async function assessShots(shots, load) {
  const results = [];
  for (const shot of shots) {
    try {
      const loaded = await load(shot);
      const text = loaded.text ?? "";
      const url = loaded.url ?? shot.url ?? shot.file ?? "";
      const hay = shot.phrasesIn === "text-or-url" ? `${text}\n${url}` : text;
      const missing = missingPhrases(hay, shot.phrases ?? []);
      const forbidden = presentPhrases(text, shot.forbid ?? []);
      const urlMissing = (shot.urlIncludes ?? []).filter((part) => !String(url).includes(part));
      const status = loaded.status;
      const statusBad = shot.requireOkStatus && !(status >= 200 && status < 400);
      results.push({
        id: shot.id,
        ok: missing.length === 0 && forbidden.length === 0 && urlMissing.length === 0 && !statusBad,
        url,
        missing,
        forbidden,
        urlMissing,
        status: statusBad ? status : undefined
      });
    } catch (error) {
      results.push({
        id: shot.id,
        ok: false,
        url: shot.url ?? shot.file ?? "",
        missing: [],
        forbidden: [],
        urlMissing: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

export function formatResult(result) {
  if (result.ok) return `ok  ${result.id}  ${result.url}`;
  const parts = [`FAIL  ${result.id}  ${result.url}`];
  if (result.error) parts.push(`  could not load: ${result.error}`);
  if (result.status) parts.push(`  HTTP ${result.status}`);
  if (result.status === 429 && result.id === "explorer") {
    parts.push("  The explorer did not show the transaction. Open that same link in a normal browser, then run the check again.");
  }
  if (result.missing?.length) parts.push(`  missing words: ${result.missing.join(" | ")}`);
  if (result.forbidden?.length) parts.push(`  unexpected words: ${result.forbidden.join(" | ")}`);
  if (result.urlMissing?.length) parts.push(`  link missing: ${result.urlMissing.join(" | ")}`);
  return parts.join("\n");
}

export function readSource(shot, root = process.cwd()) {
  const abs = resolve(root, shot.file);
  return { text: readFileSync(abs, "utf8"), url: abs, status: 200 };
}

/** Plain page of a source file, with one line marked, for the recording only. */
export function sourceCard(shot, root = process.cwd()) {
  const text = readSource(shot, root).text;
  const lines = text.split("\n");
  const body = lines
    .map((line, index) => {
      const number = String(index + 1).padStart(4, " ");
      const safe = line.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      const hit = index + 1 === shot.focusLine ? " class=\"hit\"" : "";
      return `<span${hit}>${number}  ${safe}</span>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${shot.file}</title>
  <style>
    body { margin: 0; background: #f6f4ef; color: #1c1917; }
    header { padding: 20px 24px 8px; font: 28px/1.2 Georgia, serif; }
    p { margin: 0; padding: 0 24px 12px; font: 14px/1.4 system-ui, sans-serif; }
    pre { margin: 0; padding: 8px 24px 32px; font: 15px/1.45 ui-monospace, monospace; white-space: pre-wrap; }
    .hit { background: #f3e2a4; }
  </style>
</head>
<body>
  <header>${shot.file}</header>
  <p>Line ${shot.focusLine}. Test network, no real money.</p>
  <pre>${body}</pre>
</body>
</html>`;
}
