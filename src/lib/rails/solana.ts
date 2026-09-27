import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TransactionInstruction
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError
} from "@solana/spl-token";
import { encodeBase58 } from "./base58.ts";
import { notSent, PayoutRailError, type PayoutRail, type PayoutReceipt, type PayoutRequest } from "./index.ts";

// Circle's devnet USDC. transferChecked makes the chain reject the payout if the mint's decimals differ.
export const SOLANA_USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const SOLANA_USDC_DECIMALS = 6;
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
// Independent public devnet node (Tatum). Same devnet genesis as the Labs endpoint, different solana-core build.
export const SOLANA_DEVNET_RPC_WITNESS = "https://solana-devnet.gateway.tatum.io";
export const MAX_BATCH_SIZE = 8;
const QUORUM_POLLS = 6;
const QUORUM_POLL_MS = 1_000;
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type RpcSignatureStatus = {
  err: unknown;
  confirmationStatus: string | null;
} | null;

export function normalizeRpcUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function solanaRpcEndpoints(): { primary: string; witness: string } {
  return {
    primary: envValue("SOLANA_RPC_URL") ?? SOLANA_DEVNET_RPC,
    witness: envValue("SOLANA_RPC_URL_2") ?? SOLANA_DEVNET_RPC_WITNESS
  };
}

export function rpcEndpointsAreIndependent(primary: string, witness: string): boolean {
  return normalizeRpcUrl(primary) !== normalizeRpcUrl(witness);
}

export function signatureConfirmed(status: RpcSignatureStatus): boolean {
  return Boolean(
    status
    && status.err === null
    && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")
  );
}

/** Both endpoints must report success. A chain error on both is a rejection; one success and one error is a split. */
export function quorumOutcome(primary: RpcSignatureStatus, witness: RpcSignatureStatus): "confirmed" | "split" | "rejected" | "pending" {
  const primaryOk = signatureConfirmed(primary);
  const witnessOk = signatureConfirmed(witness);
  if (primaryOk && witnessOk) return "confirmed";
  const primaryBad = primary?.err != null;
  const witnessBad = witness?.err != null;
  if ((primaryOk && witnessBad) || (witnessOk && primaryBad)) return "split";
  if (primaryBad && witnessBad) return "rejected";
  return "pending";
}

/**
 * Both endpoints must confirm. What each failure proves is on the error's `outcome`:
 * - both report an error: "rejected" (the chain refused it);
 * - the blockhash expired and neither endpoint has ever seen it: "rejected" (it can no longer land);
 * - a split, or a timeout while either endpoint may still see it: "unknown" (it may have landed).
 */
export async function confirmPayoutQuorum(
  signature: string,
  readStatus: (which: "primary" | "witness") => Promise<RpcSignatureStatus>,
  options?: { polls?: number; sleep?: (ms: number) => Promise<void>; blockhashExpired?: () => boolean }
): Promise<void> {
  const polls = options?.polls ?? QUORUM_POLLS;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastPrimary: RpcSignatureStatus = null;
  let lastWitness: RpcSignatureStatus = null;
  for (let attempt = 0; attempt < polls; attempt += 1) {
    const [primary, witness] = await Promise.all([readStatus("primary"), readStatus("witness")]);
    lastPrimary = primary;
    lastWitness = witness;
    const outcome = quorumOutcome(primary, witness);
    if (outcome === "confirmed") return;
    if (outcome === "split") {
      throw new PayoutRailError(
        "SOLANA_RPC_QUORUM_FAILED",
        `Solana RPC endpoints disagreed on transaction ${signature}. The payout was not recorded as paid.`,
        { outcome: "unknown" }
      );
    }
    if (outcome === "rejected") {
      throw new PayoutRailError("SOLANA_EXECUTION_FAILED", `Solana transaction ${signature} was rejected.`, { outcome: "rejected" });
    }
    if (attempt < polls - 1) await sleep(QUORUM_POLL_MS);
  }
  const neverSeen = lastPrimary === null && lastWitness === null;
  if (neverSeen && options?.blockhashExpired?.()) {
    throw new PayoutRailError(
      "SOLANA_EXECUTION_FAILED",
      `Solana transaction ${signature} expired before either RPC endpoint saw it.`,
      { outcome: "rejected" }
    );
  }
  throw new PayoutRailError(
    "SOLANA_EXECUTION_FAILED",
    `Solana transaction ${signature} did not confirm on both RPC endpoints.`,
    { outcome: "unknown" }
  );
}

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
  return new Connection(solanaRpcEndpoints().primary, "confirmed");
}

export function isSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value.trim()).toBase58() === value.trim();
  } catch {
    return false;
  }
}

export function solanaExplorerTxUrl(signature: string): string {
  const base = (envValue("SOLANA_EXPLORER_BASE") ?? "https://explorer.solana.com").replace(/\/$/, "");
  // Callers pass ids they produced or already validated as base58; encoding keeps a stray one inert.
  return `${base}/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function solanaPayerKeypair(): Keypair {
  return keypairFromEnv();
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

async function readSignatureStatus(connection: Connection, signature: string): Promise<RpcSignatureStatus> {
  try {
    const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = statuses.value[0];
    if (!status) return null;
    return { err: status.err, confirmationStatus: status.confirmationStatus ?? null };
  } catch {
    return null;
  }
}

/** Transaction id of a signed legacy transaction: its first (fee payer's) signature, base58. */
export function signedTransactionId(tx: Transaction): string {
  if (!tx.signature) throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Transaction is not signed.", { outcome: "not_sent" });
  return encodeBase58(tx.signature);
}

async function execute(requests: PayoutRequest[]): Promise<PayoutReceipt> {
  const intentIds = requests.map((request) => request.intentId).join(",");
  let connection: Connection;
  let witnessConnection: Connection;
  let signature: string;
  let raw: Buffer;
  let blockhash: string;
  let lastValidBlockHeight: number;

  // Everything up to the broadcast. A failure here proves nothing was sent.
  try {
    const keypair = keypairFromEnv();
    const { primary, witness } = solanaRpcEndpoints();
    if (!rpcEndpointsAreIndependent(primary, witness)) {
      throw new PayoutRailError(
        "SOLANA_RPC_QUORUM_FAILED",
        "Solana payout confirmation needs two different RPC endpoints. Set SOLANA_RPC_URL_2 to a second devnet node."
      );
    }
    const tx = buildSolanaPayoutTransaction(requests, keypair.publicKey);
    connection = new Connection(primary, "confirmed");
    witnessConnection = new Connection(witness, "confirmed");

    ({ blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed"));
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    signature = signedTransactionId(tx);
    raw = tx.serialize();

    // The caller stores the id before anything is broadcast, so a transfer can never exist
    // without a record that names it. If storing fails, nothing is sent.
    for (const request of requests) {
      if (request.onSigned) await request.onSigned(signature);
    }
  } catch (error) {
    throw notSent(error, "SOLANA_EXECUTION_FAILED");
  }

  try {
    await connection.sendRawTransaction(raw);
  } catch (error) {
    // The request may have reached the node before the error came back. Not proof of anything.
    throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Solana transaction could not be sent.", { cause: error, outcome: "unknown" });
  }

  const receipt = { digest: signature, explorerUrl: solanaExplorerTxUrl(signature) };
  let blockhashExpired = false;
  try {
    const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (result.value.err) {
      console.error(`[solana-rail] primary confirmation returned an error for intent ${intentIds}, signature ${signature}`, result.value.err);
    }
  } catch (error) {
    // The transaction may have landed even though confirmation threw (blockhash expiry). The witness
    // read below is what decides whether both endpoints agree it confirmed.
    blockhashExpired = error instanceof TransactionExpiredBlockheightExceededError;
    console.error(`[solana-rail] primary confirmation threw for intent ${intentIds}, signature ${signature}`, error);
  }

  await confirmPayoutQuorum(
    signature,
    (which) => readSignatureStatus(which === "primary" ? connection : witnessConnection, signature),
    { blockhashExpired: () => blockhashExpired }
  );
  return receipt;
}

export const solanaRail: PayoutRail = {
  async send(request) {
    return execute([request]);
  },
  async batch(requests) {
    return execute(requests);
  }
};
