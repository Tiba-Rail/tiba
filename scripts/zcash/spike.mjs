/**
 * One shielded Zcash testnet payment, then a viewing-key readback.
 *
 * Wallet files stay in ~/.tiba-zcash-spike (or ZCASH_HOME). The seed phrase
 * is never printed. See FEASIBILITY.md for why this is zingo-cli.
 *
 *   ZINGO_CLI=~/zingolib/target/release/zingo-cli node scripts/zcash/spike.mjs
 */
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = "https://testnet.zec.rocks:443";
const CHAIN = "testnet";
const WORK_ORDER_ID = "WO-ZCASH-SPIKE-1";
const MEMO = `Tiba payout ${WORK_ORDER_ID}`;
const SEND_ZATOSHIS = 100_000n;
const FAUCET_CLAIM_URL = "https://fauzec.com/api/v1/claim";
const FAUCET_DOC = "https://zechub.wiki/using-zcash/faucets";
const HOME = process.env.ZCASH_HOME || path.join(os.homedir(), ".tiba-zcash-spike");
const PAYER_DIR = path.join(HOME, "payer");
const RECIPIENT_DIR = path.join(HOME, "recipient");
const VIEW_DIR = path.join(HOME, "view-only");
const STATE_PATH = path.join(HOME, "state.json");
const ZINGO = process.env.ZINGO_CLI || path.join(os.homedir(), "zingolib", "target", "release", "zingo-cli");

function fail(stage, detail) {
  const message = `${stage} failed: ${detail}`;
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

function runZingo(dataDir, args, { timeoutMs = 12 * 60 * 1000, offline = false } = {}) {
  const prefix = ["--chain", CHAIN, "--data-dir", dataDir];
  if (offline) prefix.push("--offline");
  else prefix.push("--server", SERVER);
  const command = [...prefix, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(ZINGO, command, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out after ${timeoutMs}ms: zingo-cli ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`zingo-cli ${args.join(" ")} exited ${code}\n${stderr}\n${stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseJson(stdout) {
  const start = stdout.search(/[\[{]/);
  if (start < 0) throw new Error(`no JSON in zingo-cli output:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

function unifiedAddress(addressesJson) {
  const rows = Array.isArray(addressesJson) ? addressesJson : [];
  const row = rows.find((entry) => typeof entry.encoded_address === "string" && entry.encoded_address.startsWith("utest1"));
  if (!row) throw new Error(`no testnet unified address in:\n${JSON.stringify(addressesJson)}`);
  return row.encoded_address;
}

function shieldedZatoshis(balanceText) {
  const pools = ["ironwood", "orchard", "sapling"];
  let confirmed = 0n;
  let unconfirmed = 0n;
  for (const pool of pools) {
    confirmed += zatoshisField(balanceText, `confirmed_${pool}_balance`);
    unconfirmed += zatoshisField(balanceText, `unconfirmed_${pool}_balance`);
  }
  return { confirmed, unconfirmed };
}

function zatoshisField(text, name) {
  // Anchor at the start of the line. `unconfirmed_orchard_balance` contains
  // `confirmed_orchard_balance`, and a substring match treats a mempool note as spendable.
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${name}:\\s*([^\\n]+)`));
  if (!match) return 0n;
  const raw = match[1].trim().replaceAll("_", "").replaceAll(",", "");
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveState(state) {
  await mkdir(HOME, { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function walletExists(dir) {
  try {
    await access(path.join(dir, "zingo-wallet.dat"));
    return true;
  } catch {
    return false;
  }
}

async function ensureWallet(dir) {
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  const { stdout, stderr } = await runZingo(dir, ["--nosync", "addresses"], { timeoutMs: 3 * 60 * 1000 });
  const address = unifiedAddress(parseJson(stdout));
  return { address, ms: Date.now() - started, created: stderr.includes("Creating a new wallet") };
}

async function syncBalance(dir) {
  const started = Date.now();
  const { stdout } = await runZingo(dir, ["--waitsync", "balance"]);
  return { text: stdout, ms: Date.now() - started, ...shieldedZatoshis(stdout) };
}

async function claimFaucet(address) {
  const response = await fetch(FAUCET_CLAIM_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ network: "testnet", address })
  });
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail("faucet", `HTTP ${response.status} was not JSON: ${body.slice(0, 400)}`);
  }
  if (!response.ok || parsed.state === "failed" || parsed.outcome === "refused") {
    fail("faucet", `HTTP ${response.status} ${body.slice(0, 800)}`);
  }
  return parsed;
}

async function main() {
  await mkdir(HOME, { recursive: true });
  const state = await loadState();
  try {
    await readFile(ZINGO);
  } catch {
    fail("compile", `zingo-cli not found at ${ZINGO}. Build it with the command in FEASIBILITY.md.`);
  }

  console.log(`payer wallet: ${PAYER_DIR}`);
  const payer = await ensureWallet(PAYER_DIR, "payer");
  state.payerAddress = payer.address;
  state.walletCreateMs = payer.ms;
  await saveState(state);
  console.log(`payer address: ${payer.address}`);

  console.log("first sync (birthday is chain tip minus 100 blocks)");
  const firstSync = await syncBalance(PAYER_DIR);
  if (state.firstSyncMs == null) state.firstSyncMs = firstSync.ms;
  await saveState(state);
  console.log(`first sync took ${Math.round(firstSync.ms / 1000)}s`);
  console.log(firstSync.text.trim());

  let balance = firstSync;
  if (balance.confirmed < SEND_ZATOSHIS) {
    if (!state.faucet) {
      console.log("claiming 1 TAZ from fauzec.com");
      state.faucet = await claimFaucet(payer.address);
      state.faucet.claimedAt = new Date().toISOString();
      state.faucet.source = FAUCET_DOC;
      await saveState(state);
      console.log(JSON.stringify(state.faucet));
    } else {
      console.log("faucet already claimed; waiting for the note");
    }
    const deadline = Date.now() + 40 * 60 * 1000;
    while (balance.confirmed < SEND_ZATOSHIS) {
      if (Date.now() > deadline) {
        fail("faucet", `no spendable TAZ after 40 minutes. Last balance:\n${balance.text}`);
      }
      console.log(`confirmed ${balance.confirmed} zat, unconfirmed ${balance.unconfirmed} zat; syncing again`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      balance = await syncBalance(PAYER_DIR);
    }
  }
  state.fundedConfirmedZatoshis = balance.confirmed.toString();
  await saveState(state);

  const recipient = await ensureWallet(RECIPIENT_DIR, "recipient");
  state.recipientAddress = recipient.address;
  await saveState(state);
  console.log(`recipient address: ${recipient.address}`);

  if (!state.txid) {
    console.log(`quicksend ${SEND_ZATOSHIS} zat with memo ${JSON.stringify(MEMO)}`);
    const deadline = Date.now() + 25 * 60 * 1000;
    let sent;
    for (;;) {
      try {
        sent = await runZingo(
          PAYER_DIR,
          ["--waitsync", "quicksend", recipient.address, SEND_ZATOSHIS.toString(), MEMO],
          { timeoutMs: 20 * 60 * 1000 }
        );
        break;
      } catch (error) {
        const message = String(error);
        if (message.includes("Insufficient balance") && Date.now() < deadline) {
          console.log("note is in the wallet but not spendable yet; waiting for confirmations");
          await new Promise((resolve) => setTimeout(resolve, 45_000));
          continue;
        }
        throw error;
      }
    }
    const report = parseJson(sent.stdout);
    const txid = report.txids?.[0];
    if (typeof txid !== "string" || !/^[0-9a-f]{64}$/i.test(txid)) {
      fail("send", `quicksend did not return a txid:\n${sent.stdout}`);
    }
    state.txid = txid;
    state.memo = MEMO;
    state.workOrderId = WORK_ORDER_ID;
    state.amountZatoshis = SEND_ZATOSHIS.toString();
    state.sentAt = new Date().toISOString();
    state.explorerUrl = `https://testnet.cipherscan.app/tx/${txid}`;
    await saveState(state);
    console.log(`txid ${txid}`);
  } else {
    console.log(`already sent ${state.txid}`);
  }

  const exported = await runZingo(RECIPIENT_DIR, ["export_ufvk"], { offline: true, timeoutMs: 60_000 });
  const ufvkJson = parseJson(exported.stdout);
  if (typeof ufvkJson.ufvk !== "string" || typeof ufvkJson.birthday !== "number") {
    fail("viewing-key", `export_ufvk was not {ufvk, birthday}:\n${exported.stdout}`);
  }
  await writeFile(path.join(HOME, "recipient.ufvk"), `${ufvkJson.ufvk}\n`, { mode: 0o600 });
  state.recipientBirthday = ufvkJson.birthday;
  state.ufvk = ufvkJson.ufvk;
  await saveState(state);

  await mkdir(VIEW_DIR, { recursive: true });
  const viewArgs = (await walletExists(VIEW_DIR))
    ? ["--waitsync", "messages", WORK_ORDER_ID]
    : ["--viewkey", ufvkJson.ufvk, "--birthday", String(ufvkJson.birthday), "--waitsync", "messages", WORK_ORDER_ID];
  const readback = await runZingo(VIEW_DIR, viewArgs, { timeoutMs: 20 * 60 * 1000 });
  if (!readback.stdout.includes(MEMO) && !readback.stdout.includes(WORK_ORDER_ID)) {
    fail("viewing-key", `messages did not contain the work-order memo:\n${readback.stdout}`);
  }
  state.readbackOk = true;
  state.readbackAt = new Date().toISOString();
  await saveState(state);

  const payment = [
    "# Zcash testnet payment",
    "",
    `Work-order id in the memo: \`${WORK_ORDER_ID}\``,
    `Memo: \`${MEMO}\``,
    `Amount: ${SEND_ZATOSHIS} zatoshis (0.001 TAZ), shielded.`,
    `Transaction id: \`${state.txid}\``,
    `Explorer: ${state.explorerUrl}`,
    "",
    "## Faucet",
    "",
    `Listed at ${FAUCET_DOC} (the testnet faucets on the ZecHub wiki; the developers index does not name a URL).`,
    "Tried first: https://fauzec.com — POST /api/v1/claim. That claim stayed pending and did not fund the wallet.",
    `Fauzec record: \`${JSON.stringify(state.faucet ?? { note: "not claimed" })}\``,
    state.jinoFaucet
      ? `Funded by https://zcashfaucet.jinolabs.xyz (same ZecHub faucet page; the proof-of-work was solved from this machine). Drip txid \`${state.jinoFaucet.txid}\`. Explorer: ${state.jinoFaucet.explorerUrl}`
      : "No second faucet record was stored.",
    "",
    "## Setup",
    "",
    "1. Rust 1.97.1 (zingolib's toolchain file), protoc, cmake, clang, libsqlite3-dev, libssl-dev.",
    "2. `git clone --depth 1 --branch zingolib_v6.0.0 https://github.com/zingolabs/zingolib.git`",
    "3. `cargo build --release -p zingo-cli --no-default-features --features clearnet-test-mode`",
    "4. `node scripts/zcash/spike.mjs`",
    `5. Lightwalletd: \`${SERVER}\`. Chain: testnet. Wallets: \`${HOME}\` (not in git).`,
    "",
    "## Timing",
    "",
    `- Wallet create (includes the chain-tip request that sets the birthday): ${payer.ms} ms`,
    `- First sync of the new payer wallet: ${state.firstSyncMs} ms`,
    `- Recipient birthday height: ${state.recipientBirthday}`,
    "",
    "## Viewing key",
    "",
    "The recipient unified full viewing key read the memo back. `messages` on a",
    "view-only wallet created with `--viewkey` and that birthday contained the",
    `work-order id. The key is not a spending key. It is stored at \`${path.join(HOME, "recipient.ufvk")}\`.`,
    "The public receipt says the viewing key is available on request; this file",
    "does not need the seed, and the seed is not recorded here.",
    "",
    "```",
    ufvkJson.ufvk,
    "```",
    "",
    "Readback stdout:",
    "",
    "```",
    readback.stdout.trim(),
    "```",
    ""
  ].join("\n");
  await writeFile(path.join(HERE, "PAYMENT.md"), payment);
  console.log(`wrote ${path.join(HERE, "PAYMENT.md")}`);
}

main().catch((error) => {
  if (!process.exitCode) {
    console.error(error);
    process.exitCode = 1;
  }
});
