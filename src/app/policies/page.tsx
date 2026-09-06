import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { SiteNav } from "@/components/site-nav";
import { KillSwitchButton } from "./kill-switch-button";
import { IdentityGateButton } from "./identity-gate-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Limits - Tiba" };

function percent(spent: bigint, cap: bigint): number {
  if (cap <= 0n) return 0;
  return Number((spent * 10_000n) / cap) / 100;
}

export default async function PoliciesPage() {
  const [agent, activeRecipientsCount, totalRecipientsCount] = await Promise.all([
    prisma.agent.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.recipient.count({ where: { active: true } }),
    prisma.recipient.count()
  ]);

  if (!agent) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <SiteNav current="policies" />
        <RouterHealthStrip />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="display-l">Nothing is set up yet</h1>
          <p className="lede mt-2">This wallet has no software attached yet.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="policies" />
      <RouterHealthStrip />
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4">
          <p className="eyebrow">Limits</p>
          <h1 className="display-l mt-2">Spending limits</h1>
          <p className="lede">
            Set once by you. Your software can read these and never change them.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {/* Spending limits card */}
          <div className="card p-5">
            <h2 className="title">Spending limits</h2>
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">Today</span>
                  <span className="num text-muted">{microsToUsdc(agent.spentMicrosDay)} / {microsToUsdc(agent.dayCapMicros)}</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosDay, agent.dayCapMicros)))}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">This hour</span>
                  <span className="num text-muted">{microsToUsdc(agent.spentMicrosHour)} / {microsToUsdc(agent.hourCapMicros)}</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosHour, agent.hourCapMicros)))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Approved people card */}
          <div className="card p-5">
            <h2 className="title">Saved recipients</h2>
            <div className="mt-5">
              <p className="num display-l">{activeRecipientsCount} of {totalRecipientsCount} ready</p>
              <div className="mt-4">
                <a href="/recipients" className="btn btn-ghost">See recipients →</a>
              </div>
            </div>
          </div>

          {/* Freeze card */}
          <div className="card p-5">
            <h2 className="title">Freeze</h2>
            <div className="mt-5">
              <p className={agent.killSwitch ? "num display-l text-red-ink" : "num display-l"}>
                {agent.killSwitch ? "ON — all payments refused" : "OFF"}
              </p>
              <div className="mt-4">
                <KillSwitchButton current={agent.killSwitch} />
              </div>
              <p className="mt-4 text-sm text-muted">
                While frozen, every payment is refused before any check runs.
              </p>
              <p className="mt-2 text-sm text-muted">
                You can also do this from <a href="/console" className="link">Send</a>.
              </p>
            </div>
          </div>

          {/* Identity check card */}
          <div className="card p-5">
            <h2 className="title">Identity check before paying</h2>
            <div className="mt-5">
              <p className="num display-l">{agent.requireRecipientKyc ? "Required" : "Not required"}</p>
              <p className="mt-2 text-sm text-muted">
                When required, anyone without a current identity check is refused before the checks
                even run.
              </p>
              <div className="mt-4">
                <IdentityGateButton current={agent.requireRecipientKyc} />
              </div>
              <p className="mt-4 text-sm text-muted">
                Uses the owner key typed in the Freeze box. See who is verified under{" "}
                <a href="/recipients" className="link">Recipients</a>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
