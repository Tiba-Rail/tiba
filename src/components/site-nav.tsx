import Link from "next/link";
import type { Session } from "next-auth";
import { auth, signOut } from "@/auth";
import { Wordmark } from "./wordmark";
import { prisma } from "@/lib/db";

interface SiteNavProps {
  current: string;
}

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

function accountLabel(user: { id?: string | null; name?: string | null; email?: string | null }): string {
  const id = user.id?.trim() ?? "";
  if (id.startsWith("0x") && id.length > 12) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return user.name?.trim() || user.email?.trim() || id || "Account";
}

export async function SiteNav({ current }: SiteNavProps) {
  const links = [
    { key: "", label: "Home", href: "/" },
    { key: "console", label: "Send", href: "/console" },
    { key: "ledger", label: "Activity", href: "/ledger" },
    { key: "work-orders", label: "Invoices", href: "/work-orders" },
    { key: "recipients", label: "Recipients", href: "/recipients" },
    { key: "policies", label: "Limits", href: "/policies" }
  ];

  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    // Auth is optional for the keys-only demo path.
  }

  return (
    <div className="w-full">
      {agent?.killSwitch && (
        <div className="bg-refused py-2 text-center text-sm font-medium text-surface">
          This wallet is frozen. Every payment is refused.
        </div>
      )}
      <nav className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 md:flex md:h-14 md:items-center md:justify-between md:px-6 lg:px-8">
          <div className="flex h-14 items-center md:h-auto">
            <Wordmark />
          </div>
          <div className="flex min-w-0 items-center gap-3 md:gap-5">
            <div className="site-nav-links flex min-w-0 flex-1 gap-4 overflow-x-auto pb-3 text-sm md:flex-none md:gap-6 md:overflow-visible md:pb-0">
              {links.map((link) => (
                <Link
                  key={link.key}
                  href={link.href}
                  aria-current={current === link.key ? "page" : undefined}
                  className={
                    current === link.key
                      ? "whitespace-nowrap font-medium text-foreground transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                      : "whitespace-nowrap text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  }
                >
                  {link.label}
                </Link>
              ))}
            </div>
            {session?.user ? (
              <div className="flex shrink-0 items-center gap-2 pb-3 text-sm md:pb-0">
                <span className="max-w-32 truncate font-medium" title={session.user.email ?? session.user.name ?? session.user.id}>
                  {accountLabel(session.user)}
                </span>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="btn btn-ghost px-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/signin"
                className="btn btn-ghost shrink-0 pb-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action md:pb-0"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
