import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

export function ServiceUnavailable({
  title = "Receipt not available right now",
  current = ""
}: {
  title?: string;
  current?: string;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current={current} />
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-16 pt-16 md:px-6 md:pt-24 lg:px-8">
        <p className="eyebrow">Tiba</p>
        <h1 className="display-l mt-2">{title}</h1>
        <p className="lede mt-4 max-w-[52ch]">
          This page needs the database, which is temporarily unavailable. Nothing was paid or
          refused while this page could not be loaded. Try again later, or go back to the home
          page.
        </p>
        <div className="mt-6">
          <Link className="btn btn-secondary" href="/">
            Back to Tiba
          </Link>
        </div>
      </div>
    </main>
  );
}
