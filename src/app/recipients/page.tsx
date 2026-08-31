import { prisma } from "@/lib/db";
import { RecipientsClient } from "./recipients-client";

export const dynamic = "force-dynamic";

export default async function RecipientsPage() {
  const recipients = await prisma.recipient.findMany({
    orderBy: { createdAt: "asc" }
  });

  return (
    <RecipientsClient
      recipients={recipients.map((recipient) => ({
        ref: recipient.ref,
        displayName: recipient.displayName,
        suiAddress: recipient.suiAddress,
        active: recipient.active
      }))}
    />
  );
}
