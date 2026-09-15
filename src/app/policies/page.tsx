import { formatDollars } from "@/app/format";
import { viewerWorkspace } from "@/lib/operator-auth";
import { SiteNav } from "@/components/site-nav";
import { WorkspaceGate } from "@/components/workspace-gate";
import { DemoView } from "@/components/demo-view";
import { LimitsClient } from "./limits-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Limits - Tiba" };

export default async function PoliciesPage() {
  const view = await viewerWorkspace();
  if (!view) return <WorkspaceGate current="policies" path="/policies" />;
  const { workspace: agent, readOnly } = view;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="policies" />
      <DemoView readOnly={readOnly}>
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
      </DemoView>
    </main>
  );
}
