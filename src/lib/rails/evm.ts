import {
  erc20Abi,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hash,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { createClient } from "viem/tempo";
import { PayoutRailError, type PayoutRail, type PayoutReceipt, type PayoutRequest } from "./index.ts";

/** Moderato, Tempo's public testnet. Mainnet (4217) is refused before any RPC call. */
export const TEMPO_MODERATO_CHAIN_ID = 42431;
export const TEMPO_MODERATO_RPC = "https://rpc.moderato.tempo.xyz";
/** pathUSD, the faucet stablecoin. Six decimals, so amountMicros is already the base unit. */
export const TEMPO_PATH_USD = "0x20c0000000000000000000000000000000000000" as const;
export const TEMPO_EXPLORER_BASE = "https://explore.testnet.tempo.xyz";
export const STABLECOIN_DECIMALS = 6;
export const MAX_BATCH_SIZE = 8;

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export interface TempoRailConfig {
  rpcUrl: string;
  chainId: number;
  stablecoin: Address;
  explorerBase: string;
  treasuryKey: Hex;
  treasuryAddress?: Address;
}

export function tempoExplorerTxUrl(digest: string, base?: string): string {
  const root = (base ?? envValue("TEMPO_EXPLORER_BASE") ?? TEMPO_EXPLORER_BASE).replace(/\/$/, "");
  return `${root}/tx/${digest}`;
}

/** Local checks only. No env, no network. */
export function prepareTempoPayouts(requests: PayoutRequest[]): { recipient: Address; amount: bigint; intentId: string }[] {
  if (requests.length === 0) {
    throw new PayoutRailError("INVALID_PAYOUT", "Batch payout requires at least one payout.");
  }
  if (requests.length > MAX_BATCH_SIZE) {
    throw new PayoutRailError("INVALID_PAYOUT", `Batch payout is limited to ${MAX_BATCH_SIZE} payouts per transaction.`);
  }
  return requests.map((request) => {
    if (request.amountMicros <= 0n) {
      throw new PayoutRailError("INVALID_PAYOUT", "Payout amount must be greater than zero.");
    }
    const raw = request.recipientAddress.trim();
    if (!isAddress(raw)) {
      throw new PayoutRailError("INVALID_PAYOUT", `Invalid Tempo recipient address for intent ${request.intentId}.`);
    }
    return { recipient: getAddress(raw), amount: request.amountMicros, intentId: request.intentId };
  });
}

/**
 * Tempo Moderato settings. Names only — the treasury key is never defaulted.
 * Called at send time so tests can set the env first.
 */
export function readTempoConfig(): TempoRailConfig {
  const chainIdRaw = envValue("TEMPO_CHAIN_ID") ?? String(TEMPO_MODERATO_CHAIN_ID);
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId !== TEMPO_MODERATO_CHAIN_ID) {
    throw new PayoutRailError(
      "TEMPO_NETWORK_NOT_MODERATO",
      "Tempo settlement is Moderato-only. Set TEMPO_CHAIN_ID=42431."
    );
  }

  const stablecoinRaw = envValue("TEMPO_STABLECOIN_ADDRESS") ?? TEMPO_PATH_USD;
  if (!isAddress(stablecoinRaw)) {
    throw new PayoutRailError("INVALID_PAYOUT", "TEMPO_STABLECOIN_ADDRESS is not an Ethereum address.");
  }

  const treasuryKey = envValue("TEMPO_TREASURY_KEY");
  if (!treasuryKey || !/^0x[0-9a-fA-F]{64}$/.test(treasuryKey)) {
    throw new PayoutRailError(
      "TEMPO_TREASURY_KEY_MISSING",
      "TEMPO_TREASURY_KEY must be a 0x-prefixed 32-byte hex private key."
    );
  }

  const treasuryAddressRaw = envValue("TEMPO_TREASURY_ADDRESS");
  if (treasuryAddressRaw && !isAddress(treasuryAddressRaw)) {
    throw new PayoutRailError("TEMPO_ADDRESS_MISMATCH", "TEMPO_TREASURY_ADDRESS is not an Ethereum address.");
  }

  return {
    rpcUrl: envValue("TEMPO_RPC_URL") ?? TEMPO_MODERATO_RPC,
    chainId,
    stablecoin: getAddress(stablecoinRaw),
    explorerBase: (envValue("TEMPO_EXPLORER_BASE") ?? TEMPO_EXPLORER_BASE).replace(/\/$/, ""),
    treasuryKey: treasuryKey as Hex,
    treasuryAddress: treasuryAddressRaw ? getAddress(treasuryAddressRaw) : undefined
  };
}

async function confirmed(
  client: { waitForTransactionReceipt: (args: { hash: Hash }) => Promise<{ status: string }> },
  hash: Hash,
  label: string
) {
  let receipt: { status: string };
  try {
    receipt = await client.waitForTransactionReceipt({ hash });
  } catch (error) {
    throw new PayoutRailError("TEMPO_EXECUTION_FAILED", `Tempo ${label} ${hash} did not confirm.`, { cause: error });
  }
  if (receipt.status !== "success") {
    throw new PayoutRailError("TEMPO_EXECUTION_FAILED", `Tempo ${label} ${hash} reverted.`);
  }
}

async function execute(requests: PayoutRequest[]): Promise<PayoutReceipt> {
  const prepared = prepareTempoPayouts(requests);
  const config = readTempoConfig();
  const account = privateKeyToAccount(config.treasuryKey);
  if (config.treasuryAddress && config.treasuryAddress !== account.address) {
    throw new PayoutRailError("TEMPO_ADDRESS_MISMATCH", "TEMPO_TREASURY_ADDRESS does not match TEMPO_TREASURY_KEY.");
  }

  // Fees are paid in the stablecoin. Tempo has no native gas token.
  const chain = tempoModerato.extend({ feeToken: config.stablecoin });
  const client = createClient({
    account,
    chain,
    transport: http(config.rpcUrl)
  });

  let decimals: number;
  try {
    decimals = await client.readContract({
      address: config.stablecoin,
      abi: erc20Abi,
      functionName: "decimals"
    });
  } catch (error) {
    throw new PayoutRailError("TEMPO_EXECUTION_FAILED", "Tempo stablecoin decimals could not be read.", { cause: error });
  }
  if (decimals !== STABLECOIN_DECIMALS) {
    throw new PayoutRailError(
      "INVALID_PAYOUT",
      `Tempo stablecoin decimals are ${decimals}; amountMicros requires ${STABLECOIN_DECIMALS}.`
    );
  }

  const total = prepared.reduce((sum, payout) => sum + payout.amount, 0n);

  try {
    // transferFrom spends the treasury's own allowance. Approve the exact total, then pull.
    const allowance = await client.readContract({
      address: config.stablecoin,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, account.address]
    });
    if (allowance < total) {
      const approveHash = await client.writeContract({
        address: config.stablecoin,
        abi: erc20Abi,
        functionName: "approve",
        args: [account.address, total]
      });
      await confirmed(client, approveHash, "approval");
    }

    let last: PayoutReceipt | null = null;
    for (const payout of prepared) {
      const hash = await client.writeContract({
        address: config.stablecoin,
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [account.address, payout.recipient, payout.amount]
      });
      await confirmed(client, hash, "transfer");
      last = { digest: hash, explorerUrl: tempoExplorerTxUrl(hash, config.explorerBase) };
    }
    if (!last) {
      throw new PayoutRailError("INVALID_PAYOUT", "Batch payout requires at least one payout.");
    }
    return last;
  } catch (error) {
    if (error instanceof PayoutRailError) throw error;
    throw new PayoutRailError("TEMPO_EXECUTION_FAILED", "Tempo stablecoin transfer could not be confirmed.", { cause: error });
  }
}

export const tempoRail: PayoutRail = {
  async send(request) {
    return execute([request]);
  },
  async batch(requests) {
    return execute(requests);
  }
};
