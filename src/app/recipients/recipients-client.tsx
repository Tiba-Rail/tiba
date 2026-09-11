"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ConnectModal, useCurrentAccount } from "@mysten/dapp-kit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { OperatorTokenField } from "@/components/operator-token-field";
import { humanError } from "@/app/console/types";
import { OpenInSlush } from "@/components/open-in-slush";
import { isSolanaAddress, isSuiAddress, shortAddress } from "@/app/format";

interface Recipient {
  ref: string;
  displayName: string;
  suiAddress: string;
  solanaAddress?: string | null;
  active: boolean;
  kycStatus: string;
  kycProvider: string | null;
  kycVerifiedAt: string | null;
  kycExpiresAt: string | null;
}

function kycPill(status: string): { className: string; label: string } {
  if (status === "verified") return { className: "pill pill-paid", label: "Verified" };
  if (status === "failed") return { className: "pill pill-refused", label: "Verification failed" };
  return { className: "pill pill-held", label: "Not verified" };
}

// Every saved address once, labelled by its format (the server may pass a coalesced value).
function savedWallets(recipient: Recipient): { chain: string; address: string }[] {
  const addresses = [recipient.solanaAddress, recipient.suiAddress].filter((a): a is string => Boolean(a));
  return [...new Set(addresses)].map((address) => ({ chain: isSuiAddress(address) ? "Sui" : "Solana", address }));
}

interface AddressFieldProps {
  label: string;
  name: string;
  value: string;
  connected: string;
  fromWallet: boolean;
  onChange: (value: string | null) => void;
}

// `fromWallet` is true while the field still shows the connected wallet's address.
function AddressField({ label, name, value, connected, fromWallet, onChange }: AddressFieldProps) {
  return (
    <>
      <label className="block text-sm font-medium">
        {label}
        <input
          className="field mt-1"
          name={name}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {connected && fromWallet && (
        <div className="-mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="num">Address from your connected wallet - {shortAddress(connected)}</span>
          <button type="button" className="link" onClick={() => onChange("")}>
            Use a different address
          </button>
        </div>
      )}
    </>
  );
}

interface RecipientsClientProps {
  recipients: Recipient[];
}

export function RecipientsClient({ recipients }: RecipientsClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const suiAccount = useCurrentAccount();
  const { publicKey } = useWallet();
  const { setVisible: openSolanaModal } = useWalletModal();
  // null = follow the connected wallet; a string = what the user typed.
  const [manualSui, setManualSui] = useState<string | null>(null);
  const [manualSolana, setManualSolana] = useState<string | null>(null);

  const connectedSui = suiAccount?.address ?? "";
  const connectedSolana = publicKey?.toBase58() ?? "";
  const suiValue = manualSui ?? connectedSui;
  const solanaValue = manualSolana ?? connectedSolana;

  async function post(path: string, body: Record<string, unknown>, busyLabel: string, success = "Recipient saved.") {
    setBusy(busyLabel);
    setError(null);
    setMessage(null);
    try {
      const token = window.sessionStorage.getItem("tiba_operator_token");
      if (!token) {
        throw new Error("OPERATOR_TOKEN_REQUIRED");
      }

      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");
      setMessage(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(null);
    }
  }

  async function registerRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sui = suiValue.trim();
    const solana = solanaValue.trim();

    // A recipient needs at least one address; each one given must look right for its chain.
    const invalid =
      !sui && !solana ? "RECIPIENT_NO_CHAIN_ADDRESS" :
      solana && !isSolanaAddress(solana) ? "INVALID_SOLANA_ADDRESS" :
      sui && !isSuiAddress(sui) ? "INVALID_SUI_ADDRESS" :
      null;
    if (invalid) {
      setMessage(null);
      setError(invalid);
      return;
    }

    await post("/api/v1/recipients", {
      ref: form.get("ref"),
      display_name: form.get("display_name"),
      ...(sui ? { sui_address: sui } : {}),
      ...(solana ? { solana_address: solana } : {}),
      active: true
    }, "recipient");
    formElement.reset();
    setManualSui(null);
    setManualSolana(null);
  }

  async function verifyIdentity(ref: string) {
    await post(`/api/v1/recipients/${encodeURIComponent(ref)}/verify`, {}, `verify:${ref}`, "Identity verified.");
  }

  const inputClass = "field mt-1";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Recipients</p>
          <h1 className="display-l mt-2">Saved recipients</h1>
        </div>
      </header>

      {(message || error) && (
        <div className={error ? "card p-4 text-red-ink" : "card p-4 text-paid"}>
          {error ? (
            <>
              {humanError(error).text}
              <span className="num mt-1 block text-xs text-muted">{humanError(error).code}</span>
            </>
          ) : (
            message
          )}
        </div>
      )}

      <section className="card p-5">
        <h2 className="title mb-4">Recipients</h2>
        <div className="divide-y divide-line">
          {recipients.length === 0 ? (
            <p className="py-6 text-sm text-muted">No recipients yet. Add the first one below.</p>
          ) : recipients.map((recipient) => (
            <div key={recipient.ref} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{recipient.displayName}</p>
                <span className={recipient.active ? "text-sm text-paid" : "text-sm text-red-ink"}>
                  {recipient.active ? "ready" : "blocked"}
                </span>
              </div>
              <p className="num mt-1 text-xs text-muted">ID {recipient.ref}</p>
              {savedWallets(recipient).map((wallet) => (
                <p key={wallet.address} className="num mt-2 break-all text-xs text-muted">
                  {wallet.chain} wallet {wallet.address}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3">
                <span className={kycPill(recipient.kycStatus).className}>{kycPill(recipient.kycStatus).label}</span>
                <span className="min-w-0 flex-1 break-words text-xs text-muted">
                  {recipient.kycProvider ? "verified" : "not verified yet"}
                  {recipient.kycVerifiedAt ? ` · ${recipient.kycVerifiedAt}` : ""}
                  {recipient.kycExpiresAt ? ` · valid until ${recipient.kycExpiresAt}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary ml-auto shrink-0"
                  disabled={busy === `verify:${recipient.ref}`}
                  aria-busy={busy === `verify:${recipient.ref}`}
                  onClick={() => verifyIdentity(recipient.ref)}
                >
                  {busy === `verify:${recipient.ref}` ? "Checking…" : "Verify identity"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="title">Add recipient</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-secondary" type="button" onClick={() => openSolanaModal(true)}>
              Use my Solana wallet
            </button>
            <ConnectModal
              trigger={
                <button className="btn btn-secondary" type="button">
                  Use my Sui wallet
                </button>
              }
            />
            <OpenInSlush className="btn btn-secondary" />
          </div>
        </div>
        <form onSubmit={registerRecipient} className="space-y-4">
          <label className="block text-sm font-medium">
            Short ID (e.g. translator-kl)
            <input
              className={inputClass}
              name="ref"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <label className="block text-sm font-medium">
            Name
            <input
              className={inputClass}
              name="display_name"
              type="text"
              autoComplete="name"
              spellCheck={false}
              required
            />
          </label>

          <AddressField
            label="Solana wallet address (devnet)"
            name="solana_address"
            value={solanaValue}
            connected={connectedSolana}
            fromWallet={manualSolana === null}
            onChange={setManualSolana}
          />

          <AddressField
            label="Sui wallet address (testnet)"
            name="sui_address"
            value={suiValue}
            connected={connectedSui}
            fromWallet={manualSui === null}
            onChange={setManualSui}
          />

          <div className="flex flex-wrap items-start gap-4">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "recipient"}
              aria-busy={busy === "recipient"}
            >
              {busy === "recipient" ? "Saving…" : "Save recipient"}
            </button>

            <OperatorTokenField className="basis-full md:basis-auto" />
          </div>
        </form>
        <p className="mt-4 text-sm text-muted">
          Get paid to the wallet you already have. Connect it and the address fills in - no copying. Phantom or Solflare fill the Solana address; Slush, Suiet, OKX, Bitget, Nightly, Backpack and other Sui wallets fill the Sui address. Save either or both: a recipient with a Solana address is paid on Solana, otherwise on Sui.
        </p>
      </section>
    </div>
  );
}
