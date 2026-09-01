"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { OperatorTokenField } from "@/components/operator-token-field";

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
  if (status === "verified") return { className: "pill pill-paid", label: "Verified" };
  if (status === "failed") return { className: "pill pill-red", label: "Failed" };
  return { className: "pill pill-amber", label: "Unverified" };
}

interface RecipientsClientProps {
  recipients: Recipient[];
}

export function RecipientsClient({ recipients }: RecipientsClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>, busyLabel: string, success = "Recipient registered successfully") {
    setBusy(busyLabel);
    setError(null);
    setMessage(null);
    try {
      const token = window.sessionStorage.getItem("tiba_operator_token");
      if (!token) {
        throw new Error("Operator token required");
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
      setError(caught instanceof Error ? caught.message : "Request failed");
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
  }

  async function verifyIdentity(ref: string) {
    await post(`/api/v1/recipients/${encodeURIComponent(ref)}/verify`, {}, `verify:${ref}`, "Identity check recorded");
  }

  const inputClass = "field mt-1";
  const buttonClass = "btn btn-primary";

  return (
    <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <SiteNav current="recipients" />
      
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Recipients</p>
          <h1 className="display mt-2 text-3xl md:text-5xl">Who the agent may pay</h1>
        </div>
        <p className="text-muted">
          The allowlist. An agent cannot pay anyone who is not on this list.
        </p>
      </header>

      {(message || error) && (
        <div className={error ? "card p-4 text-red-ink" : "card p-4 text-paid"}>
          {error ?? message}
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-xl font-bold">Recipients</h2>
        <div className="space-y-3">
          {recipients.length === 0 ? (
            <p className="py-6 text-sm text-muted">No recipients registered.</p>
          ) : recipients.map((recipient) => (
            <div key={recipient.ref} className="card p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{recipient.displayName}</p>
                <span className={recipient.active ? "text-sm text-paid" : "text-sm text-red-ink"}>
                  {recipient.active ? "active" : "inactive"}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted">{recipient.ref}</p>
              <p className="mt-2 break-all font-mono text-xs text-muted">{recipient.suiAddress}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <span className={kycPill(recipient.kycStatus).className}>{kycPill(recipient.kycStatus).label}</span>
                <span className="text-xs text-muted">
                  {recipient.kycProvider ? `via ${recipient.kycProvider}` : "no identity check yet"}
                  {recipient.kycVerifiedAt ? ` · ${recipient.kycVerifiedAt}` : ""}
                  {recipient.kycExpiresAt ? ` · expires ${recipient.kycExpiresAt}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary ml-auto"
                  disabled={busy === `verify:${recipient.ref}`}
                  aria-busy={busy === `verify:${recipient.ref}`}
                  onClick={() => verifyIdentity(recipient.ref)}
                >
                  {busy === `verify:${recipient.ref}` ? "Checking..." : "Verify identity"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-xl font-bold">Register recipient</h2>
        <form onSubmit={registerRecipient} className="space-y-4">
          <label className="block text-sm font-medium">
            Recipient ref
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
            Display name
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
            Sui testnet address
            <input
              className={inputClass}
              name="sui_address"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          
          <div className="flex items-center gap-4">
            <button 
              className={buttonClass} 
              type="submit" 
              disabled={busy === "recipient"} 
              aria-busy={busy === "recipient"}
            >
              {busy === "recipient" ? "Registering..." : "Register recipient"}
            </button>
            
            <OperatorTokenField />
          </div>
        </form>
      </section>
    </div>
    </main>
  );
}