import Link from "next/link";

interface SiteNavProps {
  current: string;
}

export function SiteNav({ current }: SiteNavProps) {
  const links = [
    { key: "intents", label: "Payout intents", href: "/intents" },
    { key: "work-orders", label: "Work orders", href: "/work-orders" },
    { key: "recipients", label: "Recipients", href: "/recipients" },
    { key: "policies", label: "Policies & controls", href: "/policies" },
    { key: "ledger", label: "Ledger & receipts", href: "/ledger" },
    { key: "console", label: "Console", href: "/console" }
  ];

  return (
    <nav className="border-b border-line">
      <div className="max-w-7xl mx-auto flex flex-row gap-6 px-4 py-3 text-sm">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={
              current === link.key
                ? "font-semibold text-foreground"
                : "text-muted hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}