import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { viewerWorkspace } from "@/lib/operator-auth";
import { BountiesClient } from "./bounties-client";
import { SiteNav } from "@/components/site-nav";
import { WorkspaceGate } from "@/components/workspace-gate";
import { DemoView } from "@/components/demo-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bounties - Tiba" };

export default async function BountiesPage() {
  const view = await viewerWorkspace();
  if (!view) return <WorkspaceGate current="bounties" path="/bounties" />;
  const { workspace: agent, readOnly } = view;

  const bounties = await prisma.bounty.findMany({
    where: { agentId: agent.id },
    include: { _count: { select: { claims: true } } },
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="bounties" />
      <DemoView readOnly={readOnly}>
        <BountiesClient
          bounties={bounties.map((bounty) => ({
            id: bounty.id,
            title: bounty.title,
            doneCriteria: bounty.doneCriteria,
            amount: microsToUsdc(bounty.amountMicros),
            allowedClaimers: bounty.allowedClaimers,
            shareCode: bounty.shareCode,
            status: bounty.status,
            claimCount: bounty._count.claims
          }))}
        />
      </DemoView>
    </main>
  );
}
