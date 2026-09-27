/**
 * Public ship log for /since.
 * Add the newest ship at the top. One plain line. Date is YYYY-MM-DD, never in the future.
 * Set href only when a live page exists. Do not invent an entry.
 *
 * The Solana Lab win has no calendar date in docs/. The deck says Aug 2026;
 * that month is not shown on the page.
 */

export type Ship = {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** One line a non-coder can read. */
  line: string;
  /** Live page for this ship, when one exists. */
  href?: string;
  /** Words for the link. */
  link?: string;
};

export const sinceIntro = {
  place: "1st place, Superteam Malaysia Solana Lab.",
  network: "Every payment below is on Solana's test network."
} as const;

/** Newest first. */
export const ships: Ship[] = [
  {
    date: "2026-09-26",
    line: "A blank spot on a bill now says it was not found, the public wall no longer shows 0.00 when a refusal asked for no money, and the practice bill states the job on its own line.",
    href: "/wall",
    link: "Every check"
  },
  {
    date: "2026-09-26",
    line: "A program owner can post a bounty, and a contributor can claim it without an account. The claim is checked against the bounty, then paid or refused.",
    href: "/bounties",
    link: "Bounties"
  },
  {
    date: "2026-09-26",
    line: "Anyone can try to fool the check with a practice bill. No test money moves.",
    href: "/try",
    link: "Try it"
  },
  {
    date: "2026-09-26",
    line: "If both checks have to use the same model, the payment still pays or refuses, and the receipt says both checks used the same model."
  },
  {
    date: "2026-09-26",
    line: "A refused receipt shows the bill, the payer's own record, and the line that did not match."
  },
  {
    date: "2026-09-26",
    line: "A public page lists every paid or refused check, newest first.",
    href: "/wall",
    link: "Every check"
  },
  {
    date: "2026-09-26",
    line: "A written path takes a new wallet through a first test payout and a first refusal, each with a public receipt.",
    href: "/developers",
    link: "Developers"
  },
  {
    date: "2026-09-26",
    line: "The check that reads the bill and the check that reads the payer's record now start with different models."
  },
  {
    date: "2026-09-26",
    line: "The pitch deck on the site now leads with the check before a payment goes out.",
    href: "/deck",
    link: "Deck"
  },
  {
    date: "2026-09-25",
    line: "The site leads with one buyer: communities and grant programs that pay contributors. Other chains are proof the same check can travel, and they are not the live rail.",
    href: "/",
    link: "Home"
  },
  {
    date: "2026-09-25",
    line: "Eighteen other products were checked. None refuses a wrong bill on its own. One mentions checking an invoice, and a person still approves. 0 of 17 give a receipt for a refusal.",
    href: "/",
    link: "Home"
  },
  {
    date: "2026-09-25",
    line: "The public line is the check before an AI agent's payment goes out.",
    href: "/",
    link: "Home"
  },
  {
    date: "2026-09-25",
    line: "A shielded payment of 0.001 TAZ went out on Zcash's test network, and a viewing key read the memo back. Built and tested. Not the live rail."
  },
  {
    date: "2026-09-25",
    line: "A Tempo payout rail was built and tested. The fee is paid in the stablecoin. Not the live rail."
  },
  {
    date: "2026-09-25",
    line: "A Solana test payment is marked paid only when a second, separate test-network server confirms the same transaction. If the two disagree, it is refused."
  },
  {
    date: "2026-09-25",
    line: "A pitch deck is on the site, with arrows, tap, swipe, and full screen.",
    href: "/deck",
    link: "Deck"
  },
  {
    date: "2026-09-19",
    line: "The service that reads a bill was replaced after a live test of the old one failed. A check the same day came back clean and correct."
  },
  {
    date: "2026-09-19",
    line: "A practice run lets you set a job, a budget, and an expiry, and see a receipt, without paying anyone.",
    href: "/try",
    link: "Try it"
  },
  {
    date: "2026-09-17",
    line: "Tiba can pay a service that asks for x402 payment on Solana's test network. The check runs first, and a refusal is never signed.",
    href: "/developers",
    link: "Developers"
  },
  {
    date: "2026-09-15",
    line: "Security review closed, six of six findings fixed: wallet pages are private to their owner, a new wallet created without signing in cannot spend the shared test balance, a Telegram chat no longer stores the keys, and the shared demo wallet stays public and read-only."
  },
  {
    date: "2026-09-14",
    line: "Signed permission slips and signed receipts that someone else can check, plus pages to draft a permission, read receipts, and verify one.",
    href: "/developers",
    link: "Developers"
  },
  {
    date: "2026-09-13",
    line: "Five test payments of 0.01 USDC each settled on Solana's test network. Each has a public receipt.",
    href: "/r/2ebed30e-99b7-4929-996c-d014f191ab1a",
    link: "Receipt"
  },
  {
    date: "2026-09-13",
    line: "Wrote down how a Solana test-network payout can go wrong, and what already stops each case."
  },
  {
    date: "2026-09-13",
    line: "Moved from Sui to Solana."
  },
  {
    date: "2026-09-11",
    line: "USDC can be paid on Solana's test network to a Solana address saved for that person. Sign-in works with a Solana wallet, Phantom or Solflare.",
    href: "/signin",
    link: "Sign in"
  },
  {
    date: "2026-09-07",
    line: "An identity check can ask Terminal 3, and only when the recipient has allowed that question. Tiba does not read the identity document itself."
  },
  {
    date: "2026-09-06",
    line: "A Telegram chat can ask Tiba to pay. The bot runs on the site."
  },
  {
    date: "2026-09-06",
    line: "Wallet pages refresh on their own, so a Telegram payment shows up without a reload."
  },
  {
    date: "2026-09-06",
    line: "Sign-in can use Google or GitHub when the site has them turned on. Wallets you create stay on that account.",
    href: "/signin",
    link: "Sign in"
  },
  {
    date: "2026-09-06",
    line: "The home page explains the product, and the wallet has its own page.",
    href: "/app",
    link: "Wallet"
  },
  {
    date: "2026-09-06",
    line: "Anyone can create a wallet on the site. It starts with an example recipient and an example invoice.",
    href: "/start",
    link: "Create a wallet"
  },
  {
    date: "2026-09-06",
    line: "The wallet was rewritten in plain words: Send, Activity, Invoices, Recipients, Limits, and Freeze."
  },
  {
    date: "2026-09-01",
    line: "Another agent can ask Tiba to pay through the Agent-to-Agent protocol. The same check still decides pay or refuse.",
    href: "/developers",
    link: "Developers"
  },
  {
    date: "2026-09-01",
    line: "A payer can require an identity check before a payment. It stays off until they turn it on.",
    href: "/policies",
    link: "Limits"
  },
  {
    date: "2026-09-01",
    line: "A payment is refused when the bill names a different job from the payer's own record, including on small amounts."
  }
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

export type ShipWeek = {
  id: string;
  label: string;
  ships: Ship[];
};

export function formatShipDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function mondayOf(iso: string): string {
  const date = utcDate(iso);
  const weekday = date.getUTCDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().slice(0, 10);
}

function weekLabel(startIso: string): string {
  const start = utcDate(startIso);
  const end = utcDate(startIso);
  end.setUTCDate(end.getUTCDate() + 6);
  const year = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS_LONG[start.getUTCMonth()]} ${year}`;
  }
  return `${start.getUTCDate()} ${MONTHS_LONG[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS_LONG[end.getUTCMonth()]} ${year}`;
}

/** Newest week first. Same-day order follows the data file. */
export function groupShipsByWeek(entries: readonly Ship[]): ShipWeek[] {
  const ordered = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups: ShipWeek[] = [];
  for (const ship of ordered) {
    const id = mondayOf(ship.date);
    const current = groups[groups.length - 1];
    if (current?.id === id) current.ships.push(ship);
    else groups.push({ id, label: weekLabel(id), ships: [ship] });
  }
  return groups;
}
