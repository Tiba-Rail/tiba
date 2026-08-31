import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { SiteNav } from "@/components/site-nav";
import { KillSwitchButton } from "./kill-switch-button";

export const dynamic = "force-dynamic";

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
          <h1 className="display text-4xl md:text-5xl">No seeded agent</h1>
          <p className="mt-2 text-muted">Run npm run seed before opening the policies page.</p>
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
          <p className="eyebrow">Policies & controls</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">The boundary an agent cannot cross</h1>
          <p className="text-muted">Caps, allowlist, and the kill switch. An agent can read these. Only a human can change them.</p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          {/* Spending caps card */}
          <div className="card p-5">
            <h2 className="text-xl font-bold">Spending caps</h2>
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">Day</span>
                  <span className="text-muted">{microsToUsdc(agent.spentMicrosDay)} / {microsToUsdc(agent.dayCapMicros)}</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosDay, agent.dayCapMicros)))}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">Hour</span>
                  <span className="text-muted">{microsToUsdc(agent.spentMicrosHour)} / {microsToUsdc(agent.hourCapMicros)}</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent(agent.spentMicrosHour, agent.hourCapMicros)))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Allowlist card */}
          <div className="card p-5">
            <h2 className="text-xl font-bold">Allowlist</h2>
            <div className="mt-5">
              <p className="text-4xl font-semibold">{activeRecipientsCount} of {totalRecipientsCount} recipients active</p>
              <div className="mt-4">
                <a href="/recipients" className="btn btn-primary">Manage recipients</a>
              </div>
            </div>
          </div>

          {/* Kill switch card */}
          <div className="card p-5">
            <h2 className="text-xl font-bold">Kill switch</h2>
            <div className="mt-5">
              <p className={agent.killSwitch ? "text-5xl font-semibold text-red-ink" : "text-5xl font-semibold"}>
                {agent.killSwitch ? "ON" : "OFF"}
              </p>
              <div className="mt-4">
                <KillSwitchButton current={agent.killSwitch} />
              </div>
              <p className="mt-4 text-sm text-muted">This can also be done from the <a href="/console" className="text-primary underline">Console</a>.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}