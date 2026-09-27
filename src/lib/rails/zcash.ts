import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { PayoutRailError, type PayoutRail, type PayoutReceipt, type PayoutRequest } from "./index.ts";

export const ZCASH_TESTNET_SERVER = "https://testnet.zec.rocks:443";

/** Public handle for a shielded txid. The memo is not on this page. */
export function zcashExplorerTxUrl(txid: string): string {
  return `https://testnet.cipherscan.app/tx/${txid}`;
}

/** Same sentence the Solana memo uses, carried inside the shielded memo. */
export function zcashPayoutMemo(intentId: string): string {
  return `Tiba payout ${intentId}`;
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireTestnet() {
  if (envValue("ZCASH_NETWORK") !== "testnet") {
    throw new PayoutRailError(
      "ZCASH_NETWORK_NOT_TESTNET",
      "Zcash settlement is testnet-only. Set ZCASH_NETWORK=testnet."
    );
  }
}

function isShieldedTestnetAddress(value: string): boolean {
  return value.startsWith("utest1") || value.startsWith("ztestsapling");
}

function zingoBinary(): string {
  return envValue("ZINGO_CLI") || path.join(os.homedir(), "zingolib", "target", "release", "zingo-cli");
}

function walletDir(): string {
  return envValue("ZCASH_WALLET_DIR") || path.join(os.homedir(), ".tiba-zcash-spike", "payer");
}

function runZingo(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ zingoBinary(), [
      "--chain", "testnet",
      "--server", ZCASH_TESTNET_SERVER,
      "--data-dir", walletDir(),
      ...args
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `zingo-cli exited ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function txidFromQuicksend(stdout: string): string {
  const start = stdout.search(/[\[{]/);
  if (start < 0) {
    throw new PayoutRailError("ZCASH_EXECUTION_FAILED", "Zcash send did not return a transaction id.");
  }
  let report: { txids?: unknown };
  try {
    report = JSON.parse(stdout.slice(start)) as { txids?: unknown };
  } catch (error) {
    throw new PayoutRailError("ZCASH_EXECUTION_FAILED", "Zcash send did not return a transaction id.", { cause: error });
  }
  const txids = Array.isArray(report.txids) ? report.txids : [];
  const txid = txids[0];
  if (typeof txid !== "string" || !/^[0-9a-f]{64}$/i.test(txid)) {
    throw new PayoutRailError("ZCASH_EXECUTION_FAILED", "Zcash send did not return a transaction id.");
  }
  return txid;
}

/**
 * One shielded testnet payment. amountMicros is zatoshis on this rail (the same
 * one-request-unit-is-one-chain-unit choice the old testnet rails used).
 * The spending key stays in the zingo wallet directory.
 */
async function execute(request: PayoutRequest): Promise<PayoutReceipt> {
  requireTestnet();
  if (request.amountMicros <= 0n) {
    throw new PayoutRailError("INVALID_PAYOUT", "Payout amount must be greater than zero.");
  }
  const recipient = request.recipientAddress.trim();
  if (!isShieldedTestnetAddress(recipient)) {
    throw new PayoutRailError("INVALID_PAYOUT", `Invalid Zcash testnet recipient for intent ${request.intentId}.`);
  }
  let stdout: string;
  try {
    stdout = await runZingo([
      "--waitsync",
      "quicksend",
      recipient,
      request.amountMicros.toString(),
      zcashPayoutMemo(request.intentId)
    ]);
  } catch (error) {
    throw new PayoutRailError("ZCASH_EXECUTION_FAILED", "Zcash transaction could not be sent.", { cause: error });
  }
  const digest = txidFromQuicksend(stdout);
  return { digest, explorerUrl: zcashExplorerTxUrl(digest) };
}

export const zcashRail: PayoutRail = {
  async send(request) {
    return execute(request);
  },
  async batch() {
    throw new PayoutRailError("INVALID_PAYOUT", "The Zcash rail sends one shielded payment at a time.");
  }
};
