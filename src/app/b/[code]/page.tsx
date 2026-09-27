import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { microsToUsdc } from "@/lib/money";
import { SiteNav } from "@/components/site-nav";
import { BountyPublicView, type BountyPublicClaim } from "@/components/bounty-public-view";

export const dynamic = "force-dynamic";

async function findBounty(code: string) {
  return prisma.bounty.findUnique({ where: { shareCode: code } });
}

// A dedicated page (not a redirect to /bounties/[id]) so Discord/Superteam Earn's link-unfurl
// bot reads THIS page's own metadata/opengraph-image, not whatever /bounties/[id] declares --
// a redirect response has no body for a preview bot to read.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const bounty = await findBounty(code);
  if (!bounty) return { title: "Bounty not found - Tiba" };
  const description = `${microsToUsdc(bounty.amountMicros)} · ${bounty.doneCriteria}`.slice(0, 200);
  return {
    title: `${bounty.title} - claim this bounty`,
    description,
    openGraph: {
      title: bounty.title,
      description,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: bounty.title,
      description
    }
  };
}

export default async function ShareBountyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bounty = await findBounty(code);
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
