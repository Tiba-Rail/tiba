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
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
        <Wordmark />
        <div className="flex flex-row gap-6 text-sm">
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
