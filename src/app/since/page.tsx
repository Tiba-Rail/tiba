import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { formatShipDate, groupShipsByWeek, ships, sinceIntro } from "@/data/since";

export const metadata = {
  title: "Since the Solana Lab win — Tiba",
  description:
    "What Tiba has shipped since 1st place at Superteam Malaysia's Solana Lab. Test network only — no real money."
};

export default function SincePage() {
  const weeks = groupShipsByWeek(ships);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="" />
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 md:px-6 lg:px-8">
        <header>
          <p className="eyebrow">Ship log · test network</p>
          <h1 className="display-l mt-2">Since the Solana Lab win</h1>
          <div className="mt-4 max-w-[62ch] space-y-1 text-sm leading-6">
            <p>{sinceIntro.place}</p>
            <p>{sinceIntro.network}</p>
            <p className="num text-muted">
              {ships.length} {ships.length === 1 ? "entry" : "entries"}.
            </p>
          </div>
        </header>

        {weeks.map((week) => (
          <section key={week.id} aria-labelledby={`week-${week.id}`}>
            <h2 id={`week-${week.id}`} className="eyebrow">
              {week.label}
            </h2>
            <ul className="mt-4 border-t border-line">
              {week.ships.map((ship) => (
                <li key={`${ship.date}-${ship.line}`} className="grid gap-2 border-b border-line py-4 sm:grid-cols-[4.5rem_1fr] sm:gap-6">
                  <time className="num text-sm text-muted" dateTime={ship.date}>
                    {formatShipDate(ship.date)}
                  </time>
                  <p className="text-sm leading-6">
                    {ship.line}
                    {ship.href && ship.link ? (
                      <>
                        {" "}
                        <Link className="link" href={ship.href}>
                          {ship.link}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
