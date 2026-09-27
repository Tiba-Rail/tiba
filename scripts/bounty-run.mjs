#!/usr/bin/env node
// Solana devnet USDC only. No real money.
//
// Faris uses this to pay a program's winner list (Superteam Malaysia, KrackedDevs, and
// the same shape of list) from a workspace he already has. It does not create a workspace.
//
//   node scripts/bounty-run.mjs --dry-run scripts/samples/bounty-winners.sample.csv
//   TIBA_OWNER_KEY=... TIBA_AGENT_KEY=... node scripts/bounty-run.mjs winners.csv
//
// CSV columns: winner_name, solana_address, amount_usdc, bounty_ref, claim_text
//
// For each winner the script creates a recipient, opens a work order whose payer record
// is the bounty amount (both checks required), then submits the claim. The idempotency
// key is bounty-<bounty_ref>-<row>, where row starts at 1 in file order.
//
// TIBA_OWNER_KEY creates recipients and work orders. TIBA_AGENT_KEY submits claims.
// Both come from the environment only. This script never reads a key from a file and
// never prints one. --dry-run checks the CSV and prints the requests. It calls nothing.
//
// A real run sends devnet test USDC. Do that only after Faris says yes.
// The same file again will not open a second work order: those refs are unique.
// If a bounty is above the workspace's per-payment limit, Tiba refuses and no test USDC moves.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PublicKey } from "@solana/web3.js";

export const CSV_COLUMNS = ["winner_name", "solana_address", "amount_usdc", "bounty_ref", "claim_text"];
export const WORK_ORDER_WINDOW_MS = 30 * 24 * 3600 * 1000;
export const BANNER = "Solana devnet USDC only. No real money.";
const DEFAULT_BASE = "https://tiba.rizqey.com";

export function isSolanaAddress(value) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function parseAmountUsdc(value) {
  const trimmed = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (whole.length > 12) return null;
  const micros = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (micros <= 0n) return null;
  return { amountUsdc: trimmed, micros: micros.toString() };
}

/** Same spelling the receipt uses: 10.50 becomes "10.5 USDC", 25 becomes "25.00 USDC". */
export function formatUsdc(micros) {
  const value = BigInt(micros);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ".00"} USDC`;
}

export function refSlug(value) {
  const slug = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "bounty";
}

export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (quoted) return { rows: [], error: "A quoted field was not closed." };
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return { rows, error: null };
}

function nonemptyRows(table) {
  const rows = [];
  for (let index = 0; index < table.length; index += 1) {
    if (table[index].every((cell) => cell.trim() === "")) continue;
    rows.push({ line: index + 1, cells: table[index] });
  }
  return rows;
}

export function parseWinners(text) {
  const parsed = parseCsv(text);
  if (parsed.error) return { winners: [], errors: [parsed.error] };
  const rows = nonemptyRows(parsed.rows);
  if (rows.length === 0) {
    return { winners: [], errors: ["The CSV has no header. It needs winner_name, solana_address, amount_usdc, bounty_ref, claim_text."] };
  }

  const header = rows[0].cells.map((cell) => cell.trim());
  const duplicates = header.filter((name, index) => name && header.indexOf(name) !== index);
  if (duplicates.length > 0) return { winners: [], errors: [`Repeated column: ${duplicates[0]}.`] };
  const missing = CSV_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return { winners: [], errors: [`Missing column ${missing.join(", ")}. The header must include ${CSV_COLUMNS.join(", ")}.`] };
  }

  const winners = [];
  const errors = [];
  for (let index = 1; index < rows.length; index += 1) {
    const { line, cells } = rows[index];
    const record = {};
    header.forEach((name, cellIndex) => {
      if (!name || record[name] !== undefined) return;
      record[name] = (cells[cellIndex] ?? "").trim();
    });
    const row = index;
    const where = `Row ${row} (line ${line})`;
    const winnerName = record.winner_name;
    const solanaAddress = record.solana_address;
    const bountyRef = record.bounty_ref;
    const claimText = record.claim_text;
    const amount = parseAmountUsdc(record.amount_usdc);

    if (!winnerName) errors.push(`${where}: winner_name is empty.`);
    else if (/[\r\n]/.test(winnerName) || winnerName.length > 120) errors.push(`${where}: winner_name must be one line, 120 characters or fewer.`);
    if (!solanaAddress || !isSolanaAddress(solanaAddress)) errors.push(`${where}: solana_address is not a Solana address.`);
    if (!amount) errors.push(`${where}: amount_usdc must be more than zero, with up to 6 decimal places.`);
    if (!bountyRef) errors.push(`${where}: bounty_ref is empty.`);
    else if (/[\r\n]/.test(bountyRef) || bountyRef.length > 80) errors.push(`${where}: bounty_ref must be one line, 80 characters or fewer.`);
    if (!claimText) errors.push(`${where}: claim_text is empty.`);
    else if (claimText.length > 8000) errors.push(`${where}: claim_text is longer than 8000 characters.`);
    if (!winnerName || !solanaAddress || !isSolanaAddress(solanaAddress) || !amount || !bountyRef || /[\r\n]/.test(bountyRef) || bountyRef.length > 80 || !claimText || claimText.length > 8000 || /[\r\n]/.test(winnerName) || winnerName.length > 120) {
      continue;
    }

    winners.push({
      row,
      line,
      winnerName,
      solanaAddress,
      amountUsdc: amount.amountUsdc,
      micros: amount.micros,
      bountyRef,
      claimText
    });
  }

  if (winners.length === 0 && errors.length === 0) errors.push("The CSV has no winners.");

  const seenKeys = new Map();
  const seenOrders = new Map();
  for (const winner of winners) {
    const idempotencyKey = `bounty-${winner.bountyRef}-${winner.row}`;
    const workOrderRef = `WO-${refSlug(winner.bountyRef)}-${winner.row}`;
    if (seenKeys.has(idempotencyKey)) errors.push(`Row ${winner.row} reuses idempotency key ${idempotencyKey} from row ${seenKeys.get(idempotencyKey)}.`);
    else seenKeys.set(idempotencyKey, winner.row);
    if (seenOrders.has(workOrderRef)) errors.push(`Row ${winner.row} reuses work order ${workOrderRef} from row ${seenOrders.get(workOrderRef)}.`);
    else seenOrders.set(workOrderRef, winner.row);
  }

  return { winners: errors.length > 0 ? [] : winners, errors };
}

export function baseFrom(env) {
  const raw = typeof env.TIBA_BASE === "string" && env.TIBA_BASE.trim() ? env.TIBA_BASE.trim() : DEFAULT_BASE;
  return raw.replace(/\/$/, "");
}

export function networkBlock(env) {
  const cluster = String(env.SOLANA_NETWORK ?? env.SOLANA_CLUSTER ?? "").trim().toLowerCase();
  if (cluster && cluster !== "devnet") return "Tiba bounty runs are Solana devnet only.";
  if (String(env.TIBA_BASE ?? "").toLowerCase().includes("mainnet")) return "Tiba bounty runs are Solana devnet only.";
  return null;
}

function secret(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function readKeys(env) {
  return { owner: secret(env.TIBA_OWNER_KEY), agent: secret(env.TIBA_AGENT_KEY) };
}

export function buildPlan(winner, { base, now }) {
  const slug = refSlug(winner.bountyRef);
  const recipientRef = `bounty-${slug}-${winner.row}`;
  const workOrderRef = `WO-${slug}-${winner.row}`;
  const idempotencyKey = `bounty-${winner.bountyRef}-${winner.row}`;
  const amountLabel = formatUsdc(winner.micros);
  const expiresAt = new Date(now + WORK_ORDER_WINDOW_MS).toISOString();
  // The live work-orders route stores payer_record only when the field is a JSON string,
  // which is also how the invoices form sends it. An object is ignored and the record stays empty.
  const payerRecord = JSON.stringify({
    approved_amount_micros: winner.micros,
    delivery_status: "verified_complete",
    source: "bounty-run",
    bounty_ref: winner.bountyRef
  });
  const artifact = [
    "DELIVERY NOTE",
    `Work order: ${workOrderRef}`,
    `Bounty: ${winner.bountyRef}`,
    `Winner: ${winner.winnerName}`,
    `Delivered: ${winner.claimText}`,
    `Amount due: ${amountLabel}`,
    "Signed: bounty-run"
  ].join("\n");
  const origin = base.replace(/\/$/, "");

  return {
    row: winner.row,
    line: winner.line,
    winnerName: winner.winnerName,
    bountyRef: winner.bountyRef,
    amountLabel,
    micros: winner.micros,
    solanaAddress: winner.solanaAddress,
    claimText: winner.claimText,
    recipientRef,
    workOrderRef,
    idempotencyKey,
    requests: [
      {
        method: "POST",
        url: `${origin}/api/v1/recipients`,
        keyEnv: "TIBA_OWNER_KEY",
        body: {
          ref: recipientRef,
          display_name: winner.winnerName,
          solana_address: winner.solanaAddress
        }
      },
      {
        method: "POST",
        url: `${origin}/api/v1/work-orders`,
        keyEnv: "TIBA_OWNER_KEY",
        body: {
          ref: workOrderRef,
          recipient_ref: recipientRef,
          ceiling_usdc: winner.amountUsdc,
          expires_at: expiresAt,
          required_channels: "both",
          brief_text: `Bounty ${winner.bountyRef} for ${winner.winnerName}. Pay the approved amount on this record when the delivery note matches.`,
          payer_record: payerRecord
        }
      },
      {
        method: "POST",
        url: `${origin}/api/v1/intents`,
        keyEnv: "TIBA_AGENT_KEY",
        body: {
          idempotency_key: idempotencyKey,
          recipient_ref: recipientRef,
          artifact
        }
      }
    ]
  };
}

export function buildPlans(winners, options) {
  return winners.map((winner) => buildPlan(winner, options));
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function formatDryRun(plans, { ownerKeySet, agentKeySet }) {
  const lines = [
    BANNER,
    `Dry run. Checked ${plans.length} ${plans.length === 1 ? "winner" : "winners"}. Nothing was sent.`,
    "",
    `TIBA_OWNER_KEY: ${ownerKeySet ? "present" : "missing"}`,
    `TIBA_AGENT_KEY: ${agentKeySet ? "present" : "missing"}`,
    "",
    "| Winner | Bounty | Amount | Idempotency key |",
    "| --- | --- | --- | --- |"
  ];
  for (const plan of plans) {
    lines.push(`| ${cell(plan.winnerName)} | ${cell(plan.bountyRef)} | ${cell(plan.amountLabel)} | ${cell(plan.idempotencyKey)} |`);
  }
  lines.push("");
  for (const plan of plans) {
    lines.push(`## Row ${plan.row} — ${plan.winnerName} — ${plan.bountyRef} — ${plan.amountLabel}`);
    lines.push("");
    for (const request of plan.requests) {
      lines.push(`${request.method} ${request.url}`);
      lines.push(`Authorization: Bearer (${request.keyEnv})`);
      lines.push("");
      lines.push(JSON.stringify(request.body, null, 2));
      lines.push("");
    }
  }
  lines.push("No receipts yet. This was a dry run.");
  return `${lines.join("\n")}\n`;
}

export function outcomeWord({ decisionClass, status }) {
  if (decisionClass === "PAID" || status === "settled") return "PAID";
  if (decisionClass === "RED" || status === "refused") return "REFUSED";
  if (decisionClass === "AMBER" || status === "held" || status === "processing") return "HELD";
  return null;
}

/** Same sentences as the console, so this summary and the receipt agree. */
export function plainReason(outcome, reasonCode, chain) {
  if (outcome === "PAID") {
    if (chain === "mock") return "Both checks agreed, but this wallet is simulated. No devnet USDC moved.";
    return "Both checks agreed, the limits passed, and the test transfer completed.";
  }
  if (outcome === "HELD") {
    switch (reasonCode) {
      case "HUMAN_REVIEW_REQUIRED": return "This amount is large enough that your limits require you to decide.";
      case "INFERENCE_UNAVAILABLE": return "Neither check could run, so the payment is held for approval.";
      case "MISSING_PAYER_RECORD":
      case "MISSING_REQUIRED_CHANNEL": return "Your own records could not be read, so the payment is held for approval.";
      case "SCHEMA_INVALID": return "A check returned an unreadable answer, so the payment is held for approval.";
      case "REQUEST_REJECTED": return "The reading service turned the request away, so the payment is held for approval.";
      default: return "Held for approval.";
    }
  }
  if (typeof reasonCode === "string" && reasonCode.startsWith("QUORUM_SPLIT")) {
    if (reasonCode === "QUORUM_SPLIT:work_order_id") return "The two checks named different invoices.";
    if (reasonCode === "QUORUM_SPLIT:amount_micros") return "The two checks named different amounts.";
    if (reasonCode === "QUORUM_SPLIT:delivery_timestamp") return "The two checks gave different delivery dates.";
    return "The two checks disagreed.";
  }
  switch (reasonCode) {
    case "DAY_AMOUNT_CAP": return "This would take your software past its daily spending limit.";
    case "HOUR_AMOUNT_CAP": return "This would take your software past its hourly spending limit.";
    case "DAY_COUNT_CAP": return "Your software has already made its maximum number of payments today.";
    case "HOUR_COUNT_CAP": return "Your software has already made its maximum number of payments this hour.";
    case "TRANSACTION_CEILING": return "The amount is more than any single payment may be.";
    case "WORK_ORDER_CEILING": return "The amount is more than this invoice allows.";
    case "WORK_ORDER_EXPIRED": return "The invoice named has passed its deadline.";
    case "WORK_ORDER_NOT_OPEN": return "The invoice named is closed.";
    case "NO_OPEN_OBLIGATION": return "No invoice awaiting delivery matches this delivery note.";
    case "RECIPIENT_NOT_FOUND": return "This recipient is not saved.";
    case "RECIPIENT_INACTIVE": return "This recipient is saved but blocked.";
    case "RECIPIENT_UNVERIFIED": return "This recipient's identity is not verified, and your limits require it.";
    case "KILL_SWITCH": return "The wallet is frozen.";
    case "INVALID_AMOUNT": return "The amount in this request was not valid.";
    case "INVALID_TIMESTAMP": return "A date in this request was not valid.";
    case "RECIPIENT_NEEDS_SOLANA_ADDRESS": return "Recipient needs a Solana address.";
    case "SETTLEMENT_FAILED":
    case "SOLANA_EXECUTION_FAILED":
    case "TEMPO_EXECUTION_FAILED":
      return "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.";
    default:
      return "Refused before any money moved.";
  }
}

const REQUEST_ERRORS = {
  UNAUTHORIZED: "Wrong owner key or agent key.",
  INVALID_REQUEST: "Tiba rejected the request as invalid.",
  RECIPIENT_NOT_FOUND: "That recipient is not saved.",
  RECIPIENT_REF_TAKEN: "Another wallet already uses that short ID.",
  RECIPIENT_NEEDS_SOLANA_ADDRESS: "Add a Solana wallet address.",
  INVALID_SOLANA_ADDRESS: "That is not a valid Solana address.",
  INVALID_PAYER_RECORD_JSON: "The payer record was not valid JSON.",
  INVALID_JSON: "Tiba could not read the request."
};

function stepName(url) {
  if (url.endsWith("/api/v1/recipients")) return "Recipient";
  if (url.endsWith("/api/v1/work-orders")) return "Work order";
  if (url.endsWith("/api/v1/intents")) return "Claim";
  return "Request";
}

export function requestFailure(url, status, payload) {
  const code = payload && typeof payload.error === "string" ? payload.error : "";
  const detail = code ? (REQUEST_ERRORS[code] ?? `Tiba returned ${code}.`) : `Tiba returned HTTP ${status}.`;
  return `${stepName(url)}: ${detail}`;
}

export function formatReceiptTable(results) {
  const lines = [
    "| Winner | Bounty | Amount | Result | Reason | Receipt |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const result of results) {
    lines.push(`| ${cell(result.winnerName)} | ${cell(result.bountyRef)} | ${cell(result.amountLabel)} | ${cell(result.outcome)} | ${cell(result.reason)} | ${cell(result.receipt || "—")} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatOwnerSummary(results) {
  const lines = [
    "For the program owner",
    "",
    "Solana devnet test USDC only. No real money.",
    ""
  ];
  const groups = [];
  for (const result of results) {
    let group = groups.find((entry) => entry.bountyRef === result.bountyRef);
    if (!group) {
      group = { bountyRef: result.bountyRef, rows: [] };
      groups.push(group);
    }
    group.rows.push(result);
  }
  for (const group of groups) {
    const paid = group.rows.filter((row) => row.outcome === "PAID").length;
    const refused = group.rows.filter((row) => row.outcome === "REFUSED").length;
    const held = group.rows.filter((row) => row.outcome === "HELD").length;
    const other = group.rows.length - paid - refused - held;
    const counts = `${group.rows.length} ${group.rows.length === 1 ? "winner" : "winners"}, ${paid} paid, ${refused} refused, ${held} held`;
    lines.push(`${group.bountyRef}: ${counts}${other ? `, ${other} not sent` : ""}.`);
    for (const row of group.rows) {
      const link = row.receipt ? ` ${row.receipt}` : "";
      lines.push(`- ${row.winnerName}: ${row.outcome}, ${row.amountLabel}. ${row.reason}${link}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatRunReport(results) {
  return `${BANNER}\n\n${formatReceiptTable(results)}\n${formatOwnerSummary(results)}`;
}

function resultShell(plan) {
  return {
    winnerName: plan.winnerName,
    bountyRef: plan.bountyRef,
    amountLabel: plan.amountLabel,
    idempotencyKey: plan.idempotencyKey
  };
}

async function postJson(fetchImpl, request, key, timeoutMs) {
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { ok: response.ok, status: response.status, payload };
}

export async function sendPlan(plan, keys, { fetchImpl = fetch, base }) {
  const steps = [
    { request: plan.requests[0], key: keys.owner, timeoutMs: 30_000 },
    { request: plan.requests[1], key: keys.owner, timeoutMs: 30_000 },
    { request: plan.requests[2], key: keys.agent, timeoutMs: 180_000 }
  ];
  let intent = null;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    let response;
    try {
      response = await postJson(fetchImpl, step.request, step.key, step.timeoutMs);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const reason = timedOut
        ? (index === 2
          ? "The claim was sent but no result came back in time. Check the ledger before sending this row again. The same idempotency key returns the first result."
          : "Tiba did not answer in time. This row was not finished.")
        : "Could not reach Tiba. This row was not finished.";
      return { ...resultShell(plan), outcome: "NOT SENT", reason, receipt: "" };
    }
    if (!response.ok || !response.payload || typeof response.payload !== "object") {
      return {
        ...resultShell(plan),
        outcome: "NOT SENT",
        reason: requestFailure(step.request.url, response.status, response.payload),
        receipt: ""
      };
    }
    if (index === 2) intent = response.payload;
  }

  const decisionClass = typeof intent.decision_class === "string" ? intent.decision_class : "";
  const status = typeof intent.status === "string" ? intent.status : "";
  const reasonCode = typeof intent.reason_code === "string" ? intent.reason_code : null;
  const chain = typeof intent.chain === "string" ? intent.chain : null;
  const token = typeof intent.public_token === "string" ? intent.public_token : "";
  const outcome = outcomeWord({ decisionClass, status }) ?? "HELD";
  const origin = base.replace(/\/$/, "");
  return {
    ...resultShell(plan),
    outcome,
    reason: plainReason(outcome, reasonCode, chain),
    receipt: token ? `${origin}/r/${token}` : ""
  };
}

function redact(text, secrets) {
  let out = String(text);
  for (const secretValue of secrets) {
    if (secretValue) out = out.split(secretValue).join("[redacted]");
  }
  return out;
}

function usage() {
  return [
    "Usage: node scripts/bounty-run.mjs [--dry-run] <winners.csv>",
    "",
    "CSV columns: winner_name, solana_address, amount_usdc, bounty_ref, claim_text",
    BANNER,
    "",
    "--dry-run  Check the file and print the requests. Calls nothing.",
    "Keys (a real run only): TIBA_OWNER_KEY and TIBA_AGENT_KEY, from the environment.",
    "Never put those keys in the CSV. TIBA_BASE defaults to https://tiba.rizqey.com.",
    ""
  ].join("\n");
}

export async function runCli(argv, env, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text) => process.stderr.write(text));
  const readFile = io.readFile ?? ((filePath) => readFileSync(filePath, "utf8"));
  const fetchImpl = io.fetch ?? fetch;
  const now = io.now ?? Date.now();
  const keys = readKeys(env);
  const secrets = [keys.owner, keys.agent].filter(Boolean);
  const writeOut = (text) => stdout(redact(text, secrets));
  const writeErr = (text) => stderr(redact(text, secrets));

  if (argv.includes("--help") || argv.includes("-h")) {
    writeOut(usage());
    return 0;
  }

  const dryRun = argv.includes("--dry-run");
  const file = argv.find((arg) => arg !== "--dry-run" && !arg.startsWith("-"));
  if (!file) {
    writeErr(usage());
    return 1;
  }

  const blocked = networkBlock(env);
  if (blocked) {
    writeErr(`${blocked}\n`);
    return 1;
  }

  let text;
  try {
    text = readFile(file);
  } catch {
    writeErr("Could not read that CSV. Pass the path to the winners file.\n");
    return 1;
  }

  const { winners, errors } = parseWinners(text);
  if (errors.length > 0) {
    writeErr(`${errors.join("\n")}\n`);
    writeOut(dryRun ? "Dry run stopped. Nothing was sent.\n" : "Nothing was sent.\n");
    return 1;
  }

  const base = baseFrom(env);
  const plans = buildPlans(winners, { base, now });
  if (dryRun) {
    writeOut(formatDryRun(plans, { ownerKeySet: Boolean(keys.owner), agentKeySet: Boolean(keys.agent) }));
    return 0;
  }

  const missing = [];
  if (!keys.owner) missing.push("TIBA_OWNER_KEY");
  if (!keys.agent) missing.push("TIBA_AGENT_KEY");
  if (missing.length > 0) {
    writeErr(`Set ${missing.join(" and ")} in the environment. Keys are not read from files.\n`);
    writeOut("Nothing was sent.\n");
    return 1;
  }

  const results = [];
  for (const plan of plans) {
    writeErr(`Row ${plan.row}/${plans.length} ${plan.winnerName}: recipient, work order, then claim.\n`);
    results.push(await sendPlan(plan, keys, { fetchImpl, base }));
  }
  writeOut(formatRunReport(results));
  return results.some((result) => result.outcome === "NOT SENT") ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2), process.env);
}
