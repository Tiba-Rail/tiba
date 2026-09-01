import { prisma } from "@/lib/db";
import { RecipientsClient } from "./recipients-client";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null): string | null {
  return date ? new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(date) : null;
}

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
        active: recipient.active,
        kycStatus: recipient.kycStatus,
        kycProvider: recipient.kycProvider,
        kycVerifiedAt: formatDate(recipient.kycVerifiedAt),
        kycExpiresAt: formatDate(recipient.kycExpiresAt)
      }))}
    />
  );
}
