import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError
} from "@solana/spl-token";
import { PayoutRailError, type PayoutRail, type PayoutReceipt, type PayoutRequest } from "./index.ts";

// Circle's devnet USDC. transferChecked makes the chain reject the payout if the mint's decimals differ.
export const SOLANA_USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const SOLANA_USDC_DECIMALS = 6;
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const MAX_BATCH_SIZE = 8;
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireDevnet() {
  if ((envValue("SOLANA_NETWORK") ?? envValue("SOLANA_CLUSTER")) !== "devnet") {
    throw new PayoutRailError("SOLANA_NETWORK_NOT_DEVNET", "Solana settlement is devnet-only. Set SOLANA_NETWORK=devnet.");
  }
}

export function solanaUsdcMint(): PublicKey {
  return new PublicKey(envValue("SOLANA_USDC_MINT") ?? SOLANA_USDC_DEVNET_MINT);
}

export function solanaConnection(): Connection {
  return new Connection(envValue("SOLANA_RPC_URL") ?? SOLANA_DEVNET_RPC, "confirmed");
}

export function isSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value.trim()).toBase58() === value.trim();
  } catch {
    return false;
  }
}

export function solanaExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function keypairFromEnv(): Keypair {
  requireDevnet();

  const secretKey = envValue("SOLANA_PRIVATE_KEY");
  if (!secretKey) {
    throw new PayoutRailError("SOLANA_PRIVATE_KEY_MISSING", "SOLANA_PRIVATE_KEY is required for Solana settlement.");
  }

  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey) as number[]));
  } catch (error) {
    throw new PayoutRailError("SOLANA_PRIVATE_KEY_MISSING", "SOLANA_PRIVATE_KEY must be a Solana CLI JSON byte array.", { cause: error });
  }
  const configuredAddress = envValue("SOLANA_ADDRESS");
  if (configuredAddress && configuredAddress !== keypair.publicKey.toBase58()) {
    throw new PayoutRailError("SOLANA_ADDRESS_MISMATCH", "SOLANA_ADDRESS does not match SOLANA_PRIVATE_KEY.");
  }

  return keypair;
}

/** Treasury address: SOLANA_ADDRESS, else derived from the key. Null when neither is usable. */
export function solanaTreasuryAddress(): string | null {
  const configured = envValue("SOLANA_ADDRESS");
  if (configured) return configured;
  try {
    return keypairFromEnv().publicKey.toBase58();
  } catch {
    return null;
  }
}

/** USDC balance in micros. 0n only when the token account does not exist yet; RPC errors throw. */
export async function getSolanaUsdcBalance(owner: string): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(solanaUsdcMint(), new PublicKey(owner), true);
  try {
    const account = await getAccount(solanaConnection(), ata, "confirmed");
    return account.amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return 0n;
    throw error;
  }
}

function recipientKey(request: PayoutRequest): PublicKey {
  if (request.amountMicros <= 0n) {
    throw new PayoutRailError("INVALID_PAYOUT", "Payout amount must be greater than zero.");
  }
  try {
    return new PublicKey(request.recipientAddress.trim());
  } catch (error) {
    throw new PayoutRailError("INVALID_PAYOUT", `Invalid Solana recipient address for intent ${request.intentId}.`, { cause: error });
  }
}

/**
 * One legacy transaction: a memo "Tiba payout <intentId>", then per payout an idempotent
 * recipient token-account create (payer funds rent) and a USDC transferChecked from the payer.
 * Pure: no network. The browser fund flow can call it with the connected wallet as payer.
 */
export function buildSolanaPayoutTransaction(requests: PayoutRequest[], payer: PublicKey, mint: PublicKey = solanaUsdcMint()): Transaction {
  if (requests.length === 0) {
    throw new PayoutRailError("INVALID_PAYOUT", "Batch payout requires at least one payout.");
  }
  if (requests.length > MAX_BATCH_SIZE) {
    throw new PayoutRailError("INVALID_PAYOUT", `Batch payout is limited to ${MAX_BATCH_SIZE} payouts per transaction.`);
  }
  const recipients = requests.map(recipientKey);

  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(requests.map((request) => `Tiba payout ${request.intentId}`).join("; "), "utf-8")
  }));

  const payerAta = getAssociatedTokenAddressSync(mint, payer, true);
  requests.forEach((request, index) => {
    const owner = recipients[index];
    const recipientAta = getAssociatedTokenAddressSync(mint, owner, true);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, recipientAta, owner, mint));
    tx.add(createTransferCheckedInstruction(payerAta, mint, recipientAta, payer, request.amountMicros, SOLANA_USDC_DECIMALS));
  });

  return tx;
}

async function execute(requests: PayoutRequest[]): Promise<PayoutReceipt> {
  const keypair = keypairFromEnv();
  const tx = buildSolanaPayoutTransaction(requests, keypair.publicKey);
  const intentIds = requests.map((request) => request.intentId).join(",");
  const connection = solanaConnection();
  const sendFailed = (error: unknown): never => {
    throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Solana transaction could not be sent.", { cause: error });
  };

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed").catch(sendFailed);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize()).catch(sendFailed);

  const receipt = { digest: signature, explorerUrl: solanaExplorerTxUrl(signature) };
  let confirmError: unknown;
  try {
    const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (!result.value.err) return receipt;
    confirmError = result.value.err;
  } catch (error) {
    confirmError = error;
  }

  // The transaction may have landed even though confirmation threw (blockhash expiry). The pipeline
  // stores a null digest on failure, so this log line and the memo are the only traces.
  console.error(`[solana-rail] confirmation failed for intent ${intentIds}, signature ${signature}`, confirmError);
  const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
  const status = statuses?.value[0];
  if (status && status.err === null && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
    return receipt;
  }
  throw new PayoutRailError("SOLANA_EXECUTION_FAILED", `Solana transaction ${signature} did not confirm.`, { cause: confirmError });
}

export const solanaRail: PayoutRail = {
  async send(request) {
    return execute([request]);
  },
  async batch(requests) {
    return execute(requests);
  }
};
