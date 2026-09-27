"use client";

import { useState, type FormEvent } from "react";
import { microsToUsdc } from "@/lib/money";
import { decisionSentence, explainDecision, humanError } from "@/app/console/types";
import type { BountyPublicClaim, BountyPublicData } from "./bounty-public-view";

interface BountyClaimClientProps {
  bounty: BountyPublicData;
  initialClaims: BountyPublicClaim[];
}

interface ClaimResult {
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  publicToken: string | null;
}

function shareUrl(shareCode: string): string {
  if (typeof window === "undefined") return `/b/${shareCode}`;
  return `${window.location.origin}/b/${shareCode}`;
}

function discordMessage(bounty: BountyPublicData): string {
  return [
    `📋 **${bounty.title}** — ${microsToUsdc(bounty.amountMicros)}`,
    bounty.doneCriteria,
    "",
    `Claim it: ${shareUrl(bounty.shareCode)}`
  ].join("\n");
}

export function BountyClaimClient({ bounty }: BountyClaimClientProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);
  const closed = bounty.status !== "open";

  async function copyForDiscord() {
    try {
      await navigator.clipboard.writeText(discordMessage(bounty));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/v1/bounties/${bounty.id}/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          work_link: form.get("work_link"),
          claimer_solana_address: form.get("claimer_solana_address"),
          amount_asked_usdc: form.get("amount_asked_usdc"),
          summary: form.get("summary")
        })
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "REQUEST_FAILED");
      setResult({
        status: String(payload.status ?? ""),
        decisionClass: String(payload.decision_class ?? ""),
        reasonCode: typeof payload.reason_code === "string" ? payload.reason_code : null,
        publicToken: typeof payload.public_token === "string" ? payload.public_token : null
      });
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "field mt-1";

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="title">Claim this bounty</h2>
        <button type="button" className="btn-quiet" onClick={copyForDiscord}>
          {copied ? "Copied" : "Copy for Discord"}
        </button>
      </div>

      {closed && <p className="text-muted">This bounty is closed and no longer taking claims.</p>}

      {error && (
        <div className="mb-4 rounded-md border border-line bg-surface p-4 text-red-ink">
          {humanError(error).text}
          <span className="num mt-1 block text-xs text-muted">{humanError(error).code}</span>
        </div>
      )}

      {result && (
        <div className="mb-4 rounded-md border border-line bg-surface p-4">
          <p className="font-medium">{decisionSentence(result.decisionClass)}</p>
          {result.decisionClass !== "PAID" && (
            <p className="mt-1 text-sm text-muted">{explainDecision(result.decisionClass, result.reasonCode)}</p>
          )}
          {result.publicToken && (
            <a className="link mt-2 inline-block text-sm" href={`/r/${result.publicToken}`}>See the receipt</a>
          )}
        </div>
      )}

      {!closed && (
        <form onSubmit={submitClaim} className="space-y-4">
          <label className="block text-sm font-medium">
            Link to your work
            <input className={inputClass} name="work_link" type="url" autoComplete="off" required />
          </label>

          <label className="block text-sm font-medium">
            Your Solana address
            <input className={`${inputClass} font-mono`} name="claimer_solana_address" type="text" autoComplete="off" spellCheck={false} required />
          </label>

          <label className="block text-sm font-medium">
            Amount asked (USDC)
            <input className={inputClass} name="amount_asked_usdc" type="text" inputMode="decimal" autoComplete="off" required />
          </label>

          <label className="block text-sm font-medium">
            What you did
            <textarea className={inputClass} name="summary" rows={3} required />
          </label>

          <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Checking…" : "Submit claim"}
          </button>
        </form>
      )}
    </section>
  );
}
