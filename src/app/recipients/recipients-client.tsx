"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { OperatorTokenField } from "@/components/operator-token-field";
import { humanError } from "@/app/console/types";
import { isSolanaAddress, shortAddress } from "@/app/format";

interface Recipient { ref: string; displayName: string; solanaAddress: string | null; active: boolean; kycStatus: string; kycProvider: string | null; kycVerifiedAt: string | null; kycExpiresAt: string | null; }
function kycPill(status: string) { return status === "verified" ? { className: "pill pill-paid", label: "Verified" } : status === "failed" ? { className: "pill pill-refused", label: "Verification failed" } : { className: "pill pill-held", label: "Not verified" }; }

export function RecipientsClient({ recipients }: { recipients: Recipient[] }) {
  const router = useRouter(); const { publicKey } = useWallet(); const { setVisible: openWalletModal } = useWalletModal();
  const [manualAddress, setManualAddress] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const address = manualAddress ?? publicKey?.toBase58() ?? "";
  async function post(path: string, body: Record<string, unknown>, busyLabel: string, success = "Recipient saved.") {
    setBusy(busyLabel); setError(null); setMessage(null);
    try { const token = window.sessionStorage.getItem("tiba_operator_token"); if (!token) throw new Error("OPERATOR_TOKEN_REQUIRED"); const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED"); setMessage(success); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "REQUEST_FAILED"); } finally { setBusy(null); }
  }
  async function registerRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const value = address.trim();
    if (!value || !isSolanaAddress(value)) { setError(!value ? "RECIPIENT_NEEDS_SOLANA_ADDRESS" : "INVALID_SOLANA_ADDRESS"); return; }
    await post("/api/v1/recipients", { ref: form.get("ref"), display_name: form.get("display_name"), solana_address: value, active: true }, "recipient"); event.currentTarget.reset(); setManualAddress(null);
  }
  async function verifyIdentity(ref: string) { await post(`/api/v1/recipients/${encodeURIComponent(ref)}/verify`, {}, `verify:${ref}`, "Identity verified."); }
  return <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
    <header><p className="eyebrow">Recipients</p><h1 className="display-l mt-2">Saved recipients</h1></header>
    {(message || error) ? <div className={error ? "card p-4 text-red-ink" : "card p-4 text-paid"}>{error ? <>{humanError(error).text}<span className="num mt-1 block text-xs text-muted">{humanError(error).code}</span></> : message}</div> : null}
    <section className="card p-5"><h2 className="title mb-4">Recipients</h2><div className="divide-y divide-line">{recipients.length === 0 ? <p className="py-6 text-sm text-muted">No recipients yet. Add the first one below.</p> : recipients.map((recipient) => <div key={recipient.ref} className="py-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{recipient.displayName}</p><span className={recipient.active && recipient.solanaAddress ? "text-sm text-paid" : "text-sm text-red-ink"}>{recipient.active && recipient.solanaAddress ? "ready" : "needs a Solana address"}</span></div><p className="num mt-1 text-xs text-muted">ID {recipient.ref}</p>{recipient.solanaAddress ? <p className="num mt-2 break-all text-xs text-muted">Solana wallet {recipient.solanaAddress}</p> : <p className="mt-2 text-xs text-red-ink">Needs a Solana address before Tiba can pay this recipient.</p>}<div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3"><span className={kycPill(recipient.kycStatus).className}>{kycPill(recipient.kycStatus).label}</span><span className="min-w-0 flex-1 break-words text-xs text-muted">{recipient.kycProvider ? "verified" : "not verified yet"}{recipient.kycVerifiedAt ? ` · ${recipient.kycVerifiedAt}` : ""}{recipient.kycExpiresAt ? ` · valid until ${recipient.kycExpiresAt}` : ""}</span><button type="button" className="btn btn-secondary ml-auto shrink-0" disabled={busy === `verify:${recipient.ref}`} onClick={() => verifyIdentity(recipient.ref)}>{busy === `verify:${recipient.ref}` ? "Checking…" : "Verify identity"}</button></div></div>)}</div></section>
    <section className="card p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="title">Add recipient</h2><button className="btn btn-secondary" type="button" onClick={() => openWalletModal(true)}>Use my Solana wallet</button></div><form onSubmit={registerRecipient} className="space-y-4"><label className="block text-sm font-medium">Short ID (e.g. translator-kl)<input className="field mt-1" name="ref" type="text" autoComplete="off" spellCheck={false} required /></label><label className="block text-sm font-medium">Name<input className="field mt-1" name="display_name" type="text" autoComplete="name" spellCheck={false} required /></label><label className="block text-sm font-medium">Solana wallet address (devnet)<input className="field mt-1" name="solana_address" type="text" autoComplete="off" spellCheck={false} value={address} onChange={(event) => setManualAddress(event.target.value)} /></label>{publicKey && manualAddress === null ? <div className="-mt-2 text-xs text-muted">Address from your connected wallet — {shortAddress(publicKey.toBase58())}</div> : null}<div className="flex flex-wrap items-start gap-4"><button className="btn btn-primary" type="submit" disabled={busy === "recipient"}>{busy === "recipient" ? "Saving…" : "Save recipient"}</button><OperatorTokenField className="basis-full md:basis-auto" /></div></form><p className="mt-4 text-sm text-muted">Recipients are paid in devnet USDC to their Solana wallet.</p></section>
  </div>;
}
