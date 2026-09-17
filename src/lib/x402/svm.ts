import { randomBytes } from "node:crypto";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SOLANA_USDC_DECIMALS, solanaConnection } from "../rails/solana.ts";
import { feePayerOf } from "./required.ts";
import type { PaymentRequirements } from "./types.ts";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DEFAULT_CU_LIMIT = 200_000;
const DEFAULT_CU_PRICE = 1;

function memoData(extra: Record<string, unknown> | undefined): Buffer {
  const memo = extra?.memo;
  if (typeof memo === "string" && memo.length > 0) {
    const data = Buffer.from(memo, "utf8");
    if (data.length > 256) throw new Error("X402_MEMO_TOO_LONG");
    return data;
  }
  return Buffer.from(randomBytes(16).toString("hex"), "utf8");
}

async function recentBlockhash(extra: Record<string, unknown> | undefined): Promise<string> {
  const hinted = extra?.recentBlockhash;
  if (typeof hinted === "string" && hinted.trim()) return hinted.trim();
  const { blockhash } = await solanaConnection().getLatestBlockhash("confirmed");
  return blockhash;
}

/**
 * Partially-signed SVM `exact` payment: facilitator is fee-payer, Tiba signs only the
 * SPL `transfer_checked`. The facilitator later adds the missing fee-payer signature.
 */
export async function buildExactSvmTransaction(
  payer: Keypair,
  accepted: PaymentRequirements
): Promise<VersionedTransaction> {
  const feePayer = new PublicKey(feePayerOf(accepted));
  const mint = new PublicKey(accepted.asset);
  const payTo = new PublicKey(accepted.payTo);
  const sourceAta = getAssociatedTokenAddressSync(mint, payer.publicKey, true);
  const destAta = getAssociatedTokenAddressSync(mint, payTo, true);
  const blockhash = await recentBlockhash(accepted.extra);

  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: DEFAULT_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DEFAULT_CU_PRICE }),
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      payer.publicKey,
      BigInt(accepted.amount),
      SOLANA_USDC_DECIMALS
    ),
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: memoData(accepted.extra)
    })
  ];

  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  return tx;
}

export function serializePartialSvmTransaction(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function signExactSvmPayment(payer: Keypair, accepted: PaymentRequirements): Promise<string> {
  const tx = await buildExactSvmTransaction(payer, accepted);
  return serializePartialSvmTransaction(tx);
}
