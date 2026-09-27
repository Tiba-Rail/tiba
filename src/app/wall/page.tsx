import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { getRefusalWall } from "@/lib/refusal-wall-data";
import type { WallOutcome, WallRow } from "@/lib/refusal-wall";

// Cached HTML, regenerated at most every 60 seconds. Same window as the receipt query.
export const revalidate = 60;
export const dynamic = "force-static";

export const metadata = {
  title: "Every demo check — Tiba",
  description:
    "Every demo receipt, paid or refused. Test network only — no real money."
};

const PILL: Record<WallOutcome, string> = {
  PAID: "pill pill-paid",
  REFUSED: "pill pill-refused",
  HELD: "pill pill-held"
};

export default async function WallPage() {
  const wall = await getRefusalWall();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 md:px-6 lg:px-8">
        <header>
          <p className="eyebrow">Public record · test network</p>
          <h1 className="display-l mt-2">Every check in the demo, paid or refused</h1>
          <p className="lede mt-4">
            Each row is a receipt that was already public by its link. Test money only — nothing here is real money.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-8 border-t border-line pt-8 md:grid-cols-5" aria-label="Running totals">
          <Total value={String(wall.checksRun)} label="checks run" />
          <Total value={String(wall.paid)} label="paid" />
          <Total value={String(wall.simulatedPaid)} label="simulated, nothing sent" />
          <Total value={String(wall.refused)} label="refused" />
          <Total
            value={wall.refusedAmount ?? "refusals so far asked for nothing"}
            label="refused, test money"
            caption={wall.refused > 0 ? `${wall.refusedWithAmount} of ${wall.refused} asked for money` : undefined}
          />
        </section>

        <section aria-label="Public receipts">
          {wall.rows.length === 0 ? (
            <p className="border-t border-line py-12 text-sm text-muted">
              No public receipts yet. When a check pays or refuses, it shows up here.
            </p>
          ) : (
            <ul className="border-t border-line">
              {wall.rows.map((row) => (
                <li key={row.href}>
                  <ReceiptRow row={row} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Total({ value, label, caption }: { value: string; label: string; caption?: string }) {
  // The dollar figures use the big numeric display style; a sentence (no refusal has asked for
  // money yet) reads oddly at that size and isn't a number, so it drops to plain text.
  const isAmount = /^[\d.,]/.test(value);
  return (
    <div>
      <p className={isAmount ? "num display-m" : "title"}>{value}</p>
      <p className="eyebrow mt-2">{label}</p>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

function ReceiptRow({ row }: { row: WallRow }) {
  return (
    <Link href={row.href} className="block border-b border-line py-4 transition-colors hover:bg-action-tint/40">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className={PILL[row.outcome]}>{row.outcomeLabel}</span>
        <span className="num font-medium">{row.amount}</span>
        <span className="text-sm text-muted">{row.chain}</span>
        <time className="text-sm text-muted" dateTime={row.timeIso}>
          {row.time}
        </time>
      </div>
      {row.mismatch ? (
        <p className="mt-2 text-sm">
          {row.mismatch.field} did not match. The bill said{" "}
          <span className="num">{row.mismatch.bill}</span>. The record said{" "}
          <span className="num">{row.mismatch.record}</span>.
        </p>
      ) : row.reason ? (
        <p className="mt-2 text-sm text-muted">{row.reason}</p>
      ) : null}
    </Link>
  );
}
