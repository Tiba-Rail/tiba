import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { viewerWorkspace } from "@/lib/operator-auth";
import { WorkOrdersClient } from "./work-orders-client";
import { SiteNav } from "@/components/site-nav";
import { WorkspaceGate } from "@/components/workspace-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices - Tiba" };

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default async function WorkOrdersPage() {
  const agent = await viewerWorkspace();
  if (!agent) return <WorkspaceGate current="work-orders" path="/work-orders" />;

  const [workOrders, recipients] = await Promise.all([
    prisma.workOrder.findMany({
      where: { recipient: { agentId: agent.id } },
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.recipient.findMany({
      where: { agentId: agent.id, active: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="work-orders" />
      <WorkOrdersClient
        workOrders={workOrders.map((workOrder) => ({
          ref: workOrder.ref,
          ceiling: microsToUsdc(workOrder.ceilingMicros),
          expiresAt: shortDate(workOrder.expiresAt),
          status: workOrder.status,
          recipient: {
            ref: workOrder.recipient.ref,
            displayName: workOrder.recipient.displayName
          }
        }))}
        recipients={recipients.map((recipient) => ({
          ref: recipient.ref,
          displayName: recipient.displayName,
          solanaAddress: recipient.solanaAddress,
          active: recipient.active
        }))}
      />
    </main>
  );
}
