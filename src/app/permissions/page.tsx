import { SiteNav } from "@/components/site-nav";
import { PermissionSlips } from "./permission-slips";

export const metadata = { title: "Permission slips — Tiba" };

export default function PermissionsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="permissions" />
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <header className="max-w-2xl">
          <p className="eyebrow">Permission slips</p>
          <h1 className="display-l mt-2">Give your agent a clear, signed boundary.</h1>
          <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
            Describe the job in plain English. Tiba drafts the exact scope, budget, and expiry for you to review before you sign. Signed demo slips are kept in this browser; the existing wallet keeps its current limits.
          </p>
        </header>
        <PermissionSlips />
      </div>
    </main>
  );
}
