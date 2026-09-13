"use client";

import { useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { chainName, explorerTxUrl, shortAddress, type Chain } from "@/app/format";
import { parseUsdcToMicros } from "@/lib/money";

const SOLANA_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_DECIMALS = 6;

interface FundClientProps {
  chain: Chain;
  address: string;
  shortAddress: string;
  qrSvg: string;
  balanceText: string;
  solanaAddress: string | null;
}

function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rejected|cancelled|declined|user denied/i.test(message);
}

function SolanaDeposit({ treasury }: { treasury: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const [amount, setAmount] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeposit() {
    if (!publicKey) return setError("Connect a Solana wallet first.");
    const micros = parseUsdcToMicros(amount);
    if (micros === null || micros <= 0n) return setError("Enter a positive USDC amount, up to 6 decimals.");
    setBusy(true);
    setError(null);
    setSignature(null);
    try {
      const owner = new PublicKey(treasury);
      const fromAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, publicKey);
      const toAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, owner);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(publicKey, toAta, owner, SOLANA_USDC_MINT),
        createTransferCheckedInstruction(fromAta, SOLANA_USDC_MINT, toAta, publicKey, micros, USDC_DECIMALS)
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sent = await sendTransaction(tx, connection);
      setSignature(sent);
      const confirmation = await connection.confirmTransaction({ signature: sent, blockhash, lastValidBlockHeight }, "confirmed");
      if (confirmation.value.err) setError("The transfer failed on chain. Check the explorer link.");
    } catch (caught) {
      if (!isUserRejection(caught)) setError(caught instanceof Error ? caught.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card p-5">
    <p className="eyebrow">Add funds on Solana</p>
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => openWalletModal(true)}>
          {publicKey ? "Solana wallet connected" : "Connect Phantom or Solflare"}
        </button>
        {publicKey ? <span className="num text-sm text-muted">{shortAddress(publicKey.toBase58())}</span> : null}
      </div>
      <label className="block text-sm font-medium">Amount (USDC, devnet)
        <input className="field mt-1" type="text" inputMode="decimal" pattern="^\\d+(\\.\\d{1,6})?$" placeholder="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} />
      </label>
      {error ? <p className="text-sm text-red-ink">{error}</p> : null}
      <button type="button" className="btn btn-primary" disabled={busy || !publicKey} onClick={handleDeposit}>{busy ? "Confirm in wallet…" : "Deposit USDC"}</button>
      {signature ? <p className="text-sm">Sent. <a className="link" href={explorerTxUrl("solana", signature)} target="_blank" rel="noopener noreferrer">View on Solana Explorer →</a></p> : null}
      <p className="text-sm text-muted">Need test funds? Get devnet SOL for fees at <a className="link" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">faucet.solana.com</a> and devnet USDC at <a className="link" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">faucet.circle.com</a>.</p>
    </div>
  </section>;
}

export function FundClient({ chain, address, shortAddress: shortTreasury, qrSvg, balanceText, solanaAddress }: FundClientProps) {
  return <div className="space-y-6">
    {solanaAddress ? <SolanaDeposit treasury={solanaAddress} /> : null}
    <details className="card p-5">
      <summary className="cursor-pointer text-sm text-muted">Or send manually from another wallet</summary>
      <div className="mt-4">
        <p className="eyebrow">Settlement account ({chainName(chain)})</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="shrink-0"><div className="rounded border border-line [&>svg]:block [&>svg]:h-[180px] [&>svg]:w-[180px]" role="img" aria-label="QR code for the settlement address" dangerouslySetInnerHTML={{ __html: qrSvg }} /></div>
          <div className="flex-1 space-y-2"><p className="text-sm text-muted">Address</p><p className="num break-all text-sm">{address}</p><div className="flex flex-wrap items-center gap-3"><button type="button" className="btn btn-secondary" onClick={() => void navigator.clipboard.writeText(address)}>Copy</button><span className="num text-sm text-muted">{shortTreasury}</span></div><p className="mt-4 text-sm text-muted">Current balance: <span className="num font-medium text-foreground">{balanceText}</span></p></div>
        </div>
      </div>
    </details>
    <Link className="link" href="/app">← Back to Home</Link>
  </div>;
}
