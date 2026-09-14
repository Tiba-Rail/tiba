import { SiteNav } from "@/components/site-nav";
import { demoReceipts, explorerUrlForReceipt } from "@/lib/tiba-standard/fixtures";
import type { Receipt } from "@/lib/tiba-standard/types";

export const metadata = { title: "Receipts — Tiba" };

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function receiptStatus(receipt: Receipt): { label: string; className: string; explanation: string } {
  if (receipt.result === "success") {
    return { label: "Recorded", className: "pill-paid", explanation: "The signed action stayed inside the permission slip." };
  }
  if (receipt.reason === "TIBA_REVOKED") {
    return { label: "Refused after revoke", className: "pill-refused", explanation: "The permission had already been revoked, so nothing was done." };
  }
  return { label: "Refused", className: "pill-refused", explanation: "The action was outside the signed permission, so nothing was done." };
}

function actionLabel(receipt: Receipt): string {
  const action = receipt.action;
  if (action.protocol === "payment") return `${action.amount} ${action.currency} transfer`;
  return `${action.tool.replace(/_/g, " ")} via ${action.resource}`;
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const status = receiptStatus(receipt);
  const explorer = explorerUrlForReceipt(receipt);

  return (
    <article className="border-b border-line py-5 first:border-t">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="title">{actionLabel(receipt)}</p>
          <p className="mt-1 text-sm text-muted">{status.explanation}</p>
        </div>
        <span className={`pill ${status.className}`}>{status.label}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        <span>{formatWhen(receipt.executed_at)}</span>
        <span className="num">{receipt.id}</span>
      </div>
      <details className="group mt-4" suppressHydrationWarning>
        <summary className="cursor-pointer text-sm font-medium text-action underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">
          Inspect signed receipt
        </summary>
        <div className="mt-4 grid gap-4 border-t border-line pt-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-muted">Action</p>
            <p className="num mt-1 break-words text-xs">
              {receipt.action.protocol} · {receipt.action.action} · {receipt.action.resource} · {receipt.action.tool}
            </p>
          </div>
          <div>
            <p className="text-muted">Counterparty</p>
            <p className="num mt-1 break-all text-xs">{receipt.action.counterparty}</p>
          </div>
          <div>
            <p className="text-muted">Permission slip</p>
            <p className="num mt-1 break-all text-xs">{receipt.mandate_id}</p>
          </div>
          <div>
            <p className="text-muted">Signed by</p>
            <p className="num mt-1 break-all text-xs">{receipt.actor}</p>
          </div>
          {receipt.reason ? (
            <div>
              <p className="text-muted">Decision code</p>
              <p className="num mt-1 text-xs">{receipt.reason}</p>
            </div>
          ) : null}
          {explorer ? (
            <div>
              <p className="text-muted">Payment evidence</p>
              <a className="link mt-1 inline-block text-sm" href={explorer} target="_blank" rel="noreferrer">
                View on Solana devnet explorer →
              </a>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <p className="text-muted">Signature</p>
            <p className="num mt-1 break-all text-xs">{receipt.signature.value}</p>
          </div>
        </div>
      </details>
    </article>
  );
}

export default function ReceiptsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="receipts" />
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <header className="max-w-2xl">
          <p className="eyebrow">Receipts</p>
          <h1 className="display-l mt-2">A signed record of every action.</h1>
          <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
            The demo wallet records payments and refusals alike. Anyone can inspect the signed receipt and check what happened.
          </p>
        </header>
        <section className="mt-10" aria-labelledby="receipt-list-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
            <div>
              <p className="eyebrow">Demo wallet</p>
              <h2 id="receipt-list-title" className="title mt-2">Signed actions</h2>
            </div>
            <span className="num text-sm text-muted">{demoReceipts.length} receipts</span>
          </div>
          <div>
            {demoReceipts.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} />)}
          </div>
        </section>
      </div>
    </main>
  );
}
