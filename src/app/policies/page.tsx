import { prisma } from "@/lib/db";
import { formatDollars } from "@/app/format";
import { SiteNav } from "@/components/site-nav";
import { LimitsClient } from "./limits-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Limits - Tiba" };

export default async function PoliciesPage() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });

  if (!agent) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <SiteNav current="policies" />
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
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
        <header>
          <p className="eyebrow">Limits</p>
          <h1 className="display-l mt-2">Spending limits</h1>
          <p className="lede">
            Set once by you. Your software can read these and never change them.
          </p>
        </header>

        <LimitsClient
          agent={{
            killSwitch: agent.killSwitch,
            requireRecipientKyc: agent.requireRecipientKyc,
            ceiling: formatDollars(agent.ceilingMicros),
            dayCap: formatDollars(agent.dayCapMicros)
          }}
          history={[]}
        />
      </div>
    </main>
  );
}
