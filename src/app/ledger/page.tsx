import Link from "next/link";
import { prisma } from "@/lib/db";
import { channelTuple } from "@/lib/adjudication-display";
import { disagreementLine, explainDecision } from "@/app/console/types";
import { formatDollars } from "@/app/format";
import { SiteNav } from "@/components/site-nav";
import { ApproveButton } from "./approve-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity - Tiba" };

type Filter = "all" | "pending" | "paid" | "refused" | "needs-approval";

const FILTERS: Array<{ key: Filter; label: string; href: string; empty: string }> = [
  {
    key: "all",
    label: "All",
    href: "/ledger",
    empty: "Nothing yet. When your software pays — or is refused — it shows here."
  },
  {
    key: "pending",
    label: "Pending",
    href: "/ledger?filter=pending",
    empty: "Nothing pending. Payments still being checked, or waiting on you, show here."
  },
  {
    key: "paid",
    label: "Paid",
    href: "/ledger?filter=paid",
    empty: "Nothing paid yet."
  },
  {
    key: "refused",
    label: "Refused",
    href: "/ledger?filter=refused",
    empty: "Nothing refused yet. Refusals stay here permanently — a refusal is Tiba working."
  },
  {
    key: "needs-approval",
    label: "Needs approval",
    href: "/ledger?filter=needs-approval",
    empty: "Nothing needs your approval."
  }
];

function whereFor(filter: Filter) {
  switch (filter) {
    case "pending":
      // Pending absorbs /intents: anything not yet final — checks still
      // running, or held for the owner.
      return { OR: [{ status: "processing" }, { decisionClass: "AMBER" }] };
    case "paid":
      return { decisionClass: "PAID" };
    case "refused":
      return { decisionClass: "RED" };
    case "needs-approval":
      return { decisionClass: "AMBER" };
    default:
      return {};
  }
}

function formatRelativeTime(date: Date): string {
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(date);
}

function statusText(intent: { status: string; decisionClass: string }): { word: string; cls: string } {
  if (intent.status === "processing") return { word: "Pending", cls: "text-muted" };
  if (intent.decisionClass === "PAID") return { word: "Paid", cls: "text-paid" };
  if (intent.decisionClass === "AMBER") return { word: "Needs approval", cls: "text-held" };
  return { word: "Refused", cls: "text-refused" };
}

// The study's one-line meaning under each outcome word.
function statusSentence(intent: {
  status: string;
  decisionClass: string;
  reasonCode: string | null;
}): string {
  if (intent.status === "processing") return "Checks running.";
  if (intent.decisionClass === "PAID") return "Both checks agreed — sent.";
  if (intent.decisionClass === "AMBER") return explainDecision("AMBER", intent.reasonCode);
  return `Checks disagreed — refused. Nothing moved. ${explainDecision("RED", intent.reasonCode)}`;
}

export default async function LedgerPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: raw } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : "all";

  const intents = await prisma.payoutIntent.findMany({
    where: whereFor(filter),
    include: {
      recipient: true,
      adjudications: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="ledger" />
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-6">
          <p className="eyebrow">Activity</p>
          <h1 className="display-l mt-2">Every payment and every refusal</h1>
          <p className="mt-3 max-w-[52ch] text-sm text-muted">
            Refusals are shown beside payments, because a refusal is Tiba working.
          </p>
        </header>

        <div className="site-nav-links -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="navigation" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.href}
              aria-current={f.key === filter ? "true" : undefined}
              className={
                f.key === filter
                  ? "inline-flex h-5 shrink-0 items-center rounded-md border border-line-strong bg-surface px-2 text-xs font-medium text-foreground"
                  : "inline-flex h-5 shrink-0 items-center rounded-md px-2 text-xs text-muted transition-colors hover:text-foreground"
              }
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="divide-y divide-line border-t border-line">
          {intents.length === 0 ? (
            <p className="py-12 text-sm text-muted">{active.empty}</p>
          ) : (
            intents.map((intent) => {
              const status = statusText(intent);
              const held = intent.decisionClass === "AMBER";
              const disagreement =
                intent.decisionClass === "RED" && intent.reasonCode?.startsWith("QUORUM_SPLIT")
                  ? disagreementLine(
                      intent.reasonCode,
                      channelTuple(intent.adjudications.find((row) => row.channel === "artifact")?.tupleJson),
                      channelTuple(intent.adjudications.find((row) => row.channel === "payer_record")?.tupleJson)
                    )
                  : null;

              return (
                <div
                  key={intent.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 transition-colors hover:bg-action-tint/40 md:flex-nowrap"
                >
                  <Link
                    href={`/r/${intent.publicToken}`}
                    className="min-w-0 flex-1 basis-48"
                  >
                    <p className="truncate font-medium">{intent.recipient.displayName}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {disagreement ?? statusSentence(intent)}
                    </p>
                  </Link>
                  <p className="num shrink-0 font-medium">{formatDollars(intent.amountMicros)}</p>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className={`font-medium ${status.cls}`}>{status.word}</span>
                    <span className="text-muted" title={intent.createdAt.toISOString()}>
                      {formatRelativeTime(intent.createdAt)}
                    </span>
                    <Link className="link text-sm" href={`/r/${intent.publicToken}`}>
                      Receipt →
                    </Link>
                    {held ? <ApproveButton intentId={intent.id} /> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
