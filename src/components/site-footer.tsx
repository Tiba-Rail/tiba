import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted md:px-6 lg:px-8">
        Tiba · Test network only — no real money moves yet ·{" "}
        <Link className="link" href="/wall">
          Every check
        </Link>
        {" · "}
        <Link className="link" href="/since">
          Ship log
        </Link>
      </div>
    </footer>
  );
}
