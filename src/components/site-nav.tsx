import Link from "next/link";
import { Wordmark } from "./wordmark";
import { prisma } from "@/lib/db";

interface SiteNavProps {
  current: string;
}

const MARKETING_KEYS = new Set(["", "how", "start"]);

export async function SiteNav({ current }: SiteNavProps) {
  const marketing = MARKETING_KEYS.has(current);

  return (
    <div className="w-full">
      {!marketing && <KillSwitchBanner />}
      <nav className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 md:flex md:h-14 md:items-center md:justify-between md:px-6 lg:px-8">
          <div className="flex h-14 items-center md:h-auto">
            <Wordmark />
          </div>
          <div className="site-nav-links -mx-4 flex w-[calc(100%+2rem)] shrink-0 gap-4 overflow-x-auto px-4 pb-3 text-sm md:mx-0 md:w-auto md:gap-6 md:overflow-visible md:px-0 md:pb-0">
            {marketing ? <MarketingLinks current={current} /> : <AppLinks current={current} />}
          </div>
        </div>
      </nav>
    </div>
  );
}

async function KillSwitchBanner() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
  if (!agent?.killSwitch) return null;
  return (
    <div className="bg-refused py-2 text-center text-sm font-medium text-surface">
      This wallet is frozen. Every payment is refused.
    </div>
  );
}

function MarketingLinks({ current }: { current: string }) {
  return (
    <>
      <Link
        href="/how"
        className={
          current === "how"
            ? "font-medium text-foreground transition-colors duration-150"
            : "text-muted transition-colors duration-150 hover:text-foreground"
        }
      >
        How it works
      </Link>
      <Link
        href="/app"
        className="text-muted transition-colors duration-150 hover:text-foreground"
      >
        Open the app
      </Link>
    </>
  );
}

function AppLinks({ current }: { current: string }) {
  const links = [
    { key: "app", label: "Home", href: "/app" },
    { key: "console", label: "Send", href: "/console" },
    { key: "ledger", label: "Activity", href: "/ledger" },
    { key: "work-orders", label: "Invoices", href: "/work-orders" },
    { key: "recipients", label: "Recipients", href: "/recipients" },
    { key: "policies", label: "Limits", href: "/policies" }
  ];

  return (
    <>
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
    </>
  );
}
