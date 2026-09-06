"use client";

import { useState } from "react";
import Link from "next/link";
import type { TestIntentResponse } from "./types";
import {
  decisionWord,
  explainDecision,
  humanReference,
  refusalNextStep,
  refusalNextStepLink,
  sendResultChecks
} from "./types";

// Pull "Work order: WO-13" and "Amount due: 5.00 USDC" out of the note for the
// summary line. Display only — the pipeline already did the real parsing.
function noteField(artifact: string, label: string): string | null {
  const match = artifact.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

const markGlyph = { pass: "✓", fail: "✗", pending: "…", skip: "—" } as const;
const markColor = {
  pass: "text-paid",
  fail: "text-refused",
  pending: "text-held",
  skip: "text-muted"
} as const;

export function SendResult({
  result,
  recipientName,
  artifact,
  onDone
}: {
  result: TestIntentResponse;
  recipientName: string;
  artifact: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const paid = result.decision === "PAID";
  const held = result.decision === "AMBER";
  const refused = !paid && !held;

  const headline = paid
    ? "Sent"
    : held
      ? "Needs your approval."
      : "Refused";
  const headlineColor = paid ? "text-paid" : held ? "text-held" : "text-refused";
  const pillClass = paid ? "pill-paid" : held ? "pill-held" : "pill-refused";

  const checks = sendResultChecks(result.decision, result.reasonCode ?? null);
  const nextStep = refused ? refusalNextStepLink(result.reasonCode ?? null) : null;
  const reference = humanReference(result.id);
  const receiptPath = result.publicToken ? `/r/${result.publicToken}` : null;
  const receiptUrl = receiptPath && typeof window !== "undefined"
    ? `${window.location.origin}${receiptPath}`
    : null;

  const amount = noteField(artifact, "Amount due");
  const invoice = noteField(artifact, "Work order");
  const sentAt = new Date().toUTCString().slice(17, 25); // HH:MM:SS UTC

  async function copyReceipt() {
    if (!receiptUrl) return;
    try {
      await navigator.clipboard.writeText(receiptUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card p-5 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className={`text-base font-medium ${headlineColor}`}>{headline}</p>
        <span className={`pill ${pillClass}`}>{decisionWord(result.decision)}</span>
      </div>

      <div className="mt-4 divide-y divide-line border-y border-line">
        {checks.map((check) => (
          <div key={check.name} className="flex items-baseline gap-3 py-2.5">
            <span className="shrink-0 text-muted">{check.name}</span>
            <span className={`shrink-0 font-semibold ${markColor[check.mark]}`} aria-hidden>
              {markGlyph[check.mark]}
            </span>
            <span className="min-w-0">{check.text}</span>
          </div>
        ))}
      </div>

      {(amount || invoice) && (
        <p className="mt-3 text-muted">
          {amount && <span style={{ fontVariantNumeric: "tabular-nums" }}>{amount}</span>}
          {amount && " → "}
          {recipientName}
          {invoice && <span className="num"> · {invoice}</span>}
          <span className="num"> · {sentAt} UTC</span>
        </p>
      )}

      {refused && (
        <div className="mt-3 space-y-1">
          <p className="text-muted">{explainDecision(result.decision, result.reasonCode ?? null)}</p>
          {nextStep ? (
            <Link href={nextStep.href} className="link inline-block">
              {nextStep.label} →
            </Link>
          ) : (
            <p className="text-muted">{refusalNextStep(result.reasonCode ?? null)}</p>
          )}
        </div>
      )}

      {held && (
        <p className="mt-3 text-muted">
          {explainDecision(result.decision, result.reasonCode ?? null)}
        </p>
      )}

      {receiptPath && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="text-muted">Receipt</span>
          <Link href={receiptPath} className="link num break-all text-xs">
            {receiptPath}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={copyReceipt}>
            {copied ? "Copied" : "Copy"}
          </button>
          <Link href={receiptPath} className="btn btn-ghost" target="_blank">
            Open ↗
          </Link>
        </div>
      )}

      {reference && (
        <p className="mt-2 text-muted">
          Reference <span className="num text-xs">{reference}</span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Done
        </button>
        {!held && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Send another
          </button>
        )}
        {held && (
          <Link href="/ledger" className="btn btn-ghost">
            See in activity
          </Link>
        )}
        {paid && result.explorerUrl && (
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            View transaction
          </a>
        )}
      </div>
    </section>
  );
}
