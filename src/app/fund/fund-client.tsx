"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectModal, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction as SolanaTransaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { chainName, explorerTxUrl, shortAddress, suiToMist, type Chain } from "@/app/format";
import { parseUsdcToMicros } from "@/lib/money";
import { OpenInSlush } from "@/components/open-in-slush";

// Circle's devnet USDC mint (6 decimals), the same default as the server rail.
const SOLANA_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_DECIMALS = 6;

interface FundClientProps {
  /** Chain of `address`, the default chain's treasury shown in the manual-send panel. */
  chain: Chain;
  address: string;
  shortAddress: string;
  qrSvg: string;
  balanceText: string;
  suiAddress: string | null;
  solanaAddress: string | null;
}

function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rejected|cancelled|declined|user denied/i.test(message);
}

function SuiDeposit({ treasury }: { treasury: string }) {
  const account = useCurrentAccount();
  const [amount, setAmount] = useState("");
  const [digest, setDigest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction({
    onSuccess: (result) => {
      if ("digest" in result && typeof result.digest === "string") {
        setDigest(result.digest);
      }
      setBusy(false);
    },
    onError: (error) => {
      if (isUserRejection(error)) {
        setBusy(false);
        return;
      }
      setError(error instanceof Error ? error.message : "Transaction failed");
      setBusy(false);
    }
  });

  async function handleDeposit() {
    if (!account) {
      setError("Connect a wallet first.");
      return;
    }

    const mist = suiToMist(amount);
    if (mist === null || mist <= 0n) {
      setError("Enter a positive SUI amount, up to 9 decimals.");
      return;
    }

    setBusy(true);
    setError(null);
    setDigest(null);

    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [mist]);
    tx.transferObjects([coin], treasury);

    signAndExecute({ transaction: tx });
  }

  return (
    <section className="card p-5">
      <p className="eyebrow">Add funds on Sui</p>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConnectModal
            trigger={
              <button type="button" className="btn btn-secondary">
                {account ? "Sui wallet connected" : "Connect a Sui wallet"}
              </button>
            }
          />
          <OpenInSlush className="btn btn-secondary" />
          {account && (
            <span className="num text-sm text-muted">
              {shortAddress(account.address)}
            </span>
          )}
        </div>

        <label className="block text-sm font-medium">
          Amount (SUI, testnet)
          <input
            className="field mt-1"
            type="text"
            inputMode="decimal"
            pattern="^\d+(\.\d{1,9})?$"
            placeholder="0.1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
          />
        </label>

        {error && (
          <p className="text-sm text-red-ink">{error}</p>
        )}

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !account}
          onClick={handleDeposit}
        >
          {busy ? "Confirm in wallet…" : "Deposit SUI"}
        </button>

        {digest && (
          <p className="text-sm">
            Sent.{" "}
            <a className="link" href={explorerTxUrl("sui", digest)} target="_blank" rel="noopener noreferrer">
              View on Suiscan →
            </a>
          </p>
        )}

        <p className="text-sm text-muted">
          Need test SUI?{" "}
          <a
            className="link"
            href={`https://faucet.sui.io/?address=${encodeURIComponent(treasury)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Sui testnet faucet →
          </a>
        </p>
      </div>
    </section>
  );
}

// Sends devnet USDC from the connected Phantom/Solflare wallet to the Solana treasury:
// create the treasury's token account if missing (idempotent), then transferChecked.
function SolanaDeposit({ treasury }: { treasury: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const [amount, setAmount] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeposit() {
    if (!publicKey) {
      setError("Connect a Solana wallet first.");
      return;
    }

    const micros = parseUsdcToMicros(amount);
    if (micros === null || micros <= 0n) {
      setError("Enter a positive USDC amount, up to 6 decimals.");
      return;
    }

    setBusy(true);
    setError(null);
    setSignature(null);

    try {
      const owner = new PublicKey(treasury);
      const fromAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, publicKey);
      const toAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, owner);
      const tx = new SolanaTransaction().add(
        createAssociatedTokenAccountIdempotentInstruction(publicKey, toAta, owner, SOLANA_USDC_MINT),
        createTransferCheckedInstruction(fromAta, SOLANA_USDC_MINT, toAta, publicKey, micros, USDC_DECIMALS)
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sent = await sendTransaction(tx, connection);
      // Shown before confirmation so a slow confirm never hides a transfer that went out.
      setSignature(sent);
      const confirmation = await connection.confirmTransaction(
        { signature: sent, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) setError("The transfer failed on chain. Check the explorer link.");
    } catch (caught) {
      if (!isUserRejection(caught)) {
        setError(caught instanceof Error ? caught.message : "Transaction failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <p className="eyebrow">Add funds on Solana</p>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => openWalletModal(true)}>
            {publicKey ? "Solana wallet connected" : "Connect Phantom or Solflare"}
          </button>
          {publicKey && (
            <span className="num text-sm text-muted">
              {shortAddress(publicKey.toBase58())}
            </span>
          )}
        </div>

        <label className="block text-sm font-medium">
          Amount (USDC, devnet)
          <input
            className="field mt-1"
            type="text"
            inputMode="decimal"
            pattern="^\d+(\.\d{1,6})?$"
            placeholder="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
          />
        </label>

        {error && (
          <p className="text-sm text-red-ink">{error}</p>
        )}

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !publicKey}
          onClick={handleDeposit}
        >
          {busy ? "Confirm in wallet…" : "Deposit USDC"}
        </button>

        {signature && (
          <p className="text-sm">
            Sent.{" "}
            <a className="link" href={explorerTxUrl("solana", signature)} target="_blank" rel="noopener noreferrer">
              View on Solana Explorer →
            </a>
          </p>
        )}

        <p className="text-sm text-muted">
          Need test funds? Get devnet SOL for fees at{" "}
          <a className="link" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">
            faucet.solana.com
          </a>{" "}
          and devnet USDC at{" "}
          <a className="link" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">
            faucet.circle.com
          </a>
          .
        </p>
      </div>
    </section>
  );
}

export function FundClient({
  chain,
  address,
  shortAddress: shortTreasury,
  qrSvg,
  balanceText,
  suiAddress,
  solanaAddress
}: FundClientProps) {
  function copyAddress() {
    void navigator.clipboard.writeText(address);
  }

  const sui = suiAddress ? <SuiDeposit key="sui" treasury={suiAddress} /> : null;
  const solana = solanaAddress ? <SolanaDeposit key="solana" treasury={solanaAddress} /> : null;

  return (
    <div className="space-y-6">
      {chain === "solana" ? [solana, sui] : [sui, solana]}

      <details className="card p-5">
        <summary className="cursor-pointer text-sm text-muted">Or send manually from another wallet</summary>
        <div className="mt-4">
          <p className="eyebrow">Settlement account ({chainName(chain)})</p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            <div className="shrink-0">
              <div
                className="rounded border border-line [&>svg]:block [&>svg]:h-[180px] [&>svg]:w-[180px]"
                role="img"
                aria-label="QR code for the settlement address"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted">Address</p>
              <p className="num break-all text-sm">{address}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={copyAddress}
                >
                  Copy
                </button>
                <span className="num text-sm text-muted" aria-label="Short address">
                  {shortTreasury}
                </span>
              </div>
              <p className="mt-4 text-sm text-muted">
                Current balance: <span className="num font-medium text-foreground">{balanceText}</span>
              </p>
            </div>
          </div>
        </div>
      </details>

      <Link className="link" href="/app">
        ← Back to Home
      </Link>
    </div>
  );
}
