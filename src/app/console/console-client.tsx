"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Recipient = {
  ref: string;
  displayName: string;
  suiAddress: string;
  active: boolean;
};

type WorkOrder = {
  ref: string;
  recipientRef: string;
  recipientName: string;
  ceiling: string;
  expiresAt: string;
  status: string;
};

type HeldIntent = {
  id: string;
  createdAt: string;
  recipientName: string;
  amount: string;
  decisionClass: string;
  reasonCode: string | null;
};

type Budget = {
  agentName: string;
  spentDay: string;
  capDay: string;
  spentHour: string;
  capHour: string;
  dayPercent: number;
  hourPercent: number;
  killSwitch: boolean;
};

export function ConsoleClient({
  budget,
  recipients,
  workOrders,
  heldIntents
}: {
  budget: Budget;
  recipients: Recipient[];
  workOrders: WorkOrder[];
  heldIntents: HeldIntent[];
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.sessionStorage.getItem("tiba_operator_token") ?? "");
  }, []);

  function saveToken(value: string) {
    setToken(value);
    window.sessionStorage.setItem("tiba_operator_token", value);
  }

  async function post(path: string, body: Record<string, unknown>, busyLabel: string) {
    setBusy(busyLabel);
    setError(null);
    setMessage(null);
    try {
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
      setMessage("Updated");
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

  async function registerWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/v1/work-orders", {
      ref: form.get("ref"),
      recipient_ref: form.get("recipient_ref"),
      ceiling_usdc: form.get("ceiling_usdc"),
      expires_at: form.get("expires_at"),
      required_channels: form.get("required_channels"),
      brief_text: form.get("brief_text"),
      payer_record: form.get("payer_record")
    }, "work-order");
    event.currentTarget.reset();
  }

  const inputClass = "mt-1 min-h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
  const buttonClass = "min-h-10 rounded-md bg-cyan-300 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Operator console</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-zinc-50 md:text-5xl">Bounded payout rail</h1>
        </div>
        <label className="block w-full max-w-sm text-sm font-medium text-zinc-200">
          Operator token
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => saveToken(event.target.value)}
            spellCheck={false}
          />
        </label>
      </header>

      {(message || error) && (
        <div className={error ? "rounded-lg border border-red-500/60 bg-red-950/70 p-4 text-red-50" : "rounded-lg border border-emerald-500/40 bg-emerald-950/60 p-4 text-emerald-50"}>
          {error ?? message}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold text-zinc-50">{budget.agentName}</h2>
            <p className="text-sm text-zinc-300">Daily cap {budget.capDay}</p>
          </div>
          <div className="mt-5 space-y-4">
            <BudgetMeter label="Day" spent={budget.spentDay} cap={budget.capDay} percent={budget.dayPercent} />
            <BudgetMeter label="Hour" spent={budget.spentHour} cap={budget.capHour} percent={budget.hourPercent} />
          </div>
        </div>
        <div className={budget.killSwitch ? "rounded-lg border border-red-500 bg-red-950 p-5" : "rounded-lg border border-zinc-800 bg-zinc-900 p-5"}>
          <p className="text-sm font-semibold uppercase tracking-widest text-zinc-300">Kill switch</p>
          <p className={budget.killSwitch ? "mt-2 text-5xl font-black text-red-100" : "mt-2 text-5xl font-black text-zinc-100"}>
            {budget.killSwitch ? "ON" : "OFF"}
          </p>
          <button
            type="button"
            className={budget.killSwitch ? "mt-5 min-h-11 rounded-md bg-zinc-50 px-4 py-2 text-sm font-bold text-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" : "mt-5 min-h-11 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"}
            disabled={busy === "kill"}
            aria-busy={busy === "kill"}
            onClick={() => post("/api/v1/kill", { enabled: !budget.killSwitch }, "kill")}
          >
            {budget.killSwitch ? "Disable kill switch" : "Engage kill switch"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Work orders">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-zinc-400">
                <tr><th className="py-2">Ref</th><th>Recipient</th><th>Ceiling</th><th>Expiry</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-100">
                {workOrders.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-zinc-400">No work orders registered.</td></tr>
                ) : workOrders.map((workOrder) => (
                  <tr key={workOrder.ref}>
                    <td className="py-3 font-mono">{workOrder.ref}</td>
                    <td>{workOrder.recipientName}</td>
                    <td>{workOrder.ceiling}</td>
                    <td>{workOrder.expiresAt}</td>
                    <td>{workOrder.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Recipients">
          <div className="space-y-3">
            {recipients.length === 0 ? <p className="py-6 text-sm text-zinc-400">No recipients registered.</p> : recipients.map((recipient) => (
              <div key={recipient.ref} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-zinc-50">{recipient.displayName}</p>
                  <span className={recipient.active ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{recipient.active ? "active" : "inactive"}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-400">{recipient.ref}</p>
                <p className="mt-2 break-all font-mono text-xs text-zinc-500">{recipient.suiAddress}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Register recipient">
          <form onSubmit={registerRecipient} className="space-y-4">
            <TextField id="recipient-ref" name="ref" label="Recipient ref" autoComplete="off" />
            <TextField id="display-name" name="display_name" label="Display name" autoComplete="name" />
            <TextField id="sui-address" name="sui_address" label="Sui testnet address" autoComplete="off" />
            <button className={buttonClass} type="submit" disabled={busy === "recipient"} aria-busy={busy === "recipient"}>Register recipient</button>
          </form>
        </Panel>
        <Panel title="Register work order">
          <form onSubmit={registerWorkOrder} className="space-y-4">
            <TextField id="wo-ref" name="ref" label="Work order ref" autoComplete="off" />
            <label className="block text-sm font-medium text-zinc-200">
              Recipient
              <select className={inputClass} name="recipient_ref" required>
                {recipients.map((recipient) => <option key={recipient.ref} value={recipient.ref}>{recipient.displayName} ({recipient.ref})</option>)}
              </select>
            </label>
            <TextField id="ceiling-usdc" name="ceiling_usdc" label="Ceiling in USDC" autoComplete="off" inputMode="decimal" />
            <TextField id="expires-at" name="expires_at" label="Expiry" type="datetime-local" autoComplete="off" />
            <label className="block text-sm font-medium text-zinc-200">
              Required channels
              <select className={inputClass} name="required_channels" defaultValue="both" required>
                <option value="payer_record">payer record</option>
                <option value="both">both</option>
                <option value="human">human</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-zinc-200">
              Brief text
              <textarea className={inputClass} name="brief_text" rows={3} required />
            </label>
            <label className="block text-sm font-medium text-zinc-200">
              Payer record JSON
              <textarea className={inputClass} name="payer_record" rows={4} defaultValue={'{"approved_amount_micros":"180000000","delivery_status":"verified_complete"}'} required />
            </label>
            <button className={buttonClass} type="submit" disabled={busy === "work-order"} aria-busy={busy === "work-order"}>Register work order</button>
          </form>
        </Panel>
      </section>

      <Panel title="Held queue">
        <div className="space-y-3">
          {heldIntents.length === 0 ? <p className="py-6 text-sm text-zinc-400">No held or quorum-split intents.</p> : heldIntents.map((intent) => (
            <div key={intent.id} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-mono text-sm text-zinc-400">{intent.id}</p>
                <p className="mt-1 text-lg font-bold text-zinc-50">{intent.recipientName} | {intent.amount}</p>
                <p className="mt-1 text-sm text-zinc-300">{intent.decisionClass} | {intent.reasonCode ?? "UNKNOWN"} | {intent.createdAt}</p>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={busy === intent.id}
                aria-busy={busy === intent.id}
                onClick={() => post(`/api/v1/intents/${intent.id}/override`, {}, intent.id)}
              >
                Override
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BudgetMeter({ label, spent, cap, percent }: { label: string; spent: string; cap: string; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-zinc-200">{label}</span>
        <span className="text-zinc-300">{spent} / {cap}</span>
      </div>
      <div className="mt-2 h-4 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-4 text-xl font-bold text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

function TextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  inputMode
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete: string;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="block text-sm font-medium text-zinc-200" htmlFor={id}>
      {label}
      <input
        id={id}
        className="mt-1 min-h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        spellCheck={false}
        required
      />
    </label>
  );
}
