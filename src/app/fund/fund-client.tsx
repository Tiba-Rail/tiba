"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectModal, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { shortSuiAddress, suiToMist } from "@/app/format";
import { OpenInSlush } from "@/components/open-in-slush";

interface FundClientProps {
  address: string;
  shortAddress: string;
  qrSvg: string;
  balanceText: string;
}

function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rejected|cancelled|declined|user denied/i.test(message);
}

export function FundClient({ address, shortAddress, qrSvg, balanceText }: FundClientProps) {
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
    tx.transferObjects([coin], address);

    signAndExecute({ transaction: tx });
  }

  function copyAddress() {
    void navigator.clipboard.writeText(address);
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <p className="eyebrow">Add funds</p>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ConnectModal
              trigger={
                <button type="button" className="btn btn-secondary">
                  {account ? "Wallet connected" : "Connect to deposit"}
                </button>
              }
            />
            <OpenInSlush className="btn btn-secondary" />
            {account && (
              <span className="num text-sm text-muted">
                {shortSuiAddress(account.address)}
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
              <a
                className="link"
                href={`https://suiscan.xyz/testnet/tx/${digest}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Suiscan →
              </a>
            </p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <p className="eyebrow">Need test SUI?</p>
        <p className="mt-2 text-sm text-muted">
          Request free SUI from the Sui testnet faucet.
        </p>
        <a
          className="btn btn-secondary mt-4"
          href={`https://faucet.sui.io/?address=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Get test SUI →
        </a>
      </section>
      <details className="card p-5">
        <summary className="cursor-pointer text-sm text-muted">Or send manually from another wallet</summary>
        <div className="mt-4">
          <p className="eyebrow">Settlement account</p>
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
                  {shortAddress}
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
