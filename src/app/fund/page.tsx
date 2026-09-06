import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { FundClient } from "./fund-client";
import { formatDollars } from "@/app/format";
import { getSettlementAddress, getSettlementBalance } from "@/app/settlement";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add funds - Tiba" };

export default async function FundPage() {
  const address = getSettlementAddress();
  const balanceMicros = address ? await getSettlementBalance(address) : 0n;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="fund" />
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
        <header>
          <p className="eyebrow">Add funds</p>
          <h1 className="display-l mt-2">Add funds</h1>
          <p className="lede mt-3">
            Your agent can only spend what is here, within your limits.
          </p>
        </header>

        {address ? (
          <FundClient
            address={address}
            shortAddress={`${address.slice(0, 6)}…${address.slice(-4)}`}
            balanceText={formatDollars(balanceMicros)}
          />
        ) : (
          <div className="card p-5">
            <p className="text-sm text-muted">
              Settlement address is not configured in this environment.
            </p>
            <Link className="btn btn-secondary mt-4" href="/">
              Back to Home
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
