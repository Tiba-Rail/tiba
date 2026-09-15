import Link from "next/link";
import type { ReactNode } from "react";
import { UnlockForm } from "./unlock-form";

// The shared demo wallet is public but read-only. A banner says so, and a disabled <fieldset>
// disables every button and field in the page below it. The owner APIs refuse without the demo
// wallet's owner key anyway; this only stops visitors pressing buttons that cannot work.
export function DemoView({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-6 md:px-6 lg:px-8">
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted">
          <p>
            This is the shared demo wallet: read-only, test network only.{" "}
            <Link className="link" href="/start">Create your own</Link> or{" "}
            <Link className="link" href="/signin">sign in</Link>.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Open your own wallet with its owner key</summary>
            <UnlockForm />
          </details>
        </div>
      </div>
      <fieldset disabled className="min-w-0">
        {children}
      </fieldset>
    </>
  );
}
