/**
 * Read the shielded test payment back with the recipient viewing key.
 *
 * Uses the key and birthday written by spike.mjs under ZCASH_HOME
 * (default ~/.tiba-zcash-spike). Exits 0 only when the work-order memo is visible.
 *
 *   node scripts/zcash/read-receipt.mjs
 */
import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER = "https://testnet.zec.rocks:443";
const WORK_ORDER_ID = "WO-ZCASH-SPIKE-1";
const HOME = process.env.ZCASH_HOME || path.join(os.homedir(), ".tiba-zcash-spike");
const ZINGO = process.env.ZINGO_CLI || path.join(os.homedir(), "zingolib", "target", "release", "zingo-cli");
const VIEW_DIR = path.join(HOME, "view-only-replay");

const state = JSON.parse(await readFile(path.join(HOME, "state.json"), "utf8"));
if (typeof state.ufvk !== "string" || typeof state.recipientBirthday !== "number") {
  console.error("state.json has no recipient viewing key yet. Run spike.mjs first.");
  process.exit(1);
}

await mkdir(VIEW_DIR, { recursive: true });
let already = true;
try {
  await access(path.join(VIEW_DIR, "zingo-wallet.dat"));
} catch {
  already = false;
}
const args = [
  "--chain", "testnet",
  "--server", SERVER,
  "--data-dir", VIEW_DIR,
  ...(already ? [] : ["--viewkey", state.ufvk, "--birthday", String(state.recipientBirthday)]),
  "--waitsync",
  "messages",
  WORK_ORDER_ID
];

const child = spawn(ZINGO, args, { stdio: ["ignore", "pipe", "inherit"] });
let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
const code = await new Promise((resolve) => child.on("close", resolve));
process.stdout.write(stdout);
if (code !== 0 || !stdout.includes(WORK_ORDER_ID)) {
  console.error("viewing key did not show the work-order memo");
  process.exit(code || 1);
}
