"use client";

import { useEffect, useState } from "react";
import { createBrowserSigner } from "@/lib/tiba-standard/browser-crypto";
import { verifyMandate } from "@/lib/tiba-standard/browser-verifier";
import { conservativeOfflineDraft } from "@/lib/tiba-standard/offline-policy";
import type { LocalPermissionSlip, Mandate, PermissionDraft } from "@/lib/tiba-standard/types";

const STORAGE_KEY = "tiba.standard.permission-slips.v1";
const DEFAULT_INSTRUCTION = "Let my agent write a demo note and send 0.001 USDC to the Tiba demo payee on Solana devnet.";

type Expiry = "1" | "24" | "168";

function timestampAfter(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function shortId(value: string): string {
  return value.length > 30 ? `${value.slice(0, 15)}…${value.slice(-10)}` : value;
}

function writeSlips(slips: LocalPermissionSlip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slips));
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function ScopeSummary({ draft }: { draft: PermissionDraft }) {
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted">Actions</dt>
        <dd className="mt-1 space-y-1 font-medium">
          {draft.scope.actions.map((action) => (
            <div key={`${action.protocol}:${action.action}:${action.resource}:${action.tool}`} className="num break-words text-xs">
              {action.protocol} · {action.action} · {action.resource} · {action.tool}
            </div>
          ))}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Counterparties</dt>
        <dd className="mt-1 break-words font-medium">{draft.scope.counterparties.join(", ")}</dd>
      </div>
      <div>
        <dt className="text-muted">Budget</dt>
        <dd className="mt-1 font-medium">
          {draft.budget
            ? `${draft.budget.amount} ${draft.budget.currency}${draft.budget.per_action_max ? ` max per action ${draft.budget.per_action_max}` : ""}`
            : "No spending authority"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Data access</dt>
        <dd className="mt-1 font-medium">
          Read: {draft.scope.data.read.length ? draft.scope.data.read.join(", ") : "none"}
          <br />
          Write: {draft.scope.data.write.length ? draft.scope.data.write.join(", ") : "none"}
        </dd>
      </div>
    </dl>
  );
}

function SlipCard({ slip, onRevoke }: { slip: LocalPermissionSlip; onRevoke: (id: string) => void }) {
  const { mandate } = slip;
  const active = !slip.revoked_at;

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="title">{slip.instruction}</p>
          <p className="mt-1 text-xs text-muted">Signed {formatExpiry(mandate.issued_at)}</p>
        </div>
        <span className={`pill ${active ? "pill-paid" : "pill-refused"}`}>{active ? "Active" : "Revoked"}</span>
      </div>
      <div className="mt-5 grid gap-4 border-y border-line py-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted">Scope</p>
          <p className="mt-1 font-medium">{mandate.scope.actions.length} allowed action{mandate.scope.actions.length === 1 ? "" : "s"}</p>
        </div>
        <div>
          <p className="text-muted">Budget</p>
          <p className="mt-1 font-medium">{mandate.budget ? `${mandate.budget.amount} ${mandate.budget.currency}` : "No spending"}</p>
        </div>
        <div>
          <p className="text-muted">Expires</p>
          <p className="mt-1 font-medium">{formatExpiry(mandate.expires_at)}</p>
        </div>
      </div>
      <details className="group mt-4" suppressHydrationWarning>
        <summary className="cursor-pointer text-sm font-medium text-action underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">
          View signed scope
        </summary>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted">Permission ID</p>
            <p className="num mt-1 break-all text-xs">{mandate.id}</p>
          </div>
          <div>
            <p className="text-muted">Signing identity</p>
            <p className="num mt-1 break-all text-xs">{shortId(mandate.issuer)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted">Allowed actions</p>
            <ul className="mt-1 space-y-1">
              {mandate.scope.actions.map((action) => (
                <li key={`${action.protocol}:${action.action}:${action.resource}:${action.tool}`} className="num break-words text-xs">
                  {action.protocol} · {action.action} · {action.resource} · {action.tool}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      {active ? (
        <button type="button" className="btn btn-ghost mt-4 text-refused" onClick={() => onRevoke(mandate.id)}>
          Revoke permission
        </button>
      ) : (
        <p className="mt-4 text-sm text-refused">Revoked {formatExpiry(slip.revoked_at!)}</p>
      )}
    </article>
  );
}

export function PermissionSlips() {
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [expiry, setExpiry] = useState<Expiry>("24");
  const [draft, setDraft] = useState<PermissionDraft | null>(null);
  const [reviewTerms, setReviewTerms] = useState<{ instruction: string; expiresAt: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [slips, setSlips] = useState<LocalPermissionSlip[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as LocalPermissionSlip[];
      if (Array.isArray(saved)) setSlips(saved);
    } catch {
      setNotice("Tiba could not read saved permission slips from this browser.");
    }
  }, []);

  const needsNamedCounterparty = draft?.scope.counterparties.includes("UNSPECIFIED_COUNTERPARTY") ?? false;

  function discardReviewForChangedTerms() {
    if (!draft) return;
    setDraft(null);
    setReviewTerms(null);
    setReviewed(false);
    setNotice("Terms changed. Draft a new permission before signing it.");
  }

  function updateInstruction(value: string) {
    setInstruction(value);
    discardReviewForChangedTerms();
  }

  function updateExpiry(value: Expiry) {
    setExpiry(value);
    discardReviewForChangedTerms();
  }

  function makeDraft() {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction) {
      setNotice("Describe what your agent may do before drafting a permission.");
      return;
    }
    const isDemo = /solana devnet|tiba demo|demo note/i.test(cleanInstruction);
    setDraft(conservativeOfflineDraft(cleanInstruction, { demo: isDemo }));
    setReviewTerms({ instruction: cleanInstruction, expiresAt: timestampAfter(Number(expiry)) });
    setReviewed(false);
    setNotice(null);
  }

  async function signPermission() {
    if (!draft || !reviewed || !reviewTerms) return;
    if (needsNamedCounterparty) {
      setNotice("Name the payment recipient in quotation marks in the instruction, then draft the permission again.");
      return;
    }
    setSigning(true);
    setNotice(null);
    try {
      const signer = await createBrowserSigner();
      const issuedAt = new Date().toISOString();
      const mandate: Omit<Mandate, "signature"> = {
        type: "tiba.mandate",
        version: "0.1",
        id: `mandate:${crypto.randomUUID()}`,
        issuer: signer.did,
        subject: signer.did,
        issued_at: issuedAt,
        expires_at: reviewTerms.expiresAt,
        scope: draft.scope,
        ...(draft.budget ? { budget: draft.budget } : {}),
        delegation: draft.delegation,
        revocation: { ...draft.revocation, authority: signer.did },
        escalation: draft.escalation
      };
      const signed = await signer.signObject(mandate, signer.did);
      const checked = await verifyMandate(signed);
      if (!checked.ok) throw new Error(`${checked.code}: ${checked.message}`);
      const next = [{ mandate: signed, instruction: reviewTerms.instruction }, ...slips];
      setSlips(next);
      writeSlips(next);
      setDraft(null);
      setReviewTerms(null);
      setReviewed(false);
      setNotice("Permission signed and saved in this browser. Review its exact boundary or revoke it here at any time.");
    } catch (error) {
      setNotice(error instanceof Error ? `Could not sign this permission: ${error.message}` : "Could not sign this permission.");
    } finally {
      setSigning(false);
    }
  }

  function revokePermission(id: string) {
    const now = new Date().toISOString();
    const next = slips.map((slip) => (slip.mandate.id === id ? { ...slip, revoked_at: now } : slip));
    setSlips(next);
    writeSlips(next);
    setNotice("Permission marked revoked in this browser.");
  }

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
      <section aria-labelledby="draft-title">
        <div className="card p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow">01 · Draft</p>
              <h2 id="draft-title" className="title mt-2">Describe the job</h2>
            </div>
            <span className="text-xs text-muted">Test network</span>
          </div>
          <label className="mt-5 block text-sm font-medium" htmlFor="permission-instruction">Plain-English instruction</label>
          <textarea
            id="permission-instruction"
            className="field mt-2 min-h-32 resize-y leading-6"
            value={instruction}
            onChange={(event) => updateInstruction(event.target.value)}
            placeholder="For example: Pay up to 0.001 USDC to a named supplier on Solana devnet."
          />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <label className="block text-sm font-medium" htmlFor="permission-expiry">
              Expires in
              <select id="permission-expiry" className="field mt-2 min-w-40" value={expiry} onChange={(event) => updateExpiry(event.target.value as Expiry)}>
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={makeDraft}>Draft permission</button>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">
            Tiba keeps the draft narrow. You confirm the exact terms before anything is signed.
          </p>
        </div>

        {draft ? (
          <section className="card mt-6 p-5 md:p-6" aria-labelledby="review-title">
            <p className="eyebrow">02 · Review and sign</p>
            <h2 id="review-title" className="title mt-2">This is what your agent may do</h2>
            <p className="mt-2 text-sm text-muted">{draft.explanation}</p>
            <div className="mt-5 border-y border-line py-5">
              <ScopeSummary draft={draft} />
              <div className="mt-5 text-sm">
                <span className="text-muted">Expiry</span>
                <p className="mt-1 font-medium">{reviewTerms ? formatExpiry(reviewTerms.expiresAt) : "Draft expiry unavailable"}</p>
              </div>
            </div>
            {needsNamedCounterparty ? (
              <p className="mt-5 rounded-md border border-refused bg-refused-bg px-4 py-3 text-sm leading-6 text-refused" role="alert">
                This payment draft does not name a recipient. Add the exact person, account, or address in quotation marks in the instruction, then draft it again.
              </p>
            ) : null}
            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-action"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>I have reviewed the scope, budget, and expiry. I want to sign this permission slip.</span>
            </label>
            <button type="button" className="btn btn-primary mt-5" disabled={!reviewed || signing || needsNamedCounterparty} onClick={signPermission}>
              {signing ? "Signing permission…" : "Confirm and sign"}
            </button>
          </section>
        ) : null}

        {notice ? (
          <p className="mt-5 rounded-md border border-line bg-surface px-4 py-3 text-sm" role="status">{notice}</p>
        ) : null}
      </section>

      <aside aria-labelledby="saved-title">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="eyebrow">Signed slips</p>
            <h2 id="saved-title" className="title mt-2">Your current boundaries</h2>
          </div>
          <span className="num text-sm text-muted">{slips.length}</span>
        </div>
        <div className="mt-4 space-y-4">
          {slips.length ? (
            slips.map((slip) => <SlipCard key={slip.mandate.id} slip={slip} onRevoke={revokePermission} />)
          ) : (
            <p className="py-8 text-sm leading-6 text-muted">
              No signed permission slips yet. Create one only after you have reviewed its exact boundary.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
