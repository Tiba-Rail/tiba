import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { encodeBase58, isBase58Signature } from "../rails/base58.ts";
import { solanaRpcEndpoints } from "../rails/solana.ts";

/** What a confirmed transaction on chain looks like to the proof: its error, and who signed it. */
export type ChainTransaction = { err: unknown; signatures: string[] };
export type ChainTransactionReader = (signature: string) => Promise<ChainTransaction | null>;

/**
 * Tiba's own signature inside the partially signed x402 transaction it handed to the seller.
 * That signature covers the exact amount, mint, payTo and blockhash the checks cleared, so
 * finding it in a confirmed on-chain transaction proves the transfer is the one Tiba approved.
 */
export function treasurySignatureOf(serializedTransaction: string, payer: PublicKey | string): string | null {
  try {
    const tx = VersionedTransaction.deserialize(Buffer.from(serializedTransaction, "base64"));
    const payerKey = typeof payer === "string" ? payer : payer.toBase58();
    const index = tx.message.staticAccountKeys.findIndex((key) => key.toBase58() === payerKey);
    if (index < 0 || index >= tx.signatures.length) return null;
    const signature = tx.signatures[index];
    if (!signature || signature.every((byte) => byte === 0)) return null;
    return encodeBase58(signature);
  } catch {
    return null;
  }
}

/**
 * True only when the seller's transaction id names a confirmed transaction with no error whose
 * signers include Tiba's own signature. Anything else (bad id, not found, RPC down, a different
 * transaction) is not proof, and the intent stays pending.
 */
export async function x402SettlementProven(
  digest: string | null | undefined,
  expectedSignature: string | null | undefined,
  read: ChainTransactionReader
): Promise<boolean> {
  if (!digest || !expectedSignature) return false;
  if (!isBase58Signature(digest) || !isBase58Signature(expectedSignature)) return false;
  let onChain: ChainTransaction | null;
  try {
    onChain = await read(digest);
  } catch {
    return false;
  }
  if (!onChain) return false;
  if (onChain.err !== null && onChain.err !== undefined) return false;
  return onChain.signatures.includes(expectedSignature);
}

async function readFrom(url: string, signature: string): Promise<ChainTransaction | null> {
  const tx = await new Connection(url, "confirmed").getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0
  });
  if (!tx) return null;
  return { err: tx.meta?.err ?? null, signatures: tx.transaction.signatures };
}

/** Primary RPC first; the witness RPC when the primary fails or has not seen the transaction. */
export async function readSolanaTransaction(signature: string): Promise<ChainTransaction | null> {
  const { primary, witness } = solanaRpcEndpoints();
  try {
    const found = await readFrom(primary, signature);
    if (found) return found;
  } catch {
    // fall through to the witness
  }
  if (witness === primary) return null;
  return readFrom(witness, signature);
}
