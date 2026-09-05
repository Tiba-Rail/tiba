"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ConnectModal, useCurrentAccount } from "@mysten/dapp-kit";
import { OperatorTokenField } from "@/components/operator-token-field";
import { humanError } from "@/app/console/types";

interface Recipient {
  ref: string;
  displayName: string;
  suiAddress: string;
  active: boolean;
  kycStatus: string;
  kycProvider: string | null;
  kycVerifiedAt: string | null;
  kycExpiresAt: string | null;
}

function kycPill(status: string): { className: string; label: string } {
  if (status === "verified") return { className: "pill pill-paid", label: "Identity checked" };
  if (status === "failed") return { className: "pill pill-refused", label: "Identity check failed" };
  return { className: "pill pill-held", label: "Identity not checked" };
}

interface RecipientsClientProps {
  recipients: Recipient[];
}

export function RecipientsClient({ recipients }: RecipientsClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const account = useCurrentAccount();
  const [manualAddress, setManualAddress] = useState<string | null>(null);

  const walletAddress = manualAddress ?? account?.address ?? "";
  const shortAddress = account
    ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
    : "";

  async function post(path: string, body: Record<string, unknown>, busyLabel: string, success = "Person added.") {
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
    const form = new FormData(event.currentTarget);
    await post("/api/v1/recipients", {
      ref: form.get("ref"),
      display_name: form.get("display_name"),
      sui_address: form.get("sui_address"),
      active: true
    }, "recipient");
    event.currentTarget.reset();
    setManualAddress(null);
  }

  async function verifyIdentity(ref: string) {
    await post(`/api/v1/recipients/${encodeURIComponent(ref)}/verify`, {}, `verify:${ref}`, "Identity check done.");
  }

  const inputClass = "field mt-1";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="display-l mt-2">Who the program may pay</h1>
        </div>
        <p className="lede">
          The approved list. The program cannot pay anyone who is not on it.
        </p>
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
        <h2 className="title mb-4">Approved people</h2>
        <div className="divide-y divide-line">
          {recipients.length === 0 ? (
            <p className="py-6 text-sm text-muted">Nobody yet. Add the first person below.</p>
          ) : recipients.map((recipient) => (
            <div key={recipient.ref} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{recipient.displayName}</p>
                <span className={recipient.active ? "text-sm text-paid" : "text-sm text-red-ink"}>
                  {recipient.active ? "can be paid" : "blocked"}
                </span>
              </div>
              <p className="num mt-1 text-xs text-muted">ID {recipient.ref}</p>
              <p className="num mt-2 break-all text-xs text-muted">Wallet {recipient.suiAddress}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <span className={kycPill(recipient.kycStatus).className}>{kycPill(recipient.kycStatus).label}</span>
                <span className="text-xs text-muted">
                  {recipient.kycProvider ? `checked by ${recipient.kycProvider}` : "no identity check yet"}
                  {recipient.kycVerifiedAt ? ` · ${recipient.kycVerifiedAt}` : ""}
                  {recipient.kycExpiresAt ? ` · valid until ${recipient.kycExpiresAt}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary ml-auto"
                  disabled={busy === `verify:${recipient.ref}`}
                  aria-busy={busy === `verify:${recipient.ref}`}
                  onClick={() => verifyIdentity(recipient.ref)}
                >
                  {busy === `verify:${recipient.ref}` ? "Checking…" : "Run identity check"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="title">Add a person</h2>
          <ConnectModal
            trigger={
              <button className="btn btn-secondary" type="button">
                Connect wallet
              </button>
            }
          />
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

          <label className="block text-sm font-medium">
            Wallet address (test network)
            <input
              className={inputClass}
              name="sui_address"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
              value={walletAddress}
              onChange={(event) => setManualAddress(event.target.value)}
            />
          </label>
          {account && manualAddress === null && (
            <div className="-mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="num">
                Address from your connected wallet - {shortAddress}
              </span>
              <button
                type="button"
                className="link"
                onClick={() => setManualAddress("")}
              >
                Use a different address
              </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "recipient"}
              aria-busy={busy === "recipient"}
            >
              {busy === "recipient" ? "Adding…" : "Add person"}
            </button>

            <OperatorTokenField />
          </div>
        </form>
        <p className="mt-4 text-sm text-muted">
          Get paid to the wallet you already have. Connect it and the address fills in - no copying. Works with Slush, Suiet, OKX, Bitget, Nightly, Backpack and any other Sui wallet.
        </p>
      </section>
    </div>
  );
}
