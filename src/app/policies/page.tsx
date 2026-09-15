import { formatDollars } from "@/app/format";
import { viewerWorkspace } from "@/lib/operator-auth";
import { SiteNav } from "@/components/site-nav";
import { WorkspaceGate } from "@/components/workspace-gate";
import { LimitsClient } from "./limits-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Limits - Tiba" };

export default async function PoliciesPage() {
  const agent = await viewerWorkspace();
  if (!agent) return <WorkspaceGate current="policies" path="/policies" />;

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
