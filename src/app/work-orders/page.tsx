import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { WorkOrdersClient } from "./work-orders-client";

export const dynamic = "force-dynamic";

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default async function WorkOrdersPage() {
  const [workOrders, recipients] = await Promise.all([
    prisma.workOrder.findMany({
      include: { recipient: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.recipient.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return (
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
        suiAddress: recipient.suiAddress,
        active: recipient.active
      }))}
    />
  );
}
