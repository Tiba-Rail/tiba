import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { UnlockForm } from "./unlock-form";

// Shown in place of a workspace page until the viewer proves they own a workspace. Receipts at
// /r/<token> stay public; payments, recipients and invoices do not.
export function WorkspaceGate({ current, path }: { current: string; path: string }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current={current} />
      <div className="mx-auto max-w-md px-4 py-12">
        <p className="eyebrow">Private</p>
        <h1 className="display-l mt-2">Open your wallet</h1>
        <p className="lede mt-3">Payments, recipients and invoices are shown only to the wallet&apos;s owner.</p>
        <UnlockForm />
        <p className="mt-6 text-sm text-muted">
          <Link className="link" href={`/signin?callbackUrl=${encodeURIComponent(path)}`}>Sign in</Link> if the wallet
          is saved to your account, or <Link className="link" href="/start">create a wallet</Link>.
        </p>
      </div>
    </main>
  );
}
