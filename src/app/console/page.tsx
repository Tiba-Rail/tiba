import { RouterHealthStrip } from "@/components/router-health-strip";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { ConsoleClient } from "./console-client";
import { SiteNav } from "@/components/site-nav";

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

export default async function ConsolePage() {
  const [agent, recipients, workOrders, heldIntents] = await Promise.all([
    prisma.agent.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.recipient.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.workOrder.findMany({ include: { recipient: true }, orderBy: { createdAt: "desc" } }),
    prisma.payoutIntent.findMany({
      where: {
        OR: [
          { decisionClass: "AMBER" },
          { decisionClass: "RED", reasonCode: { startsWith: "QUORUM_SPLIT" } }
        ]
      },
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (!agent) {
    return (
      <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="console" />
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
      <SiteNav current="console" />
      <RouterHealthStrip />
      <ConsoleClient
        budget={{
          agentName: agent.name,
          spentDay: microsToUsdc(agent.spentMicrosDay),
          capDay: microsToUsdc(agent.dayCapMicros),
          spentHour: microsToUsdc(agent.spentMicrosHour),
          capHour: microsToUsdc(agent.hourCapMicros),
          dayPercent: percent(agent.spentMicrosDay, agent.dayCapMicros),
          hourPercent: percent(agent.spentMicrosHour, agent.hourCapMicros),
          killSwitch: agent.killSwitch
        }}
        recipients={recipients.map((recipient) => ({
          ref: recipient.ref,
          displayName: recipient.displayName,
          suiAddress: recipient.suiAddress,
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
    </main>
  );
}
