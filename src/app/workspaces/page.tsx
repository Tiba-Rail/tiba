import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspaces - Tiba" };

export default async function WorkspacesPage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/workspaces");
  }

  const workspaces = await prisma.agent.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, rail: true, createdAt: true },
    orderBy: { createdAt: "desc" }
  });
  const liveLabel = "Solana devnet";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <p className="eyebrow">Workspaces</p>
        <h1 className="display-l mt-3">Your workspaces</h1>

        {workspaces.length === 0 ? (
          <section className="card mt-8 p-6">
            <h2 className="title">No workspaces yet</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              Create a workspace to give your software a wallet and limits.
            </p>
            <Link
              href="/start"
              className="btn btn-primary mt-5 focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Create a workspace
            </Link>
          </section>
        ) : (
          <div className="mt-8 space-y-3">
            {workspaces.map((workspace) => (
              <article key={workspace.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="title">{workspace.name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {workspace.rail === "mock" ? "Demo rail" : liveLabel} · Created {workspace.createdAt.toLocaleDateString("en")}
                  </p>
                </div>
                <Link
                  href={`/console?agent=${encodeURIComponent(workspace.id)}`}
                  className="btn btn-secondary shrink-0 focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                >
                  Open workspace
                </Link>
              </article>
            ))}
            <Link
              href="/start"
              className="btn btn-primary mt-3 focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Create another workspace
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
