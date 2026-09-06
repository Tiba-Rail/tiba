import Link from "next/link";
import { Wordmark } from "./wordmark";

interface SiteNavProps {
  current: string;
}

export function SiteNav({ current }: SiteNavProps) {
  const links = [
    { key: "console", label: "Send", href: "/console" },
    { key: "ledger", label: "Activity", href: "/ledger" },
    { key: "intents", label: "Payments", href: "/intents" },
    { key: "work-orders", label: "Invoices", href: "/work-orders" },
    { key: "recipients", label: "Recipients", href: "/recipients" },
    { key: "policies", label: "Limits", href: "/policies" }
  ];

  return (
    <nav className="border-b border-line">
      <div className="mx-auto max-w-7xl px-4 md:flex md:h-14 md:items-center md:justify-between md:px-6 lg:px-8">
        <div className="flex h-14 items-center md:h-auto">
          <Wordmark />
        </div>
        <div className="site-nav-links -mx-4 flex w-[calc(100%+2rem)] shrink-0 gap-4 overflow-x-auto px-4 pb-3 text-sm md:mx-0 md:w-auto md:gap-6 md:overflow-visible md:px-0 md:pb-0">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={
                current === link.key
                  ? "font-medium text-foreground transition-colors duration-150"
                  : "text-muted transition-colors duration-150 hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
