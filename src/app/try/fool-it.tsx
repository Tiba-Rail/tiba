"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SANDBOX_AMOUNT_USDC,
  SANDBOX_BRIEF,
  SANDBOX_PAYEE_NAME,
  SANDBOX_WORK_ORDER_ID,
  SANDBOX_WRONG_AMOUNT_USDC,
  SANDBOX_WRONG_WORK_ORDER_ID,
  sandboxBillText
} from "@/lib/fool-it-sample";

type Readout = { workOrderId: string; amount: string };

type FoolResponse = {
  outcome?: string;
  message?: string;
  money_sent?: boolean;
  paid?: boolean;
  reason_code?: string;
  bill?: Readout;
  record?: Readout;
  mismatch?: string;
  receipt_url?: string;
};

export function FoolIt() {
  const [workOrderId, setWorkOrderId] = useState(SANDBOX_WRONG_WORK_ORDER_ID);
  const [amount, setAmount] = useState(SANDBOX_WRONG_AMOUNT_USDC);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoolResponse | null>(null);

  async function submit(nextWorkOrderId: string, nextAmount: string) {
    setWorkOrderId(nextWorkOrderId);
    setAmount(nextAmount);
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/try/fool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ work_order_id: nextWorkOrderId, amount: nextAmount })
      });
      const body = (await response.json()) as FoolResponse;
      if (!body || typeof body !== "object") {
        setError("The check could not be finished. Nothing was sent.");
        return;
      }
      setResult(body);
      if (body.outcome === "invalid" || body.outcome === "unavailable" || body.outcome === "rate_limited") {
        setError(body.message ?? "The check could not be finished. Nothing was sent.");
      }
    } catch {
      setError("The check could not be finished. Nothing was sent.");
    } finally {
      setPending(false);
    }
  }

  const preview = sandboxBillText(workOrderId.trim() || "…", amount.trim() || "…");

  return (
    <section id="try-to-fool-it" aria-labelledby="try-to-fool-heading">
      <header className="max-w-xl">
        <p className="eyebrow">Sandbox · Solana devnet · no money sent</p>
        <h1 id="try-to-fool-heading" className="display-l mt-2">
          Try to fool it.
        </h1>
        <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
          A sample work order sits on the payer&apos;s record. The bill below does not match it. One click runs the same two checks a payment uses. A mismatch is refused, and you get the receipt. A match stops at &ldquo;would pay&rdquo;. This sandbox never sends money.
        </p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="card p-5">
          <h2 className="title">Payer&apos;s record</h2>
          <p className="mt-1 text-sm text-muted">You cannot edit this. It is what Tiba already knows.</p>
          <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
            <Row label="Work order" value={SANDBOX_WORK_ORDER_ID} />
            <Row label="Approved" value={`${SANDBOX_AMOUNT_USDC} USDC`} />
            <Row label="Delivery" value="Verified complete" />
            <Row label="Payee" value={SANDBOX_PAYEE_NAME} />
          </dl>
          <p className="mt-3 text-sm text-muted">{SANDBOX_BRIEF}</p>
        </article>

        <form
          className="card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(workOrderId, amount);
          }}
        >
          <h2 className="title">The bill</h2>
          <p className="mt-1 text-sm text-muted">Change the amount, the work order number, or both.</p>
          <label className="mt-4 block text-sm font-medium" htmlFor="fool-work-order">
            Work order number
            <input
              id="fool-work-order"
              className="field mt-1"
              value={workOrderId}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              onChange={(event) => setWorkOrderId(event.target.value)}
              disabled={pending}
            />
          </label>
          <label className="mt-4 block text-sm font-medium" htmlFor="fool-amount">
            Amount (USDC)
            <input
              id="fool-amount"
              className="field mt-1"
              inputMode="decimal"
              value={amount}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
            />
          </label>
          <p className="mt-4 text-sm text-muted">{preview}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Reading the bill…" : "Try to fool it"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={pending}
              onClick={() => void submit(SANDBOX_WORK_ORDER_ID, SANDBOX_AMOUNT_USDC)}
            >
              Submit the matching bill
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6" aria-live="polite">
        {error ? <p className="text-sm text-refused">{error}</p> : null}
        {result?.outcome === "refused" ? (
          <article className="card mt-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-medium text-refused">Refused</p>
                <p className="mt-1 text-sm text-muted">Nothing was sent. This is a sandbox on the test network.</p>
              </div>
              <span className="pill pill-refused">Refused</span>
            </div>
            <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
              <Row label="Bill" value={result.bill ? `${result.bill.workOrderId}, ${result.bill.amount}` : "—"} />
              <Row label="Record" value={result.record ? `${result.record.workOrderId}, ${result.record.amount}` : "—"} />
            </dl>
            {result.mismatch ? <p className="mt-4 text-sm leading-6">{result.mismatch}</p> : null}
            {result.receipt_url ? (
              <Link className="btn btn-secondary mt-5" href={result.receipt_url}>
                Open the receipt
              </Link>
            ) : null}
          </article>
        ) : null}
        {result?.outcome === "would_pay" ? (
          <article className="card mt-4 p-5">
            <p className="text-base font-medium">Would pay</p>
            <p className="mt-2 text-sm leading-6 text-muted">{result.message}</p>
            <p className="mt-3 text-sm">Sandbox. Nothing was sent. No test-network transfer was made.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
