import Link from "next/link";
import { Wordmark } from "./wordmark";

interface SiteNavProps {
  current: string;
}

export function SiteNav({ current }: SiteNavProps) {
  const links = [
    { key: "intents", label: "Payments", href: "/intents" },
    { key: "work-orders", label: "Jobs", href: "/work-orders" },
    { key: "recipients", label: "People", href: "/recipients" },
    { key: "policies", label: "Rules & limits", href: "/policies" },
    { key: "ledger", label: "History", href: "/ledger" },
    { key: "console", label: "Console", href: "/console" }
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
