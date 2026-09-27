import { microsToUsdc } from "@/lib/money";
import { decisionSentence, explainDecision } from "@/app/console/types";
import { BountyClaimClient } from "./bounty-claim-client";

export interface BountyPublicData {
  id: string;
  title: string;
  doneCriteria: string;
  amountMicros: string;
  allowedClaimers: string[];
  shareCode: string;
  status: string;
}

export interface BountyPublicClaim {
  id: string;
  workLink: string;
  claimerSolanaAddress: string;
  amountAskedMicros: string;
  summary: string;
  status: string;
  decisionClass: string;
  reasonCode: string | null;
  publicToken: string | null;
  createdAt: string;
}

function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function BountyPublicView({ bounty, claims }: { bounty: BountyPublicData; claims: BountyPublicClaim[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="eyebrow">Bounty {bounty.status !== "open" ? `· ${bounty.status}` : ""}</p>
          <h1 className="display-l mt-2">{bounty.title}</h1>
        </div>
        <p className="lede">{bounty.doneCriteria}</p>
        <p className="title num">{microsToUsdc(bounty.amountMicros)}</p>
        {bounty.allowedClaimers.length > 0 && (
          <p className="text-sm text-muted">
            Only these addresses may claim: {bounty.allowedClaimers.map(shortAddress).join(", ")}
          </p>
        )}
      </header>

      <BountyClaimClient bounty={bounty} initialClaims={claims} />

      <section className="card p-5">
        <h2 className="title mb-4">Claims so far</h2>
        {claims.length === 0 ? (
          <p className="text-muted">No claims yet. Be the first.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="num">{shortAddress(claim.claimerSolanaAddress)}</span>
                  <span className="num">{microsToUsdc(claim.amountAskedMicros)}</span>
                </div>
                <p className="text-muted">{claim.summary}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">{decisionSentence(claim.decisionClass)}</span>
                  {claim.decisionClass !== "PAID" && (
                    <span className="text-muted">— {explainDecision(claim.decisionClass, claim.reasonCode)}</span>
                  )}
                  {claim.publicToken && (
                    <a className="link" href={`/r/${claim.publicToken}`}>Receipt</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
