"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { OperatorTokenField } from "@/components/operator-token-field";
import { humanError, workOrderStatusWord } from "@/app/console/types";

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
      setMessage("Invoice added.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
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

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Invoices</p>
          <h1 className="display-l mt-2">Invoices you've approved</h1>
        </div>
        <p className="lede">
          Your software can pay against these, up to the amount on each. It can never invent an
          amount.
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
        <h2 className="title mb-4">Awaiting delivery</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="eyebrow">
              <tr>
                <th className="py-2">Invoice</th>
                <th>Recipient</th>
                <th className="text-right">Maximum</th>
                <th>Open until</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted">No invoices yet. Add the first one below.</td>
                </tr>
              ) : workOrders.map((workOrder) => (
                <tr key={workOrder.ref}>
                  <td className="py-4 num">{workOrder.ref}</td>
                  <td className="py-4">{workOrder.recipient.displayName}</td>
                  <td className="py-4 num text-right">{workOrder.ceiling}</td>
                  <td className="py-4">{workOrder.expiresAt}</td>
                  <td className="py-4">{workOrderStatusWord(workOrder.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="title mb-4">Add invoice</h2>
        <form onSubmit={registerWorkOrder} className="space-y-4">
          <label className="block text-sm font-medium">
            Invoice ID (e.g. WO-14)
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
            Maximum amount (USDC)
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
            Open until
            <input
              className={inputClass}
              name="expires_at"
              type="datetime-local"
              autoComplete="off"
              required
            />
          </label>

          <label className="block text-sm font-medium">
            What must pass before paying
            <select className={inputClass} name="required_channels" defaultValue="both" required>
              <option value="payer_record">Your own records only</option>
              <option value="both">Both checks</option>
              <option value="human">You</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            What the invoice is for
            <textarea className={inputClass} name="brief_text" rows={3} required />
          </label>

          <label className="block text-sm font-medium">
            Your own record of this invoice (JSON)
            <textarea
              className={inputClass}
              name="payer_record"
              rows={4}
              defaultValue={'{"approved_amount_micros":"180000000","delivery_status":"verified_complete"}'}
              required
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              Amounts are in millionths: 180000000 means 180 USDC
            </span>
          </label>

          <div className="flex items-center gap-4">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "work-order"}
              aria-busy={busy === "work-order"}
            >
              {busy === "work-order" ? "Adding…" : "Add invoice"}
            </button>

            <OperatorTokenField />
          </div>
        </form>
      </section>
    </div>
  );
}
