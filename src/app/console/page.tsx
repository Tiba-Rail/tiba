import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { viewerWorkspace } from "@/lib/operator-auth";
import { ConsoleClient } from "./console-client";
import { SiteNav } from "@/components/site-nav";
import { WorkspaceGate } from "@/components/workspace-gate";
import { DemoView } from "@/components/demo-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send - Tiba" };

function percent(spent: bigint, cap: bigint): number {
  if (cap <= 0n) return 0;
  return Number((spent * 10_000n) / cap) / 100;
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default async function ConsolePage({
  searchParams
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentId } = await searchParams;
  const view = await viewerWorkspace(agentId);
  if (!view) return <WorkspaceGate current="console" path="/console" />;
  const { workspace: agent, readOnly } = view;

  const [recipients, workOrders, heldIntents] = await Promise.all([
    prisma.recipient.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: "asc" } }),
    prisma.workOrder.findMany({
      where: { recipient: { agentId: agent.id } },
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payoutIntent.findMany({
      where: {
        agentId: agent.id,
        OR: [
          { decisionClass: "AMBER" },
          { decisionClass: "RED", reasonCode: { startsWith: "QUORUM_SPLIT" } }
        ]
      },
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="console" />
      <RouterHealthStrip />
      <DemoView readOnly={readOnly}>
      <ConsoleClient
        budget={{
          agentName: agent.name,
          spentDay: microsToUsdc(agent.spentMicrosDay),
          capDay: microsToUsdc(agent.dayCapMicros),
          spentHour: microsToUsdc(agent.spentMicrosHour),
          capHour: microsToUsdc(agent.hourCapMicros),
          capInvoice: microsToUsdc(agent.ceilingMicros),
          dayPercent: percent(agent.spentMicrosDay, agent.dayCapMicros),
          hourPercent: percent(agent.spentMicrosHour, agent.hourCapMicros),
          killSwitch: agent.killSwitch
        }}
        recipients={recipients.map((recipient) => ({
          ref: recipient.ref,
          displayName: recipient.displayName,
          solanaAddress: recipient.solanaAddress,
          active: recipient.active
        }))}
        workOrders={workOrders.map((workOrder) => ({
          ref: workOrder.ref,
          recipientRef: workOrder.recipient.ref,
          recipientName: workOrder.recipient.displayName,
          ceiling: microsToUsdc(workOrder.ceilingMicros),
          expiresAt: shortDate(workOrder.expiresAt),
          status: workOrder.status
        }))}
        heldIntents={heldIntents.map((intent) => ({
          id: intent.id,
          createdAt: shortDate(intent.createdAt),
          recipientName: intent.recipient.displayName,
          amount: microsToUsdc(intent.amountMicros),
          decisionClass: intent.decisionClass,
          reasonCode: intent.reasonCode
        }))}
      />
      </DemoView>
    </main>
  );
}
