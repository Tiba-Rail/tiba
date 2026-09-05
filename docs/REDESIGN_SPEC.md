# Tiba — Sigma redesign implementation spec

## 0. Start here

This is the **Sigma** visual-and-copy redesign. It keeps every mechanism and claim exactly as they are today and only changes how the product speaks and looks. Apply edits in the order listed. The first edit is the Q5 council fix: the refused pill background must be a light tint, not a dark fill.

**Winning base:** `07_spec_1_Visual_system_first_.json` (council Q1).  
**Action colour:** `#2D4FC7` (council Q2 — approved 5/5; identical to the runner-up).  
**Q5 first fix:** change `--refused-bg` to a tinted red (`#F2E4E4`) so the three outcome pills share one visual pattern.  
**Q3 false-copy overrides:** 
- “Two separate readers check each payment” is rewritten as “two separate automated checks” on marketing surfaces so it does not imply human readers [08_council_verdict.txt, Q3].
- “Tiba refused rather than guess” is removed from refusal sentences; the deterministic reason is now stated directly [08_council_verdict.txt, Q3].
- The PAID explanation does not say “money was sent” unless the row is a `PAID` settlement-success [08_council_verdict.txt, Q3].
- The kill-switch explanation states that refusal happens *before any check runs*, not just “until a human turns it off” [08_council_verdict.txt, Q3].
- The “How it works” third step does not say every non-match is “refused”; it says refused **or held** for a human [08_council_verdict.txt, Q3].

**Q4 grafts applied:** maker/checker copy skeleton, Reader A / Reader B labels on the receipt, field-specific QUORUM_SPLIT sentences, and a full per-reason-code `explainDecision` map from the runner-up spec [08_council_verdict.txt, Q4].

---

## 1. Action colour

| Item | Decision |
|------|----------|
| Final hex | `#2D4FC7` (cobalt) — third-tone research candidate 1 [06_result6.json]. WCAG AA on bone `#FBFAF7` = 6.59:1; white text on it = 6.87:1. Hue ~227°, far from paid green (~152°) and refused red (~0°), so it cannot be read as an outcome under colour-blindness. |
| Token | `--action` / `--color-action` in `@theme inline`. |
| Text on it | White `#FFFFFF` only. Never ink `#14161A` on cobalt (2.63:1, fail). |
| Hover | `#2542A8` (`--action-hover`). |
| Pressed/active | `#1E3689` (`--action-pressed`). |
| Tint | `#E8ECF9` (`--action-tint`) = `rgba(45,79,199,0.10)`. |
| Focus ring | `rgba(45,79,199,0.35)` (`--action-ring`). |
| Button rule | **At most one `.btn-primary` per route**, cobalt fill + white text, for the page’s forward action only. The action colour also appears on the Σ mark and focus rings; it is **not** used on `.btn-secondary`, `.btn-ghost` or inline links. Outcome colours (paid green, refused red, held amber) are **never used on buttons**. |

The kill switch therefore uses a `.btn-secondary` in both states; the ON/OFF state is shown by the large red-ink figure, not by the button colour.

---

## 2. `globals.css` additions

Replace the `:root` block and the class definitions with the following. No new dependencies; all styling must come from these tokens and Tailwind v4 utilities.

```css
@import "tailwindcss";

:root {
  --background: #FBFAF7;
  --foreground: #14161A;
  --muted: #6A7078;
  --border: #E4E2DC;
  --border-strong: #C9C6BE;
  --surface: #FFFFFF;

  /* Outcome states */
  --paid: #1F6B4A;
  --paid-bg: #E6F0EB;
  --held: #8A5E12;
  --held-bg: #F6E9CE;
  --refused: #7A2E2E;
  --refused-bg: #F2E4E4;          /* Q5 council fix */

  /* Action state */
  --action: #2D4FC7;
  --action-hover: #2542A8;
  --action-pressed: #1E3689;
  --action-tint: #E8ECF9;
  --action-ring: rgba(45,79,199,0.35);

  /* Display scale */
  --display-xl: clamp(2.75rem, 2.2rem + 2.6vw, 4.5rem);
  --display-l: clamp(2.25rem, 1.9rem + 1.4vw, 3.25rem);
  --display-m: clamp(1.75rem, 1.6rem + 0.5vw, 2.125rem);

  /* next/font will inject --font-inter, --font-jetbrains, --font-instrument-serif on the html class */
}

@theme inline {
  --color-primary: var(--foreground);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-surface: var(--surface);
  --color-line: var(--border);
  --color-line-strong: var(--border-strong);
  --color-paid: var(--paid);
  --color-paid-bg: var(--paid-bg);
  --color-held: var(--held);
  --color-held-bg: var(--held-bg);
  --color-refused: var(--refused);
  --color-refused-bg: var(--refused-bg);
  --color-action: var(--action);
  --color-action-tint: var(--action-tint);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains);
  --font-editorial: var(--font-instrument-serif);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: 1.55;
  letter-spacing: -0.011em;
}

/* Editorial display — Instrument Serif, weight 400 only */
.display-xl,
.display-l,
.display-m,
.display {
  font-family: var(--font-editorial);
  font-weight: 400;
}
.display-xl {
  font-size: var(--display-xl);
  line-height: 1.0;
  letter-spacing: -0.03em;
}
.display-l {
  font-size: var(--display-l);
  line-height: 1.05;
  letter-spacing: -0.025em;
}
.display-m {
  font-size: var(--display-m);
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.display-xl em,
.display-l em,
.display-m em,
.display em {
  font-style: italic;
  font-weight: 400;
}

.lede {
  font-size: clamp(1.125rem, 1.05rem + 0.3vw, 1.375rem);
  line-height: 1.45;
  letter-spacing: -0.011em;
  max-width: 52ch;
  color: var(--foreground);
}

.title {
  font-family: var(--font-sans);
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: 0;
}

.eyebrow {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.num {
  font-family: var(--font-mono);
  font-variant-numeric: lining-nums tabular-nums slashed-zero;
  font-feature-settings: "tnum" 1;
}

.mono,
code,
pre {
  font-family: var(--font-mono);
}

/* Cards, borders, no shadows */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1.25rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: -0.005em;
  line-height: 1;
  transition:
    background-color 180ms cubic-bezier(0.215, 0.61, 0.355, 1),
    border-color 180ms cubic-bezier(0.215, 0.61, 0.355, 1),
    color 180ms cubic-bezier(0.215, 0.61, 0.355, 1),
    text-decoration-color 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
}
.btn:focus-visible {
  outline: 2px solid var(--action);
  outline-offset: 2px;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--action);
  color: #fff;
}
.btn-primary:hover { background: var(--action-hover); }
.btn-primary:active { background: var(--action-pressed); }

.btn-secondary {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--foreground);
}
.btn-secondary:hover {
  border-color: var(--foreground);
  background: rgba(20, 22, 26, 0.04);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--foreground);
  min-height: 2.25rem;
  padding: 0 0.5rem;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
}
.btn-ghost:hover {
  text-decoration-color: currentColor;
}

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}
.pill-paid { background: var(--paid-bg); color: var(--paid); }
.pill-held,
.pill-amber { background: var(--held-bg); color: var(--held); }
.pill-refused,
.pill-red { background: var(--refused-bg); color: var(--refused); }

/* Fields */
.field {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: #fff;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  color: var(--foreground);
  transition:
    border-color 180ms cubic-bezier(0.215, 0.61, 0.355, 1),
    box-shadow 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
}
.field:focus {
  outline: none;
  border-color: var(--action);
  box-shadow: 0 0 0 3px var(--action-ring);
}

/* Inline link */
.link {
  color: var(--foreground);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
  transition: text-decoration-color 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
}
.link:hover { text-decoration-color: currentColor; }

/* Lockup utility */
.lockup {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-family: var(--font-editorial);
  font-size: 1.5rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--foreground);
}
.lockup-mark {
  height: 0.72em;
  width: auto;
  color: var(--action);
  transform: translateY(-0.03em);
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

### Type, spacing and border principles

- **Display sizes:** `.display-xl` for landing hero only, `.display-l` for every other page h1, `.display-m` for denial-banner headline and section eyebrows/headers that need emphasis. No inline `text-4xl md:text-5xl` utilities on h1s.
- **Body:** base `1rem/1.55` on data pages; all marketing body paragraphs use `.lede` (`≥1.125rem`) so body text is ≥18 px for projector readability [stage-first brief]. Small labels/figures stay at `0.75rem` / `0.875rem`.
- **Numerals:** every amount, cap, count, latency, timestamp, request id, digest and wallet address gets `.num`.
- **Spacing rhythm:** 4 px base. Component gaps: `8/12/16/24`. Block gaps: `32/48`. Marketing hero top padding `pt-16 md:pt-24`, section gaps `gap-12 md:gap-16`. Data pages keep `py-8` and `gap-8` between sections.
- **Borders, not cards, on marketing:** `/` uses `border-t border-line pt-12 mt-12` for the proof strip, “How it works” and real-example sections. Forms and data tables keep `.card`. No box-shadow anywhere.

---

## 3. Per-route copy and visual edits

The requested six routes (`/`, `/console`, `/work-orders`, `/ledger`, `/policies`, `/r/[token]`) are fully specified below. `/recipients` and `/intents` are also included because they are public-product surfaces and must keep the same vocabulary as the nav.

### 3.0 Global components

#### `src/app/layout.tsx`
- Rename font constants/variables and add italic to Instrument Serif:
  - `Inter` → variable `--font-inter`
  - `JetBrains_Mono` → variable `--font-jetbrains`
  - `Instrument_Serif` → variable `--font-instrument-serif`, `weight: "400"`, `style: ["normal", "italic"]`
- Metadata title: `Tiba — software pays a person, two checks agree first`
- Metadata description: `Software pays a person under rules you set. Two separate automated checks must agree before any money moves; if they disagree, Tiba refuses instead of guessing.`

#### `src/components/sigma-mark.tsx` (new)
```tsx
export function SigmaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 3H3l7 9-7 9h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
```

#### `src/components/wordmark.tsx` (new)
```tsx
import Link from "next/link";
import { SigmaMark } from "./sigma-mark";

export function Wordmark({ hero = false }: { hero?: boolean }) {
  return (
    <Link href="/" aria-label="Tiba home" className={hero ? "lockup" : "lockup"}>
      <SigmaMark className="lockup-mark" />
      <span className="lockup-word">Tiba</span>
    </Link>
  );
}
```

#### `src/components/site-nav.tsx`
- Wrap in `<nav className="border-b border-line"><div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">`.
- Left: `<Wordmark />`.
- Right link labels: `Payments` → `/intents`, `Jobs` → `/work-orders`, `People` → `/recipients`, `Rules & limits` → `/policies`, `History` → `/ledger`, `Console` → `/console`.
- Active: `text-foreground font-medium`; inactive: `text-muted hover:text-foreground` with the 180 ms transition.

#### `src/components/router-health-strip.tsx`
- `labelFor` returns title-case `Kimi` / `DeepSeek`.
- No calls: `Checks · none run yet`.
- Live: `Checks online · Kimi ● {ms} · DeepSeek ● {ms}` (separator `·`, not `|`; latencies wrapped in `<span className="num">`).
- Container: `sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface/95 px-4 py-2 text-xs font-medium text-muted backdrop-blur`.

#### `src/components/operator-token-field.tsx`
- Label: `Operator key`
- Add helper under input: `<span className="mt-1 block text-xs font-normal text-muted">Set by whoever runs this deployment. Kept in this tab only.</span>`
- `sessionStorage` key stays `tiba_operator_token`.

#### `src/app/console/types.ts` — required helpers
Add/overwrite these three exports. Keep the existing type exports unchanged.

```ts
export function decisionWord(decisionClass: string): string {
  if (decisionClass === "AMBER") return "HELD";
  if (decisionClass === "RED") return "REFUSED";
  return decisionClass;
}

export function decisionSentence(decisionClass: string): string {
  if (decisionClass === "PAID") return "Paid";
  if (decisionClass === "AMBER") return "Held — waiting for a human";
  if (decisionClass === "RED") return "Refused";
  return decisionClass;
}

export function explainDecision(decisionClass: string, reasonCode: string | null): string {
  if (decisionClass === "PAID") {
    return "Both checks agreed, the limits passed, and the test transfer completed.";
  }

  if (decisionClass === "AMBER") {
    switch (reasonCode) {
      case "HUMAN_REVIEW_REQUIRED": return "This amount is large enough that your rules require a human to decide.";
      case "INFERENCE_UNAVAILABLE": return "Neither check could run, so the payment is held for a human.";
      case "MISSING_PAYER_RECORD":
      case "MISSING_REQUIRED_CHANNEL": return "The payer's own record could not be read, so the payment is held for a human.";
      case "SCHEMA_INVALID": return "A check returned an unreadable answer, so the payment is held for a human.";
      case "REQUEST_REJECTED": return "The reading service turned the request away, so the payment is held for a human.";
      default: return "Held for a human.";
    }
  }

  if (reasonCode?.startsWith("QUORUM_SPLIT")) {
    if (reasonCode === "QUORUM_SPLIT:work_order_id") return "The two checks named different jobs, so Tiba refused.";
    if (reasonCode === "QUORUM_SPLIT:amount_micros") return "The two checks named different amounts, so Tiba refused.";
    if (reasonCode === "QUORUM_SPLIT:delivery_timestamp") return "The two checks gave different delivery dates, so Tiba refused.";
    return "The two checks disagreed, so Tiba refused.";
  }

  switch (reasonCode) {
    case "DAY_AMOUNT_CAP": return "This would take the program past its daily spending limit, so Tiba refused.";
    case "HOUR_AMOUNT_CAP": return "This would take the program past its hourly spending limit, so Tiba refused.";
    case "DAY_COUNT_CAP": return "The program has already made its maximum number of payments today, so Tiba refused.";
    case "HOUR_COUNT_CAP": return "The program has already made its maximum number of payments this hour, so Tiba refused.";
    case "TRANSACTION_CEILING": return "The amount is more than any single payment may be, so Tiba refused.";
    case "WORK_ORDER_CEILING": return "The amount is more than this job allows, so Tiba refused.";
    case "WORK_ORDER_EXPIRED": return "The job named has passed its deadline, so Tiba refused.";
    case "WORK_ORDER_NOT_OPEN": return "The job named is closed, so Tiba refused.";
    case "NO_OPEN_OBLIGATION": return "There is no open job matching this delivery note, so there was nothing to pay.";
    case "RECIPIENT_NOT_FOUND": return "This person is not on the approved list, so Tiba refused.";
    case "RECIPIENT_INACTIVE": return "This person is on the approved list but blocked, so Tiba refused.";
    case "RECIPIENT_UNVERIFIED": return "This person's identity has not been checked, and your rules require it, so Tiba refused.";
    case "KILL_SWITCH": return "The emergency stop is on, so every payment is refused before any check runs.";
    case "INVALID_AMOUNT": return "The amount in this request was not valid, so Tiba refused.";
    case "INVALID_TIMESTAMP": return "A date in this request was not valid, so Tiba refused.";
    case "SETTLEMENT_FAILED":
    case "SUI_EXECUTION_FAILED":
      return "Both checks agreed and the limits passed, but the transfer itself failed. No money moved.";
    default:
      return "Refused before any money moved.";
  }
}

export function humanError(code: string | null | undefined): { text: string; code: string } {
  const map: Record<string, string> = {
    UNAUTHORIZED: "Wrong operator key.",
    OPERATOR_TOKEN_NOT_SET: "Enter the operator key first.",
    OPERATOR_TOKEN_REQUIRED: "Enter the operator key first.",
    REQUEST_FAILED: "Something went wrong. Try again.",
    INVALID_REQUEST: "Something in the form is not valid.",
    NOT_FOUND: "Not found.",
    NOT_OVERRIDABLE: "This one cannot be approved by hand.",
    ALREADY_PAID: "Already paid.",
    RECIPIENT_NOT_FOUND: "That person is not on the approved list.",
    INVALID_PAYER_RECORD_JSON: "The payer record is not valid JSON.",
    INVALID_TIMESTAMP: "The date is not valid.",
    IDENTITY_PROVIDER_UNAVAILABLE: "The identity-check service is unavailable. Try again later.",
  };
  const c = code ?? "UNKNOWN";
  return { text: map[c] ?? `Something went wrong (${c}).`, code: c };
}

export function workOrderStatusWord(status: string): string {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  if (status === "expired") return "Expired";
  if (status === "discharged") return "Closed";
  return status;
}
```

#### `src/lib/adjudication-display.ts`
Overwrite the disagreement strings with Reader A/B wording:

```ts
export function disagreementLine(
  reasonCode: string | null,
  a: ChannelTuple,
  b: ChannelTuple
): string | null {
  if (!reasonCode?.startsWith("QUORUM_SPLIT")) return null;
  if (!a || !b) return "The two checks gave different answers, so Tiba refused.";
  return `Reader A (the delivery note) saw job ${a.workOrderId}, ${a.amount}. Reader B (the payer's record) saw job ${b.workOrderId}, ${b.amount}. They disagreed, so Tiba refused.`;
}
```

---

### 3.1 `/` — `src/app/page.tsx`

#### Visual edits
- Add `<SiteNav current="" />` above `<RouterHealthStrip />`.
- Change outer container to `max-w-5xl` and use `gap-12 md:gap-16`.
- Use `<h1 className="display-xl max-w-[20ch]">` with an `<em>` on “agree”.
- Delete the local `channelTuple` duplicate; import `channelTuple` and `disagreementLine` from `@/lib/adjudication-display`.
- Remove `text-accent`; the wordmark now lives in `SiteNav`.
- Marketing sections use `border-t border-line pt-12 mt-12`, not `.card`.
- All hero, “How it works”, attacker, honest-cost and policy paragraphs use `.lede` so marketing body text is ≥18 px.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Hero eyebrow | `Automated payments · test network` |
| Hero h1 | `Software pays a person. Two checks must <em>agree</em> first.` |
| Hero lede | `One automated check reads the delivery note. A separate automated check reads the payer's own record. Money moves only when both name the same job and the same amount. Anything else is refused or held for a human, and the receipt says why.` |
| Primary CTA | `Try a test payment` → `/console` (`.btn-primary`) |
| Secondary CTA | `See every decision` → `/ledger` (`.btn-secondary`) |
| Tertiary CTA | Remove the `/intents` button; it is reachable from the nav. |
| Proof strip eyebrow | `Measured on the test-network pilot` |
| Proof strip figures | `20 / 20 — honest notes paid`, `10 / 10 — tampered notes refused`, `0 — false refusals`, `~13 s — per decision` (all `.num .display-l`; labels `.eyebrow`) |
| “How it works” eyebrow | `How a payment gets checked` |
| Step 01 | `A program acting for the payer submits a delivery note for a job.` |
| Step 02 | `Two separate automated checks read it: one the delivery note, one the payer's own record. Neither sees the other's answer.` |
| Step 03 | `Same job and same amount from both: paid. Otherwise: refused or held for a human, and the receipt says why.` |
| Attacker line | `A forged note, an inflated amount, or a hidden instruction can change one check but not the other — so it does not go through.` |
| Honest-cost line | `If a check cannot run, the payment is held for a human. Tiba never fills the gap with a guess.` |
| Policy line | `Around both checks sit limits a human sets and an agent can only read: a per-payment ceiling, hourly and daily spending limits, an allowlist of who may be paid, and a kill switch.` |
| Real-example eyebrow | `A real example, from this pilot` |
| Refused card pill | `Refused` (`.pill-refused`) |
| Refused card body | `Reader A (the delivery note) saw job {wo}, {amt}. Reader B (the payer's record) saw job {wo}, {amt}. They disagreed, so Tiba refused.` (use `disagreementLine` from `@/lib/adjudication-display`) |
| Refused code line | `Reason code {reasonCode}` (`.num` `.text-xs` `.text-muted`) |
| Refused receipt link | `Open receipt →` (`.btn-ghost`) |
| Paid card pill | `Paid` (`.pill-paid`) |
| Paid card amount | `{amount} — test transfer, no real money moved` (amount `.num`) |
| Paid card transaction label | `Transaction` |
| Paid card transaction link | `View on test network` (`.link`) with `href={explorerUrl}` |
| Paid card receipt link | `Open receipt →` (`.btn-ghost`) |
| Paid check references label | `Check references` |
| Paid check references value | `A: {id} · B: {id}` (`.num .text-xs .text-muted`) |
| Paid empty | `No paid example yet. Send a test payment from the console.` |
| Footer | `Tiba · Test network only — no real money moves yet · source` (source uses `.link`) |

---

### 3.2 `/console` — `src/app/console/page.tsx` and `src/app/console/console-client.tsx`

#### Visual edits
- `page.tsx`: render `<SiteNav current="console" />` full-width above `<RouterHealthStrip />` in both the no-agent and full branches.
- `console-client.tsx`: delete the unused `TextField` function.
- Header uses `.display-l` and `.lede`.
- Test preset buttons are `.btn-secondary` with `aria-pressed={artifact === preset.body}` and the active style `aria-pressed:border-foreground aria-pressed:bg-foreground/5 aria-pressed:text-foreground`.
- Result pill uses `decisionWord(testResponse.decision)` and the matching `.pill-paid / .pill-held / .pill-refused` class.
- Held-queue rows lose the nested `.card`; use `divide-y divide-line` with `py-4` and `hover:bg-[rgba(20,22,26,.03)]`.
- Every error/message block shows `humanError(...).text` and then the raw code in `.num .text-xs .text-muted`.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| No-agent h1 | `Nothing is set up yet` |
| No-agent p | `This workspace has no paying program yet.` |
| Header eyebrow | `Console` |
| Header h1 | `Send a payment. Watch it decide.` |
| Header lede | `Pick a delivery note, send it, and see whether Tiba pays or refuses — and why.` |
| Operator-key label | `Operator key` |
| Operator-key helper | `Set by whoever runs this deployment. Kept in this tab only.` |
| Test panel h2 | `Send a test payment` (`.title`) |
| Recipient label | `Pay` |
| Preset 1 | `Honest note` |
| Preset 2 | `Note that tries to trick the check` |
| Preset 3 | `Inflated amount` |
| Preset 4 | `Unknown work order` |
| Preset helper | `The first should be paid. The other three should be refused. That is the point.` |
| Textarea label | `Delivery note` |
| Submit idle | `Send test payment` (`.btn-primary`) |
| Submit busy | `Checking… usually about 13 seconds, up to a minute` |
| Disabled helper | `Enter the operator key above to send.` |
| Result pill | `Paid` / `Held` / `Refused` |
| Result sentence | `{explainDecision(testResponse.decision, testResponse.reasonCode ?? null)}` |
| Result code line | `Reason code {reasonCode}` (`.num .text-xs .text-muted`) |
| Result links | `View transaction` → `explorerUrl`; `Open receipt` → `/r/{publicToken}`; `See in history` → `/ledger` (all `.btn-ghost`) |
| Success banner | `Sent. Result below.` |
| Agent-tools eyebrow | `What an AI assistant may do here (WebMCP)` |
| Agent-tools checking | `Checking this browser…` |
| Agent-tools supported | `In this browser an AI assistant can do {n} things on this page.` |
| Agent-tools unsupported | `This browser cannot let AI assistants act here. Everything still works for you.` |
| Tools table headers | `Action`, `Allowed`, `Needs`, `Can never` |
| Tool row 1 | `List jobs` / `Yes` / `Nothing (look only)` / `—` |
| Tool row 2 | `List people` / `Yes` / `Nothing` / `—` |
| Tool row 3 | `Read spending limits` / `Yes` / `Nothing` / `—` |
| Tool row 4 | `Ask to pay someone` / `Yes` / `Operator key` / `Cannot turn a refusal into a payment` |
| Tool row 5 | `Read the last decision` / `Yes` / `Nothing` / `—` |
| Tool row 6 | `Read history` / `Yes` / `Operator key` / `Cannot change what happened` |
| Disallowed row 1 | `Approve a payment by hand` / `No` / `—` / `Not even a human can pick a side when the checks disagree` |
| Disallowed row 2 | `Change a limit or the approved list` / `No` / `—` / `Only a human with the operator key` |
| Disallowed row 3 | `Turn the emergency stop on or off` / `No` / `—` / `Only a human with the operator key` |
| Recent calls eyebrow | `Recent AI actions` |
| Recent calls empty | `None yet.` |
| Budget card h2 | `{agentName}` (`.title`) |
| Budget card sub | `Daily limit {capDay}` (`.num`) |
| Meter labels | `Today`, `This hour` |
| Kill-switch card eyebrow | `Kill switch` |
| Kill-switch ON | `ON — refusing everything` (`.num .display-l .text-red-ink`) |
| Kill-switch OFF | `OFF` (`.num .display-l`) |
| Kill-switch button OFF | `Stop all payments` (`.btn-secondary`) |
| Kill-switch button ON | `Allow payments again` (`.btn-secondary`) |
| Kill-switch sub-line | `While on, every payment is refused before any check runs.` |
| Jobs panel h2 | `Jobs` (`.title`) |
| Jobs panel count | `{n} open work orders.` |
| Jobs panel link | `Manage work orders →` (`.btn-ghost`) |
| People panel h2 | `People` (`.title`) |
| People panel count | `{n} people may be paid.` |
| People panel link | `Manage people →` (`.btn-ghost`) |
| Held queue h2 | `Waiting for a human` (`.title`) |
| Held queue empty | `Nothing waiting.` |
| Held row id | `{id}` (`.num .text-xs .text-muted`) |
| Held row amount | `{recipientName} · {amount}` (amount `.num`) |
| Held row meta | `{decisionWord} · {explainDecision sentence} · {createdAt}` |
| Held row code | `Reason code {reasonCode}` (`.num .text-xs .text-muted`) |
| Held row button | `Approve by hand` (`.btn-secondary`) |
| Generic success | `Saved.` |

---

### 3.3 `/work-orders` — `src/app/work-orders/page.tsx` and `src/app/work-orders/work-orders-client.tsx`

#### Visual edits
- `page.tsx`: wrap output in `<main>` and render `<SiteNav current="work-orders" />` and `<RouterHealthStrip />` before `<WorkOrdersClient />`. Remove `<SiteNav>` from `work-orders-client.tsx`.
- Header h1 `.display-l`; sub-line `.lede`.
- Table columns: `Job ID`, `Paid to`, `Maximum`, `Open until`, `Status`.
- `ceiling` cells get `.num .text-right`.
- Status values rendered by `workOrderStatusWord(status)`.
- Form uses `.title` headings and `.btn-primary` for submit.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Header eyebrow | `Jobs` |
| Header h1 | `What the program may pay for` |
| Header lede | `Every job that is still open for payment. Adding one here pays nobody. It only makes a payment possible.` |
| Table h2 | `Open jobs` (`.title`) |
| Table empty | `No jobs yet. Add the first one below.` |
| Table columns | `Job ID`, `Paid to`, `Maximum`, `Open until`, `Status` |
| Status values | `Open`, `Closed`, `Expired` |
| Form h2 | `Add a job` (`.title`) |
| Field: ref | `Job ID (e.g. WO-14)` |
| Field: recipient | `Paid to` |
| Field: ceiling | `Maximum payment (USDC)` |
| Field: expiry | `Open until` |
| Field: required channels | `Who must confirm before paying` |
| Select option 1 | `The payer's record only` (value `payer_record`) |
| Select option 2 | `Both checks` (value `both`) |
| Select option 3 | `A human` (value `human`) |
| Field: brief | `What the job is` |
| Field: payer record JSON | `The payer's own record of this job (JSON)` |
| Payer-record helper | `Amounts are in millionths: 180000000 means 180 USDC` |
| Submit idle | `Add job` (`.btn-primary`) |
| Submit busy | `Adding…` |
| Success | `Job added.` |

---

### 3.4 `/recipients` — `src/app/recipients/page.tsx` and `src/app/recipients/recipients-client.tsx`

#### Visual edits
- `page.tsx`: wrap output in `<main>` and render `<SiteNav current="recipients" />` and `<RouterHealthStrip />` before `<RecipientsClient />`. Remove `<SiteNav>` from the client component.
- Header h1 `.display-l`; sub-line `.lede`.
- KYC pills use the new text and existing `.pill-*` classes.
- `ref` and `suiAddress` get `.num .break-all .text-xs`.
- Form submit is the only `.btn-primary` on the page.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Header eyebrow | `People` |
| Header h1 | `Who the program may pay` |
| Header lede | `The approved list. The program cannot pay anyone who is not on it.` |
| List h2 | `Approved people` (`.title`) |
| List empty | `Nobody yet. Add the first person below.` |
| Active flag | `can be paid` / `blocked` |
| Ref prefix | `ID {ref}` (`.num .text-xs .text-muted`) |
| Wallet prefix | `Wallet {suiAddress}` (`.num .break-all .text-xs`) |
| KYC pill `verified` | `Identity checked` (`.pill-paid`) |
| KYC pill `failed` | `Identity check failed` (`.pill-refused`) |
| KYC pill other | `Identity not checked` (`.pill-held`) |
| KYC meta provider | `checked by {provider}` |
| KYC meta no check | `no identity check yet` |
| KYC expiry | `valid until {date}` |
| Verify button | `Run identity check` (`.btn-secondary`) |
| Verify busy | `Checking…` |
| Form h2 | `Add a person` (`.title`) |
| Field: ref | `Short ID (e.g. translator-kl)` |
| Field: display name | `Name` |
| Field: sui address | `Wallet address (test network)` |
| Submit idle | `Add person` (`.btn-primary`) |
| Submit busy | `Adding…` |
| Success add | `Person added.` |
| Success verify | `Identity check done.` |

---

### 3.5 `/intents` — `src/app/intents/page.tsx`

#### Visual edits
- Header h1 `.display-l`; sub-line `.lede`.
- Refactor the four copy-pasted sections into one `IntentGroup` component using `divide-y divide-line` and `px-5 py-4 hover:bg-[rgba(20,22,26,.03)]` rows inside a single `.card`.
- Amounts `.num`.
- Recipient ref: `ID {ref}` `.num .text-xs .text-muted`.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Header eyebrow | `Payment attempts` |
| Header h1 | `Every payment, start to finish` |
| Header lede | `Every payment the program has tried to make, grouped by what happened. Open one to read its receipt.` |
| Section 1 | `Paid ({paidIntents.length})` |
| Section 2 | `Refused ({refusedIntents.length})` |
| Section 3 | `Approved but the transfer failed ({settlementFailedIntents.length})` |
| Section 4 | `Waiting for a human ({heldIntents.length})` |
| Empty for each | `None yet.` |
| Row recipient ref | `ID {ref}` |
| Row amount | `.num` |
| Row reason | `explainDecision(...)` |
| Row time | `formatTime(...)` |

---

### 3.6 `/ledger` — `src/app/ledger/page.tsx`

#### Visual edits
- Header h1 `.display-l`; sub-line `.lede`.
- Replace `<details>` with a direct `.btn-ghost` link `Receipt →` in the `Transaction` cell.
- Amount column `text-right .num`.
- “Why” cell: sentence in sans `.text-sm`, reason code below in `.num .text-xs .text-muted`, then the Reader A/B disagreement lines from `renderAdjudicationDetails`.
- Request-IDs cell: `A {id}` / `B {id}` `.num`.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Header eyebrow | `History` |
| Header h1 | `Every decision` |
| Table columns | `Result`, `When`, `Paid to`, `Amount`, `Why`, `Check references`, `Transaction` |
| Why cell fallback | `no reason recorded` |
| Check refs cell | `A {id}` / `B {id}` |
| Transaction empty | `—` |
| Transaction link text | `{digest}` (`.link`, still links to Sui explorer) |
| Receipt link | `Receipt →` (`.btn-ghost`) |
| Empty state | `Nothing yet. Send a test payment from the console and it will appear here.` |

---

### 3.7 `/policies` — `src/app/policies/page.tsx`, `kill-switch-button.tsx`, `identity-gate-button.tsx`

#### Visual edits
- Header h1 `.display-l`; sub-line `.lede`.
- All four cards in a `grid gap-4 lg:grid-cols-2 xl:grid-cols-4`.
- Card headings `.title`.
- Large state figures `.num .display-l`.
- `Allowlist` card figure: `{active} of {total} may be paid`.
- Kill-switch button `.btn-secondary` in both states.
- Identity-gate button `.btn-secondary` in both states.

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| No-agent h1 | `Nothing is set up yet` |
| No-agent p | `This workspace has no paying program yet.` |
| Header eyebrow | `Rules & limits` |
| Header h1 | `Limits the program cannot get past` |
| Header lede | `Spending limits, the approved list, the emergency stop and the identity check. The program can read them. Only a human can change them.` |
| Spending card h2 | `Spending limits` (`.title`) |
| Meter labels | `Today`, `This hour` |
| Approved-people h2 | `Approved people` (`.title`) |
| Approved-people figure | `{active} of {total} may be paid` (`.num .display-l`) |
| Approved-people link | `Manage people →` (`.btn-ghost`) |
| Kill-switch card h2 | `Kill switch` (`.title`) |
| Kill-switch ON | `ON — all payments refused` (`.num .display-l .text-red-ink`) |
| Kill-switch OFF | `OFF` (`.num .display-l`) |
| Kill-switch button OFF | `Stop all payments` (`.btn-secondary`) |
| Kill-switch button ON | `Allow payments again` (`.btn-secondary`) |
| Kill-switch sub-line | `While on, every payment is refused before any check runs.` |
| Kill-switch console note | `You can also do this from the console.` (`.link` to `/console`) |
| Identity card h2 | `Identity check before paying` (`.title`) |
| Identity state yes | `Required` |
| Identity state no | `Not required` |
| Identity helper | `When required, anyone without a current identity check is refused before the checks even run.` |
| Identity button OFF | `Require identity check` (`.btn-secondary`) |
| Identity button ON | `Stop requiring identity check` (`.btn-secondary`) |
| Identity console note | `Uses the operator key typed in the Kill switch box. See who is checked under People.` |
| Button busy | `Saving…` |
| Success | `Saved.` |
| Missing-token error | `Enter the operator key first.` |

#### Button component notes
In `kill-switch-button.tsx` and `identity-gate-button.tsx`:
- Replace `setError(...)` and `setMessage(...)` with `humanError(...).text`.
- Show the raw code below the message in `.num .text-xs .text-muted`.

---

### 3.8 `/r/[token]` — `src/app/r/[token]/page.tsx` and `src/components/denial-banner.tsx`

#### Visual edits
- Header eyebrow normal; h1 `.display-l` for the decision sentence; no sub-line.
- Amount card value `.num .text-2xl` with a `<span className="text-sm text-muted">USDC</span>`.
- Fact cards use `.card` and `.title` for labels.
- Pipeline table uses `.title` for the heading and `border-line` rows.
- In `getPolicyStatus`, add `RECIPIENT_UNVERIFIED`, `INVALID_AMOUNT`, and `INVALID_TIMESTAMP` to `policyRefusalCodes` so these rows show `Blocked` under `Your rules`.

#### `src/components/denial-banner.tsx`
Replace entirely:

```tsx
import { explainDecision } from "@/app/console/types";

export function DenialBanner({
  decisionClass,
  reasonCode,
}: {
  decisionClass: string;
  reasonCode: string | null;
}) {
  const isHeld = decisionClass === "AMBER";
  if (decisionClass === "PAID") return null;

  return (
    <div
      className={[
        "rounded-lg border p-5",
        isHeld
          ? "border-[var(--held)]/20 bg-[var(--held-bg)] text-[var(--held)]"
          : "border-[var(--refused)]/20 bg-[var(--refused-bg)] text-[var(--refused)]",
      ].join(" ")}
    >
      <p className="eyebrow" style={{ color: "inherit" }}>
        {isHeld ? "Held — waiting for a human" : "Refused — Tiba decided not to pay"}
      </p>
      <p className="display-m mt-2" style={{ color: "var(--foreground)" }}>
        {explainDecision(decisionClass, reasonCode)}
      </p>
      <p className="num mt-3 text-xs opacity-70">
        Reason code {reasonCode ?? "none recorded"}
      </p>
    </div>
  );
}
```

#### Copy changes

| Element | Exact new text |
|---------|----------------|
| Eyebrow | `Receipt — anyone with this link can read it` |
| h1 | `{decisionSentence(intent.decisionClass)}` (`.display-l`) |
| Amount label (paid) | `Amount` |
| Amount label (others) | `Amount asked for` |
| Amount value | `{microsToUsdc(amountMicros)} <span className="text-sm text-muted">USDC</span>` (`.num .text-2xl`) |
| Fact 1 label | `Paid to` (if paid) / `Would have paid` (otherwise) |
| Fact 1 value | `{displayName}` with detail `ID {ref}` (`.num`) |
| Fact 2 label | `Why` |
| Fact 2 value | `{explainDecision(...)}` |
| Fact 2 detail | `Reason code {reasonCode}` (`.num .text-xs .text-muted`) |
| Fact 3 label | `Left to spend today (live)` |
| Fact 3 value | `{remainingBudget}` (`.num`) |
| Fact 3 helper | `right now, not at the time of this receipt` |
| Pipeline h2 | `How this decision was made` (`.title`) |
| Table headers | `Step`, `Result`, `Detail` |
| Channel A row | `Reader A — read the delivery note` |
| Channel B row | `Reader B — read the payer's own record` |
| Match result | `Same answer` / `Different answer` / `Not run` |
| Channel detail model | `Model used: {model}` |
| Channel detail fallback | `The reading service (Gonka) swapped in a different model for this reader: {fallback}` |
| Channel detail ref label | `Reference (Gonka request ID): {id}` |
| Channel detail latency | `Took: {ms}` |
| Channel detail not run | `This reader was not run.` |
| Agreement row | `Did the readers agree?` |
| Agreement result | `Yes` / `No` / `Not run` |
| Policy row | `Your rules` |
| Policy result | `Passed` / `Blocked` |
| Identity row | `Identity check` |
| Identity statuses | `Not required` / `Blocked` / `Never reached` / `Passed` / `Not checked` |
| Identity detail | `Identity {kycStatus}, checked by {provider}` |
| Settlement row | `Money sent?` |
| Settlement result | `Yes` / `Tried and failed` / `Not tried` |
| Settlement empty | `No transfer happened, so there is no transaction record.` |
| Settlement link | `{digest} — view on Sui test network` (`.link`; Gonka/Sui allowed on receipt) |
| GNK card h2 | `Reader cost basis (GNK/USD)` |
| GNK rate | `${rate} at {time}` |
| GNK price empty | `price not available` |
| formatTime null | `time unknown` |
| Bottom button | `See all payments →` (`.btn-ghost`) |

---

## 4. Σ lockup rules

1. **The mark is an SVG**, not the `Σ` text glyph, because `Instrument Serif` does not ship a Greek subset and would fall back to a different face [spec1, spec2].
2. **Geometry:** `viewBox="0 0 20 24"`, path `M18 3H3l7 9-7 9h15`, `stroke-width="2"` (1/12 of height), `stroke-linecap="square"`, `stroke-linejoin="miter"`, `fill="none"`, `stroke="currentColor"`. Straight strokes, hard corners, no curves.
3. **Lockup colours:** sigma mark in `--action` (cobalt), word “Tiba” in `--foreground` (ink), set in `Instrument Serif` 400.
4. **Sizes:** nav lockup `1.5rem`; mark height `0.72em` of the word cap height; clear space at least one mark-width on all sides.
5. **Placement:** nav only, left side, linking to `/`. The landing hero h1 is the sentence, not a repeated wordmark. Optionally one large watermark behind the hero (`clamp(12rem, 30vw, 20rem)` sigma in ink at `0.06` opacity, `aria-hidden`) if the desktop layout feels empty.
6. **Never:** rotate, outline, gradient, drop-shadow, animate, recolour the mark to green/amber/red, place it on a cobalt background, or set the wordmark in Inter.

---

## 5. What must NOT change

- The mechanism and claims are fixed: two isolated verification channels must agree on `{work_order_id, amount}`; disagreement = refusal; fail-closed policy (ceiling, hourly/daily caps, allowlist, kill switch, idempotency); Sui testnet settlement; public receipts carrying both Gonka request IDs.
- The four demo artifacts and `WO-13` must remain byte-identical in `console-client.tsx`.
- Tokens `bone #FBFAF7`, `ink #14161A`, `paid #1F6B4A`, `refused #7A2E2E`, `held #8A5E12` and the three fonts `Instrument Serif`, `Inter`, `JetBrains Mono` stay.
- `sessionStorage` key `tiba_operator_token` stays. API payload keys and route paths stay.
- No new dependencies. All styling comes from `globals.css` and Tailwind v4.
- The public-product rule: no hackathon, sponsor, team or vendor names on `/`, `/console`, `/ledger`, `/work-orders`, `/policies`. This includes `Rizqey Labs`. `Gonka`/`GonkaRouter` and `Sui` appear only on the receipt (`/r/[token]`) and in `README.md`.

---

## 6. Verification checklist

Before the PR is merged:

1. `npx tsc --noEmit` passes.
2. `npm test` passes (25 tests).
3. `npm run build` passes.
4. Preview deploy to Vercel and screenshot `/`, `/console`, `/work-orders`, `/recipients`, `/intents`, `/ledger`, `/policies`, and at least one `/r/{token}` receipt.
5. Open `/console`, enter the operator key, run the four presets in order, and confirm:
   - 1st pays `WO-13`.
   - 2nd, 3rd, 4th are refused.
   - The refusal receipt shows the reason sentence, the reason code, both Gonka request IDs, the fallback line (if a model swap happened), and the Sui digest field.
6. String assertions for the public-product rule on `/`, `/console`, `/ledger`, `/work-orders`, `/policies`:
   - No `Gonka`, `GonkaRouter`, `Sui`, `Rizqey`, hackathon names, sponsor names, or team/vendor names in rendered text or link labels.
   - (URLs may still contain `gonkarouter.io` or `suiscan.xyz`; only visible text/link labels are restricted.)
7. Visual assertions:
   - Body text on marketing pages is ≥ 18 px (`1.125rem`).
   - At most one `.btn-primary` per route.
   - No `.pill-paid`, `.pill-held`, `.pill-refused` used on buttons.
   - The receipt decision headline is ≥ `var(--display-l)` and the `Paid`/`Refused`/`Held` pill is large enough to read from 8 m on a projector.

---

## File path

`C:/Users/diony/dev/tiba/docs/REDESIGN_SPEC.md`

## 10-line summary of key decisions

1. Action colour: cobalt `#2D4FC7` (`--action`) with white text, hover `#2542A8`, pressed `#1E3689`; chosen for 6.59:1 contrast on bone and clear separation from paid green and refused red [06_result6.json].
2. Q5 council fix first: `--refused-bg` becomes `#F2E4E4` so all three outcome pills share the tinted-bg + dark-text pattern [08_council_verdict.txt].
3. New hero line: `Software pays a person. Two checks must <em>agree</em> first.` with a proof strip of the four measured numbers immediately below it.
4. Biggest copy changes: `Operator token` → `Operator key`; `Payout intents/Work orders/Recipients/Ledger` → `Payments/Jobs/People/History`; every refusal now shows a human sentence with the raw reason code as a small mono footnote.
5. Three button levels: `.btn-primary` (cobalt, one per page), `.btn-secondary` (outlined), `.btn-ghost` (neutral underlined); the action colour only touches primary buttons and the Σ mark; outcome colours never touch buttons.
6. Σ lockup is an SVG in cobalt with “Tiba” in Instrument Serif; no Σ glyph, no gradients/animation.
7. `explainDecision` is expanded to a full per-code map with Reader A/B split sentences for `QUORUM_SPLIT` sub-codes.
8. Marketing pages use `.lede` (min 1.125rem) and `display-xl`/`display-l` for projector readability; no vendor names on `/`, `/console`, `/ledger`, `/work-orders`, `/policies`.
9. Receipt (`/r/[token]`) keeps `Gonka`/`Sui` references and both request IDs; all other public surfaces drop them.
10. Verification: `tsc --noEmit`, `npm test` (25), `npm run build`, preview screenshots, and string assertions for the public-product rule.
