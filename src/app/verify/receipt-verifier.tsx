"use client";

import { useState } from "react";
import { tamperedPaymentReceiptJson, verifiedPaymentReceiptJson } from "@/lib/tiba-standard/fixtures";
import { verifyReceipt } from "@/lib/tiba-standard/browser-verifier";
import type { Check } from "@/lib/tiba-standard/types";

type Result = Check | null;

function parsingFailure(message: string): Exclude<Check, { ok: true }> {
  return { ok: false, code: "TIBA_SCHEMA_INVALID", message };
}

export function ReceiptVerifier() {
  const [receiptJson, setReceiptJson] = useState(verifiedPaymentReceiptJson);
  const [result, setResult] = useState<Result>(null);
  const [verifying, setVerifying] = useState(false);

  async function runVerification() {
    setVerifying(true);
    setResult(null);
    try {
      const parsed: unknown = JSON.parse(receiptJson);
      setResult(await verifyReceipt(parsed));
    } catch (error) {
      setResult(parsingFailure(error instanceof Error ? `Could not parse receipt JSON: ${error.message}` : "Could not parse receipt JSON."));
    } finally {
      setVerifying(false);
    }
  }

  function loadExample(json: string) {
    setReceiptJson(json);
    setResult(null);
  }

  return (
    <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.45fr)]" aria-labelledby="receipt-input-label">
      <div className="card p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">Receipt JSON</p>
            <h2 id="receipt-input-label" className="title mt-2">Paste the signed object</h2>
          </div>
          <span className="text-xs text-muted">Runs in this browser</span>
        </div>
        <textarea
          className="field num mt-5 min-h-[30rem] resize-y text-xs leading-5"
          value={receiptJson}
          onChange={(event) => setReceiptJson(event.target.value)}
          spellCheck="false"
          aria-label="Signed receipt JSON"
        />
        <button type="button" className="btn btn-primary mt-5" disabled={verifying} onClick={runVerification}>
          {verifying ? "Checking receipt…" : "Verify receipt"}
        </button>
      </div>

      <aside className="space-y-5">
        <section className="border-b border-line pb-5" aria-labelledby="result-title">
          <p className="eyebrow">Result</p>
          <h2 id="result-title" className="title mt-2">Verification result</h2>
          {result ? (
            <div
              className={`mt-4 rounded-md border px-4 py-4 text-sm ${result.ok ? "border-paid bg-paid-bg text-paid" : "border-refused bg-refused-bg text-refused"}`}
              role="status"
              aria-live="polite"
            >
              {result.ok ? (
                <>
                  <p className="font-medium">Receipt verified</p>
                  <p className="mt-1 leading-5">The signature and signed permission chain check out.</p>
                </>
              ) : (
                <>
                  <p className="num font-medium">{result.code}</p>
                  <p className="mt-1 leading-5">{result.message}</p>
                </>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">No result yet. The prefilled receipt is a signed Solana devnet payment.</p>
          )}
        </section>

        <section aria-labelledby="examples-title">
          <p className="eyebrow">Try it</p>
          <h2 id="examples-title" className="title mt-2">Two useful checks</h2>
          <div className="mt-4 flex flex-col items-start gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => loadExample(verifiedPaymentReceiptJson)}>
              Load signed payment
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => loadExample(tamperedPaymentReceiptJson)}>
              Load tampered receipt
            </button>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            The tampered example changes the result after it was signed. It should fail with <span className="num">TIBA_SIGNATURE_INVALID</span>.
          </p>
        </section>

        <section className="border-t border-line pt-5">
          <p className="text-sm leading-6 text-muted">
            Tiba verifies canonical JSON, Ed25519 signatures, permission scope, spending limits, and Solana devnet evidence. It does not fetch external records while checking this receipt.
          </p>
        </section>
      </aside>
    </section>
  );
}
