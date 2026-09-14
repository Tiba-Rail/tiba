import Link from "next/link";
import { RotatingWord } from "@/components/rotating-word";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiba — a wallet for AI agents" };

export default async function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-16 pt-16 md:gap-16 md:px-6 md:pt-24 lg:px-8">
        <header>
          <p className="eyebrow">A wallet for AI agents · test network</p>
          <h1 className="display-xl mt-4 max-w-[20ch]">
            A wallet for <RotatingWord words={["AI agents", "your agent"]} intervalMs={2500} />.
          </h1>
          <p className="lede mt-6">
            You give your agent a signed permission slip; it acts and pays only within it; you get a
            signed receipt for everything it does, that anyone can check.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/start">
              Create your wallet
            </Link>
            <Link className="btn btn-secondary" href="/signin">
              Sign in
            </Link>
            <Link className="btn btn-ghost" href="/app">
              See the demo wallet
            </Link>
            <Link className="btn btn-ghost" href="/permissions">
              Explore permissions
            </Link>
          </div>
        </header>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Your control, made explicit</p>
          <div className="mt-6 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <p className="num display-l">01</p>
              <p className="eyebrow mt-2">plain-English instruction</p>
            </div>
            <div>
              <p className="num display-l">02</p>
              <p className="eyebrow mt-2">human confirmation</p>
            </div>
            <div>
              <p className="num display-l">03</p>
              <p className="eyebrow mt-2">signed permission</p>
            </div>
            <div>
              <p className="num display-l">04</p>
              <p className="eyebrow mt-2">checkable receipt</p>
            </div>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">How it works</p>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            <li>
              <p className="num text-sm text-muted">01</p>
              <p className="lede mt-3">
                Write what your agent may do in the language you already use.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">02</p>
              <p className="lede mt-3">
                Review the scope, budget, and expiry. You choose whether to sign.
              </p>
            </li>
            <li>
              <p className="num text-sm text-muted">03</p>
              <p className="lede mt-3">
                The agent stays inside that permission and leaves a signed receipt behind.
              </p>
            </li>
          </ol>
          <div className="mt-10 space-y-4">
            <p className="lede">
              A permission slip says exactly what is allowed, how much may be spent, and when it stops.
            </p>
            <p className="lede">
              Revoke it when the task changes. New actions stop at the boundary you set.
            </p>
            <p className="lede">
              Every outcome is a receipt that can be checked independently, without trusting a dashboard.
            </p>
            <p className="lede">The wallet stays: agents still pay from it within the limits you set.</p>
          </div>
        </section>

        <section className="border-t border-line pt-12">
          <p className="eyebrow">Signed outcomes</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <span className="pill pill-paid">Recorded</span>
              <p className="mt-3 text-sm">
                A permitted notes action and a <span className="num">0.001 USDC</span> Solana devnet payment each leave a signed receipt.
              </p>
              <Link className="btn btn-ghost mt-3" href="/receipts">
                See signed receipts →
              </Link>
            </div>
            <div className="card p-5">
              <span className="pill pill-refused">Refused</span>
              <p className="mt-3 text-sm">
                An action outside the permission is refused before it goes out. The refusal is signed, too.
              </p>
              <Link className="btn btn-ghost mt-3" href="/verify">
                Verify a receipt →
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-line pt-12 text-sm text-muted">
          Tiba · Test network only — no real money moves yet ·{" "}
          <Link className="link" href="/app">
            Open the app
          </Link>{" "}
          ·{" "}
          <a className="link" href="https://github.com/Tiba-Rail/tiba">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}
