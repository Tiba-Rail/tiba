"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OperatorTokenField } from "@/components/operator-token-field";
import { humanError } from "@/app/console/types";

interface Bounty {
  id: string;
  title: string;
  doneCriteria: string;
  amount: string;
  allowedClaimers: string[];
  shareCode: string;
  status: string;
  claimCount: number;
}

interface BountiesClientProps {
  bounties: Bounty[];
}

function shareUrl(shareCode: string): string {
  if (typeof window === "undefined") return `/b/${shareCode}`;
  return `${window.location.origin}/b/${shareCode}`;
}

function discordMessage(bounty: Bounty): string {
  return [
    `📋 **${bounty.title}** — ${bounty.amount}`,
    bounty.doneCriteria,
    "",
    `Claim it: ${shareUrl(bounty.shareCode)}`
  ].join("\n");
}

function CopyForDiscordButton({ bounty }: { bounty: Bounty }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(discordMessage(bounty));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="btn-quiet" onClick={copy}>
      {copied ? "Copied" : "Copy for Discord"}
    </button>
  );
}

export function BountiesClient({ bounties }: BountiesClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createBounty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = window.sessionStorage.getItem("tiba_operator_token");
      if (!token) throw new Error("OPERATOR_TOKEN_REQUIRED");

      const form = new FormData(event.currentTarget);
      const allowedClaimersRaw = String(form.get("allowed_claimers") ?? "");
      const allowedClaimers = allowedClaimersRaw
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);

      const response = await fetch("/api/v1/bounties", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.get("title"),
          done_criteria: form.get("done_criteria"),
          amount_usdc: form.get("amount_usdc"),
          allowed_claimers: allowedClaimers
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");
      setMessage("Bounty posted.");
      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "field mt-1";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Bounties</p>
          <h1 className="display-l mt-2">Post a bounty, pay the claim that earns it</h1>
        </div>
        <p className="lede">
          Open to anyone: every claim waits for you to approve it. With an allowlist: listed
          addresses are paid automatically when the amount checks agree.
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
        <h2 className="title mb-4">Open bounties</h2>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="eyebrow">
              <tr>
                <th className="py-2">Bounty</th>
                <th className="text-right">Pays</th>
                <th>Claimers</th>
                <th className="text-right">Claims</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bounties.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted">No bounties yet. Post the first one below.</td>
                </tr>
              ) : bounties.map((bounty) => (
                <tr key={bounty.id}>
                  <td className="py-4">
                    <Link className="link font-medium" href={`/bounties/${bounty.id}`}>{bounty.title}</Link>
                    <p className="mt-1 max-w-sm text-xs text-muted">{bounty.doneCriteria}</p>
                  </td>
                  <td className="py-4 num text-right">{bounty.amount}</td>
                  <td className="py-4">{bounty.allowedClaimers.length === 0 ? "Anyone" : `${bounty.allowedClaimers.length} allowed`}</td>
                  <td className="py-4 num text-right">{bounty.claimCount}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="link text-xs" href={`/b/${bounty.shareCode}`}>/b/{bounty.shareCode}</Link>
                      <CopyForDiscordButton bounty={bounty} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="title mb-4">Post a bounty</h2>
        <form onSubmit={createBounty} className="space-y-4">
          <label className="block text-sm font-medium">
            Title
            <input className={inputClass} name="title" type="text" autoComplete="off" required />
          </label>

          <label className="block text-sm font-medium">
            Reward (USDC)
            <input className={inputClass} name="amount_usdc" type="text" inputMode="decimal" autoComplete="off" required />
          </label>

          <label className="block text-sm font-medium">
            What counts as done
            <textarea className={inputClass} name="done_criteria" rows={3} required />
          </label>

          <label className="block text-sm font-medium">
            Allowed claimers (optional)
            <textarea
              className={`${inputClass} font-mono text-xs`}
              name="allowed_claimers"
              rows={3}
              placeholder="One Solana address per line. Leave blank to let anyone claim."
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              Leave blank for open to anyone. Otherwise only these addresses may claim.
            </span>
          </label>

          <div className="flex flex-wrap items-start gap-4">
            <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Posting…" : "Post bounty"}
            </button>
            <OperatorTokenField className="basis-full md:basis-auto" />
          </div>
        </form>
      </section>
    </div>
  );
}
