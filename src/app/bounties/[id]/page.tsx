import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/site-nav";
import { BountyPublicView, type BountyPublicClaim } from "@/components/bounty-public-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = await prisma.bounty.findUnique({ where: { id } });
  if (!bounty) return { title: "Bounty not found - Tiba" };
  return { title: `${bounty.title} - Tiba bounty` };
}

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bounty = await prisma.bounty.findUnique({ where: { id } });
  if (!bounty) notFound();

  const claims = await prisma.bountyClaim.findMany({
    where: { bountyId: bounty.id },
    include: { payoutIntent: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="bounties" />
      <BountyPublicView
        bounty={{
          id: bounty.id,
          title: bounty.title,
          doneCriteria: bounty.doneCriteria,
          amountMicros: bounty.amountMicros.toString(),
          allowedClaimers: bounty.allowedClaimers,
          shareCode: bounty.shareCode,
          status: bounty.status
        }}
        claims={claims.map((claim): BountyPublicClaim => ({
          id: claim.id,
          workLink: claim.workLink,
          claimerSolanaAddress: claim.claimerSolanaAddress,
          amountAskedMicros: claim.amountAskedMicros.toString(),
          summary: claim.summary,
          status: claim.payoutIntent?.status ?? "processing",
          decisionClass: claim.payoutIntent?.decisionClass ?? "AMBER",
          reasonCode: claim.payoutIntent?.reasonCode ?? null,
          publicToken: claim.payoutIntent?.publicToken ?? null,
          createdAt: claim.createdAt.toISOString()
        }))}
      />
    </main>
  );
}
