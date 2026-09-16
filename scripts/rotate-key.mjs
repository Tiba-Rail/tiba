// Generate or verify a Solana devnet treasury keypair. Never prints the secret.
// Usage:
//   node scripts/rotate-key.mjs
//   node scripts/rotate-key.mjs --verify
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

export function assertRotateDevnet(network = process.env.SOLANA_NETWORK ?? process.env.SOLANA_CLUSTER) {
  if ((network ?? "").trim() !== "devnet") {
    throw new Error("rotate-key refuses to run unless SOLANA_NETWORK=devnet.");
  }
}

export function writeDevnetKeypair(dir = join(process.cwd(), ".secrets")) {
  mkdirSync(dir, { recursive: true });
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const path = join(dir, `solana-devnet-${publicKey.slice(0, 8)}.json`);
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows may ignore POSIX mode; the path is still local-only and gitignored.
  }
  return { publicKey, path };
}

export function envChangeLines(publicKey) {
  return [
    "SOLANA_NETWORK=devnet",
    `SOLANA_ADDRESS=${publicKey}`,
    `TREASURY_ADDRESS=${publicKey}`,
    "SOLANA_PRIVATE_KEY=<JSON byte array from the key file; do not paste it into logs>"
  ];
}

function printGenerateResult({ publicKey, path }) {
  console.log(`New treasury public key: ${publicKey}`);
  console.log(`Secret keypair written to: ${path}`);
  console.log("File mode 600. The secret is not printed. Read that file locally to set SOLANA_PRIVATE_KEY.");
  console.log("Env changes after remaining devnet USDC has moved off the old key:");
  for (const line of envChangeLines(publicKey)) console.log(`  ${line}`);
  console.log("Then: node scripts/rotate-key.mjs --verify");
}

async function verify() {
  const { assertTreasuryMatchesKey, configuredTreasuryAddress } = await import("../src/lib/rails/solana.ts");
  const keypair = assertTreasuryMatchesKey();
  if (!keypair) {
    throw new Error("SOLANA_PRIVATE_KEY is not set. Paste the JSON from the key file into the env, then re-run --verify.");
  }
  const configured = configuredTreasuryAddress();
  const derived = keypair.publicKey.toBase58();
  if (!configured) {
    throw new Error("Set TREASURY_ADDRESS and SOLANA_ADDRESS to the new public key, then re-run --verify.");
  }
  if (configured !== derived) {
    throw new Error(`Mismatch: configured ${configured} vs derived ${derived}.`);
  }
  console.log(`Treasury address matches derived key: ${derived}`);
}

export async function runRotateKey(argv = process.argv.slice(2)) {
  assertRotateDevnet();
  if (argv.includes("--verify")) {
    await verify();
    return { action: "verify" };
  }
  const result = writeDevnetKeypair();
  printGenerateResult(result);
  return { action: "generate", ...result };
}

const thisFile = fileURLToPath(import.meta.url);
const launched = process.argv[1] ? resolve(process.argv[1]) : "";
if (resolve(thisFile) === launched) {
  import("dotenv/config").then(() => runRotateKey()).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
