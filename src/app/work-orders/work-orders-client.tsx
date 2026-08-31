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
}

interface WorkOrder {
  ref: string;
  ceiling: string;
  expiresAt: string;
  status: string;
  recipient: {
    ref: string;
    displayName: string;
  };
}

interface WorkOrdersClientProps {
  workOrders: WorkOrder[];
  recipients: Recipient[];
}

export function WorkOrdersClient({ workOrders, recipients }: WorkOrdersClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>, busyLabel: string) {
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
      setMessage("Work order registered successfully");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(null);
    }
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

  const inputClass = "field mt-1";
  const buttonClass = "btn btn-primary";

  return (
    <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <SiteNav current="work-orders" />
      
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Work orders</p>
          <h1 className="display mt-2 text-3xl md:text-5xl">What the agent may pay against</h1>
        </div>
        <p className="text-muted">
          Every open obligation an agent can submit a payment for. Registering one here does not pay anyone — it only opens the possibility.
        </p>
      </header>

      {(message || error) && (
        <div className={error ? "card p-4 text-red-ink" : "card p-4 text-paid"}>
          {error ?? message}
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-xl font-bold">Work orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="eyebrow">
              <tr>
                <th className="py-2">Ref</th>
                <th>Recipient</th>
                <th>Ceiling</th>
                <th>Expiry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted">No work orders registered.</td>
                </tr>
              ) : workOrders.map((workOrder) => (
                <tr key={workOrder.ref}>
                  <td className="py-4 font-mono">{workOrder.ref}</td>
                  <td className="py-4">{workOrder.recipient.displayName}</td>
                  <td className="py-4">{workOrder.ceiling}</td>
                  <td className="py-4">{workOrder.expiresAt}</td>
                  <td className="py-4">{workOrder.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-xl font-bold">Register work order</h2>
        <form onSubmit={registerWorkOrder} className="space-y-4">
          <label className="block text-sm font-medium">
            Work order ref
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
            Recipient
            <select className={inputClass} name="recipient_ref" required>
              {recipients.map((recipient) => (
                <option key={recipient.ref} value={recipient.ref}>
                  {recipient.displayName} ({recipient.ref})
                </option>
              ))}
            </select>
          </label>
          
          <label className="block text-sm font-medium">
            Ceiling in USDC
            <input
              className={inputClass}
              name="ceiling_usdc"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          
          <label className="block text-sm font-medium">
            Expiry
            <input
              className={inputClass}
              name="expires_at"
              type="datetime-local"
              autoComplete="off"
              required
            />
          </label>
          
          <label className="block text-sm font-medium">
            Required channels
            <select className={inputClass} name="required_channels" defaultValue="both" required>
              <option value="payer_record">payer record</option>
              <option value="both">both</option>
              <option value="human">human</option>
            </select>
          </label>
          
          <label className="block text-sm font-medium">
            Brief text
            <textarea className={inputClass} name="brief_text" rows={3} required />
          </label>
          
          <label className="block text-sm font-medium">
            Payer record JSON
            <textarea 
              className={inputClass} 
              name="payer_record" 
              rows={4} 
              defaultValue={'{"approved_amount_micros":"180000000","delivery_status":"verified_complete"}'} 
              required 
            />
          </label>
          
          <div className="flex items-center gap-4">
            <button 
              className={buttonClass} 
              type="submit" 
              disabled={busy === "work-order"} 
              aria-busy={busy === "work-order"}
            >
              {busy === "work-order" ? "Registering..." : "Register work order"}
            </button>
            
            <OperatorTokenField />
          </div>
        </form>
      </section>
    </div>
    </main>
  );
}