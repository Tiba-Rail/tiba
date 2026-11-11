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

export type SignatureConfirmation = {
  err: unknown | null;
  confirmationStatus?: string | null;
} | null;

export interface SolanaRpcClient {
  readonly url: string;
  getLatestBlockhash(commitment?: string): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sendRawTransaction(raw: Uint8Array): Promise<string>;
  confirmTransaction(
    strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment?: string
  ): Promise<{ value: { err: unknown | null } }>;
  getSignatureStatuses(
    signatures: string[],
    config?: { searchTransactionHistory?: boolean }
  ): Promise<{ value: Array<SignatureConfirmation> }>;
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

/** Distinct RPC URLs. SOLANA_RPC_URLS (comma-separated) wins; else SOLANA_RPC_URL; else the public devnet RPC. */
export function solanaRpcUrls(): string[] {
  const listed = envValue("SOLANA_RPC_URLS");
  const raw = listed ? listed.split(",") : [envValue("SOLANA_RPC_URL") ?? SOLANA_DEVNET_RPC];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const part of raw) {
    const url = part.trim().replace(/\/+$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.length > 0 ? urls : [SOLANA_DEVNET_RPC];
}

export function connectionAsClient(url: string): SolanaRpcClient {
  const connection = new Connection(url, "confirmed");
  return {
    url,
    getLatestBlockhash: (commitment) => connection.getLatestBlockhash((commitment ?? "confirmed") as "confirmed"),
    sendRawTransaction: (raw) => connection.sendRawTransaction(raw),
    confirmTransaction: (strategy, commitment) =>
      connection.confirmTransaction(strategy, (commitment ?? "confirmed") as "confirmed"),
    getSignatureStatuses: (signatures, config) =>
      connection.getSignatureStatuses(
        signatures,
        config?.searchTransactionHistory === undefined
          ? undefined
          : { searchTransactionHistory: config.searchTransactionHistory }
      )
  };
}

function defaultRpcClients(): SolanaRpcClient[] {
  return solanaRpcUrls().map(connectionAsClient);
}

export function solanaConnection(): Connection {
  return new Connection(solanaRpcUrls()[0] ?? SOLANA_DEVNET_RPC, "confirmed");
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

export function configuredTreasuryAddress(): string | undefined {
  return envValue("TREASURY_ADDRESS") ?? envValue("SOLANA_ADDRESS");
}

function parseKeypairFromEnv(): Keypair {
  const secretKey = envValue("SOLANA_PRIVATE_KEY");
  if (!secretKey) {
    throw new PayoutRailError("SOLANA_PRIVATE_KEY_MISSING", "SOLANA_PRIVATE_KEY is required for Solana settlement.");
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey) as number[]));
  } catch (error) {
    throw new PayoutRailError("SOLANA_PRIVATE_KEY_MISSING", "SOLANA_PRIVATE_KEY must be a Solana CLI JSON byte array.", { cause: error });
  }
}

/** Fails when a configured treasury address does not match the derived key. Returns null when no key is set. */
export function assertTreasuryMatchesKey(): Keypair | null {
  if (!envValue("SOLANA_PRIVATE_KEY")) return null;

  const treasury = envValue("TREASURY_ADDRESS");
  const solana = envValue("SOLANA_ADDRESS");
  if (treasury && solana && treasury !== solana) {
    throw new PayoutRailError("SOLANA_ADDRESS_MISMATCH", "TREASURY_ADDRESS and SOLANA_ADDRESS disagree.");
  }

  const keypair = parseKeypairFromEnv();
  const configured = treasury ?? solana;
  if (configured && configured !== keypair.publicKey.toBase58()) {
    throw new PayoutRailError(
      "SOLANA_ADDRESS_MISMATCH",
      "TREASURY_ADDRESS/SOLANA_ADDRESS does not match SOLANA_PRIVATE_KEY."
    );
  }
  return keypair;
}

/** Loud boot check: a non-devnet network label is refused; a present key must match the configured address. */
export function assertSolanaStartup(): void {
  const network = envValue("SOLANA_NETWORK") ?? envValue("SOLANA_CLUSTER");
  if (network && network !== "devnet") {
    throw new PayoutRailError("SOLANA_NETWORK_NOT_DEVNET", "Solana settlement is devnet-only. Set SOLANA_NETWORK=devnet.");
  }
  assertTreasuryMatchesKey();
}

function keypairFromEnv(): Keypair {
  requireDevnet();
  return assertTreasuryMatchesKey() ?? parseKeypairFromEnv();
}

/** Treasury address: TREASURY_ADDRESS or SOLANA_ADDRESS, else derived from the key. Null when neither is usable. */
export function solanaTreasuryAddress(): string | null {
  const configured = configuredTreasuryAddress();
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

export function isRetryableRpcError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error !== "object") {
    return /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|502|503|504/i.test(String(error));
  }
  const e = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown; cause?: unknown };
  const code = String(e.code ?? "");
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_HEADERS_TIMEOUT"
  ) {
    return true;
  }
  const status = typeof e.statusCode === "number" ? e.statusCode : typeof e.status === "number" ? e.status : undefined;
  if (status !== undefined && status >= 500) return true;
  const message = String(e.message ?? "");
  if (/fetch failed|network|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|502 Bad Gateway|503 Service|504 Gateway|HTTP 5\d\d/i.test(message)) {
    return true;
  }
  if (e.cause && e.cause !== error) return isRetryableRpcError(e.cause);
  return false;
}

export function isSignatureConfirmed(status: SignatureConfirmation): boolean {
  return Boolean(
    status &&
    status.err === null &&
    (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")
  );
}

export function quorumResult(confirmedCount: number): "confirmed" | "pending" | "unconfirmed" {
  if (confirmedCount >= 2) return "confirmed";
  if (confirmedCount === 1) return "pending";
  return "unconfirmed";
}

export async function reconcileSignatureQuorum(
  signature: string,
  clients: SolanaRpcClient[] = defaultRpcClients()
): Promise<"confirmed" | "pending" | "unconfirmed"> {
  const unique = new Map<string, SolanaRpcClient>();
  for (const client of clients) unique.set(client.url, client);
  const endpoints = [...unique.values()];
  const flags = await Promise.all(
    endpoints.map(async (client) => {
      try {
        const result = await client.getSignatureStatuses([signature], { searchTransactionHistory: true });
        return isSignatureConfirmed(result.value[0] ?? null);
      } catch {
        return false;
      }
    })
  );
  return quorumResult(flags.filter(Boolean).length);
}

async function sendWithFallback(
  requests: PayoutRequest[],
  keypair: Keypair,
  clients: SolanaRpcClient[]
): Promise<{ signature: string; blockhash: string; lastValidBlockHeight: number; client: SolanaRpcClient }> {
  if (clients.length === 0) {
    throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Solana transaction could not be sent.");
  }
  let lastError: unknown;
  for (const client of clients) {
    try {
      const tx = buildSolanaPayoutTransaction(requests, keypair.publicKey);
      const { blockhash, lastValidBlockHeight } = await client.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);
      const signature = await client.sendRawTransaction(tx.serialize());
      return { signature, blockhash, lastValidBlockHeight, client };
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error)) {
        throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Solana transaction could not be sent.", { cause: error });
      }
    }
  }
  throw new PayoutRailError("SOLANA_EXECUTION_FAILED", "Solana transaction could not be sent.", { cause: lastError });
}

async function execute(requests: PayoutRequest[], clients: SolanaRpcClient[] = defaultRpcClients()): Promise<PayoutReceipt> {
  const keypair = keypairFromEnv();
  const intentIds = requests.map((request) => request.intentId).join(",");
  const sent = await sendWithFallback(requests, keypair, clients);
  const receipt = { digest: sent.signature, explorerUrl: solanaExplorerTxUrl(sent.signature) };

  try {
    await sent.client.confirmTransaction(
      { signature: sent.signature, blockhash: sent.blockhash, lastValidBlockHeight: sent.lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // Still ask every endpoint. confirmTransaction waiting is not the paid decision.
  }

  const quorum = await reconcileSignatureQuorum(sent.signature, clients);
  if (quorum === "confirmed") return { ...receipt, confirmation: "confirmed" };
  if (quorum === "pending") return { ...receipt, confirmation: "pending" };

  console.error(`[solana-rail] confirmation failed for intent ${intentIds}, signature ${sent.signature}`);
  throw new PayoutRailError("SOLANA_EXECUTION_FAILED", `Solana transaction ${sent.signature} did not confirm.`);
}

export function createSolanaRail(clients: SolanaRpcClient[]): PayoutRail {
  return {
    async send(request) {
      return execute([request], clients);
    },
    async batch(requests) {
      return execute(requests, clients);
    }
  };
}

export const solanaRail: PayoutRail = {
  async send(request) {
    return execute([request]);
  },
  async batch(requests) {
    return execute(requests);
  }
};
