"use client";

import { useState } from "react";
import Link from "next/link";

type Step = 1 | 2 | 3 | 4;
type ScopeId = "pay-recipient" | "pay-invoice" | "notes-and-pay";
type BudgetId = "0.01" | "1" | "10";
type ExpiryId = "1" | "24" | "168";

const SCOPES: Array<{ id: ScopeId; label: string; detail: string; action: string; counterparty: string }> = [
  {
    id: "pay-recipient",
    label: "Pay a named recipient",
    detail: "One transfer to the Tiba demo payee on the test network.",
    action: "payment · transfer · solana:devnet",
    counterparty: "Tiba demo payee"
  },
  {
    id: "pay-invoice",
    label: "Pay an open invoice",
    detail: "Pay a saved contractor against an invoice Tiba already knows.",
    action: "payment · transfer · solana:devnet",
    counterparty: "Saved contractor"
  },
  {
    id: "notes-and-pay",
    label: "Write a demo note and pay",
    detail: "A local notes write, then a transfer to the demo payee.",
    action: "mcp · notes.write + payment · transfer",
    counterparty: "Tiba demo payee"
  }
];

const BUDGETS: Array<{ id: BudgetId; label: string; amount: string }> = [
  { id: "0.01", label: "0.01 USDC", amount: "0.01" },
  { id: "1", label: "1 USDC", amount: "1" },
  { id: "10", label: "10 USDC", amount: "10" }
];

const EXPIRIES: Array<{ id: ExpiryId; label: string; hours: number }> = [
  { id: "1", label: "1 hour", hours: 1 },
  { id: "24", label: "24 hours", hours: 24 },
  { id: "168", label: "7 days", hours: 168 }
];

function formatExpiry(hours: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(Date.now() + hours * 60 * 60 * 1000));
}

function ChoiceButton({
  pressed,
  title,
  detail,
  onClick
}: {
  pressed: boolean;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-baseline justify-between gap-4 py-4 text-left ${pressed ? "text-foreground" : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>
        <span className="font-medium">{title}</span>
        {detail ? <span className="mt-1 block text-sm text-muted">{detail}</span> : null}
      </span>
      {pressed ? <span className="shrink-0 text-sm text-action">Selected</span> : null}
    </button>
  );
}

export function TryClient() {
  const [step, setStep] = useState<Step>(1);
  const [scopeId, setScopeId] = useState<ScopeId | null>(null);
  const [budgetId, setBudgetId] = useState<BudgetId | null>(null);
  const [expiryId, setExpiryId] = useState<ExpiryId | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [authorizedAt, setAuthorizedAt] = useState<string | null>(null);

  const scope = SCOPES.find((item) => item.id === scopeId) ?? null;
  const budget = BUDGETS.find((item) => item.id === budgetId) ?? null;
  const expiry = EXPIRIES.find((item) => item.id === expiryId) ?? null;
  const done = Boolean(receiptId && scope && budget && expiry && authorizedAt);

  function reset() {
    setStep(1);
    setScopeId(null);
    setBudgetId(null);
    setExpiryId(null);
    setReceiptId(null);
    setAuthorizedAt(null);
  }

  function authorize() {
    if (!scope || !budget || !expiry) return;
    setReceiptId(`demo:${crypto.randomUUID()}`);
    setAuthorizedAt(new Date().toISOString());
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <header className="max-w-xl">
        <p className="eyebrow">Practice · no wallet needed</p>
        <h1 className="display-l mt-2">Authorize a demo payout.</h1>
        <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
          Pick a scope, a budget, and an expiry. Tiba shows the receipt your agent would leave. Nothing is signed and no money moves.
        </p>
      </header>

      {done && scope && budget && expiry && authorizedAt ? (
        <DemoReceipt
          receiptId={receiptId!}
          scope={scope}
          budget={budget}
          expiresAt={formatExpiry(expiry.hours)}
          authorizedAt={authorizedAt}
          onAgain={reset}
        />
      ) : (
        <section className="mt-10">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="title">
              {step === 1 ? "Scope" : step === 2 ? "Budget" : step === 3 ? "Expiry" : "Review"}
            </h2>
            <span className="text-sm text-muted tabular-nums">Step {step} of 4</span>
          </div>

          {step === 1 ? (
            <div className="divide-y divide-line border-y border-line">
              {SCOPES.map((item) => (
                <ChoiceButton
                  key={item.id}
                  pressed={scopeId === item.id}
                  title={item.label}
                  detail={item.detail}
                  onClick={() => {
                    setScopeId(item.id);
                    setStep(2);
                  }}
                />
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div className="divide-y divide-line border-y border-line">
                {BUDGETS.map((item) => (
                  <ChoiceButton
                    key={item.id}
                    pressed={budgetId === item.id}
                    title={item.label}
                    detail="Maximum the agent may spend on the test network."
                    onClick={() => {
                      setBudgetId(item.id);
                      setStep(3);
                    }}
                  />
                ))}
              </div>
              <button type="button" className="btn btn-ghost mt-4" onClick={() => setStep(1)}>
                Back
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="divide-y divide-line border-y border-line">
                {EXPIRIES.map((item) => (
                  <ChoiceButton
                    key={item.id}
                    pressed={expiryId === item.id}
                    title={item.label}
                    detail={`Stops ${formatExpiry(item.hours)}`}
                    onClick={() => {
                      setExpiryId(item.id);
                      setStep(4);
                    }}
                  />
                ))}
              </div>
              <button type="button" className="btn btn-ghost mt-4" onClick={() => setStep(2)}>
                Back
              </button>
            </>
          ) : null}

          {step === 4 && !(scope && budget && expiry) ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Start over
            </button>
          ) : null}

          {step === 4 && scope && budget && expiry ? (
            <>
              <dl className="divide-y divide-line border-y border-line text-sm">
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Scope</dt>
                  <dd className="text-right font-medium">{scope.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Budget</dt>
                  <dd className="text-right font-medium tabular-nums">{budget.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Expires</dt>
                  <dd className="text-right font-medium">{formatExpiry(expiry.hours)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Allowed action</dt>
                  <dd className="num max-w-[28ch] text-right text-xs">{scope.action}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted">
                This is a practice authorization. Confirming writes nothing and pays no one.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" onClick={authorize}>
                  Authorize this (demo)
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>
                  Back
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function DemoReceipt({
  receiptId,
  scope,
  budget,
  expiresAt,
  authorizedAt,
  onAgain
}: {
  receiptId: string;
  scope: (typeof SCOPES)[number];
  budget: (typeof BUDGETS)[number];
  expiresAt: string;
  authorizedAt: string;
  onAgain: () => void;
}) {
  const when = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(authorizedAt));

  return (
    <section className="mt-10" aria-live="polite">
      <article className="card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-medium text-paid">Recorded</p>
            <p className="mt-1 text-sm text-muted">A sample payment stayed inside the boundary you set.</p>
          </div>
          <span className="pill pill-paid">Demo</span>
        </div>

        <div className="mt-5 divide-y divide-line border-y border-line text-sm">
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">Paid</span>
            <span className="font-medium tabular-nums">0.01 USDC</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">To</span>
            <span className="font-medium">{scope.counterparty}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">Scope</span>
            <span className="text-right font-medium">{scope.label}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">Budget</span>
            <span className="font-medium tabular-nums">{budget.label}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">Expires</span>
            <span className="font-medium">{expiresAt}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-muted">Checks</span>
            <span className="font-medium text-paid">Agreed</span>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted">
          {when}. Nothing was signed. No money moved.
        </p>
        <p className="num mt-2 break-all text-xs text-muted">{receiptId}</p>
      </article>

      <div className="mt-8 border-t border-line pt-8">
        <h2 className="display-m">Do this for real.</h2>
        <p className="mt-3 max-w-[52ch] text-sm leading-6 text-muted">
          That was a practice run. Connect a wallet to authorize a live payout from your own Tiba wallet, with a signed permission and a checkable receipt.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/signin?callbackUrl=/start">
            Connect a wallet
          </Link>
          <Link className="btn btn-secondary" href="/start">
            Create a wallet
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onAgain}>
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}
