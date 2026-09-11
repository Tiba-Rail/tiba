"use client";

import { useState } from "react";
import Link from "next/link";
import { chainName, defaultPublicChain } from "@/app/format";

type WorkspaceResult = {
  workspace_id: string;
  name: string;
  rail: string;
  agent_key: string;
  agent_key_prefix: string;
  owner_key: string;
  owner_key_prefix: string;
  recipient_ref: string;
  work_order_ref: string;
  sui_address: string | null;
  solana_address?: string | null;
};

// New workspaces put their demo recipient on the deployment's default chain.
const ADDRESS_KEY = defaultPublicChain === "solana" ? "solana_address" : "sui_address";
const CHAIN = chainName(defaultPublicChain);

type Tab = "curl" | "mcp" | "telegram";

export function StartClient() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WorkspaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, [ADDRESS_KEY]: address.trim() || undefined })
      });
      const payload = await response.json().catch(() => ({ error: "UNKNOWN" })) as { error?: string } & Partial<WorkspaceResult>;
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setResult(payload as WorkspaceResult);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("tiba_operator_token", payload.owner_key as string);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  const base = typeof window !== "undefined" ? window.location.origin : "";

  const curlCommand = result
    ? `curl -X POST "${base}/api/v1/intents" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${result.agent_key}" \\
  -d '{"idempotency_key":"onboarding-try-1","recipient_ref":"${result.recipient_ref}","artifact":"DELIVERY NOTE\\nWork order: ${result.work_order_ref}\\nDelivered: first invoice, accepted.\\nAmount due: 5.00 USDC\\nSigned: onboarding"}'`
    : "";

  const mcpSnippet = result
    ? JSON.stringify(
        {
          tools: [
            { name: "list_work_orders", description: "List the invoices awaiting delivery that your software may pay against." },
            { name: "list_recipients", description: "List saved recipients." },
            { name: "get_budget", description: "Read the software's spending limits and current usage." },
            { name: "submit_payment", description: "Attempt a payment. Two checks must agree on the invoice and amount." },
            { name: "get_last_decision", description: "Get the result of the most recent payment attempt." },
            { name: "list_ledger", description: "Get the payment history." }
          ],
          auth: { bearer: result.agent_key },
          base_url: base
        },
        null,
        2
      )
    : "";

  const telegramSnippet = result
    ? `Open @tibapay_bot in Telegram and send this one message:\n\n/connect ${result.agent_key} ${result.owner_key}\n\nThen try: ${
        defaultPublicChain === "solana" ? "pay <your Solana address> 1 USDC" : "pay 0x<sui address> 1 USDC"
      }`
    : "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      {!result ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow">Start</p>
            <Link
              href="/workspaces"
              className="text-sm font-medium text-action transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Your workspaces
            </Link>
          </div>
          <h1 className="display-l mt-3">Create your wallet</h1>
          <p className="lede mt-3">
            No password, no email. One workspace, two keys, and a test payment ready to try.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Workspace name</span>
              <input
                className="field mt-1"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme payroll"
                autoComplete="organization"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">{CHAIN} wallet address for settlement (optional)</span>
              <input
                className="field mt-1 font-mono text-xs"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={typeof window !== "undefined" ? "Defaults to the deployment address" : ""}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="mt-1 block text-xs text-muted">
                Used for the first example payment. Leave blank to use the default settlement address.
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-ink">{error}</p>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={busy || !name.trim()}
            >
              {busy ? "Creating…" : "Create wallet"}
            </button>
          </form>
        </>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="eyebrow">Created</p>
            <h1 className="display-l mt-3">Save these keys</h1>
            <p className="lede mt-3 text-held">
              They are shown once. Copy them now.
            </p>
          </div>

          <section className="card p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Agent key</p>
                <p className="text-xs text-muted">Your software uses this to send payments.</p>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <code className="break-all rounded bg-background px-3 py-2 text-xs">{result.agent_key}</code>
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={() => copy(result.agent_key, "agent")}
                  >
                    {copied === "agent" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">Owner key</p>
                <p className="text-xs text-muted">You use this to freeze, change limits, and approve held payments.</p>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <code className="break-all rounded bg-background px-3 py-2 text-xs">{result.owner_key}</code>
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={() => copy(result.owner_key, "owner")}
                  >
                    {copied === "owner" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div>
            <p className="eyebrow">Quickstart</p>
            <div className="mt-3 flex gap-2">
              {(["curl", "mcp", "telegram"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`btn ${tab === t ? "btn-primary" : "btn-secondary"}`}
                >
                  {t === "curl" ? "cURL" : t === "mcp" ? "MCP" : "Telegram"}
                </button>
              ))}
            </div>

            <div className="mt-4 card p-5">
              {tab === "curl" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">A ready POST to <code className="text-xs">/api/v1/intents</code> with your key filled in.</p>
                  <pre className="overflow-x-auto rounded bg-background p-3 text-xs">{curlCommand}</pre>
                  <button type="button" className="btn btn-secondary" onClick={() => copy(curlCommand, "curl")}>
                    {copied === "curl" ? "Copied" : "Copy curl"}
                  </button>
                </div>
              )}

              {tab === "mcp" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">JSON snippet for an MCP client, listing the six tools.</p>
                  <pre className="overflow-x-auto rounded bg-background p-3 text-xs">{mcpSnippet}</pre>
                  <button type="button" className="btn btn-secondary" onClick={() => copy(mcpSnippet, "mcp")}>
                    {copied === "mcp" ? "Copied" : "Copy JSON"}
                  </button>
                </div>
              )}

              {tab === "telegram" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">Point your bot at this key and base.</p>
                  <pre className="overflow-x-auto rounded bg-background p-3 text-xs whitespace-pre-wrap">{telegramSnippet}</pre>
                  <button type="button" className="btn btn-secondary" onClick={() => copy(telegramSnippet, "telegram")}>
                    {copied === "telegram" ? "Copied" : "Copy env"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/app?agent=${result.workspace_id}`} className="btn btn-primary">
              Send a payment →
            </Link>
            <Link href="/app" className="btn btn-secondary">
              Open the app
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
