import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { isValidStructTag, isValidSuiAddress, normalizeStructTag, normalizeSuiAddress, SUI_TYPE_ARG } from "@mysten/sui/utils";
import { PayoutRailError, type PayoutRail, type PayoutReceipt, type PayoutRequest } from "./index.ts";

const TESTNET_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";
const TESTNET_EXPLORER_BASE = "https://suiscan.xyz/testnet/tx";

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireTestnet() {
  if (envValue("SUI_NETWORK") !== "testnet") {
    throw new PayoutRailError("SUI_NETWORK_NOT_TESTNET", "Sui settlement is testnet-only. Set SUI_NETWORK=testnet.");
  }
}

function keypairFromEnv(): Ed25519Keypair {
  requireTestnet();

  const secretKey = envValue("SUI_PRIVATE_KEY");
  if (!secretKey) {
    throw new PayoutRailError("SUI_PRIVATE_KEY_MISSING", "SUI_PRIVATE_KEY is required for Sui settlement.");
  }

  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const signerAddress = keypair.getPublicKey().toSuiAddress();
  const configuredAddress = envValue("SUI_ADDRESS");
  if (configuredAddress && normalizeSuiAddress(configuredAddress) !== signerAddress) {
    throw new PayoutRailError("SUI_ADDRESS_MISMATCH", "SUI_ADDRESS does not match SUI_PRIVATE_KEY.");
  }

  return keypair;
}

function settlementCoinType(requestCoinType?: string): string {
  const coinType = requestCoinType ?? envValue("SUI_USDC_TYPE") ?? SUI_TYPE_ARG;
  const normalized = normalizeStructTag(coinType);
  if (!isValidStructTag(normalized)) {
    throw new PayoutRailError("INVALID_PAYOUT", `Invalid Sui coin type: ${coinType}`);
  }
  return normalized;
}

function validatePayout(request: PayoutRequest) {
  if (request.amountMicros <= 0n) {
    throw new PayoutRailError("INVALID_PAYOUT", "Payout amount must be greater than zero.");
  }
  if (!isValidSuiAddress(request.recipientAddress)) {
    throw new PayoutRailError("INVALID_PAYOUT", `Invalid Sui recipient address for intent ${request.intentId}.`);
  }
}

function buildTransaction(requests: PayoutRequest[], signerAddress: string): Transaction {
  if (requests.length === 0) {
    throw new PayoutRailError("INVALID_PAYOUT", "Batch payout requires at least one payout.");
  }

  const tx = new Transaction();
  tx.setSender(signerAddress);

  for (const request of requests) {
    validatePayout(request);
    const coin = tx.coin({
      type: settlementCoinType(request.coinType),
      balance: request.amountMicros
    });
    tx.transferObjects([coin], normalizeSuiAddress(request.recipientAddress));
  }

  return tx;
}

async function execute(tx: Transaction, keypair: Ed25519Keypair): Promise<PayoutReceipt> {
  const client = new SuiGraphQLClient({
    url: TESTNET_GRAPHQL_URL,
    network: "testnet"
  });

  try {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      include: { effects: true }
    });
    const final = await client.waitForTransaction({
      result,
      include: { effects: true },
      timeout: 60_000
    });
    const transaction = final.$kind === "Transaction" ? final.Transaction : final.FailedTransaction;
    if (final.$kind !== "Transaction" || !transaction.status.success || !transaction.effects?.status.success) {
      const error = transaction.status.error?.message ?? "Sui transaction execution failed.";
      throw new PayoutRailError("SUI_EXECUTION_FAILED", error);
    }

    return {
      digest: transaction.digest,
      explorerUrl: `${TESTNET_EXPLORER_BASE}/${transaction.digest}`
    };
  } catch (error) {
    if (error instanceof PayoutRailError) throw error;
    throw new PayoutRailError("SUI_EXECUTION_FAILED", "Sui transaction execution failed.", { cause: error });
  }
}

export const suiRail: PayoutRail = {
  async send(request) {
    const keypair = keypairFromEnv();
    const tx = buildTransaction([request], keypair.getPublicKey().toSuiAddress());
    return execute(tx, keypair);
  },
  async batch(requests) {
    const keypair = keypairFromEnv();
    const tx = buildTransaction(requests, keypair.getPublicKey().toSuiAddress());
    return execute(tx, keypair);
  }
};
