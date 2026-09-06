# YC Study — what money products do, and what Tiba does next

Source dossiers: `scratchpad/yc/{arbital,mercury,ramp,slash,sphere,jeeves,discover-agent-payments,discover-payouts,discover-stablecoin-wallet,discover-consumer-wallet-ux}.md`. Cited inline as `[file]`. Decisions only.

---

## 1. What the category calls itself

Nouns the incumbents use for themselves:

- **banking** — Mercury `[mercury.md]`, Slash `[slash.md]`
- **spend management / spend / control** — Ramp `[ramp.md]`, Jeeves "financial operating system… Control is the new prestige" `[jeeves.md]`
- **payouts** — Dots `[discover-payouts.md]`, Consul `[discover-stablecoin-wallet.md]`
- **payments / transfers** — Sphere `[sphere.md]`
- **account** — Wise; "wallet" never appears `[discover-consumer-wallet-ux.md]`
- **trading terminal / one app** — Arbital `[arbital.md]`
- **allowance** — Allowance, the only agent-native one: "a bounded permission: amount cap + merchant lock + expiry + revoke" `[discover-agent-payments.md]`

"Wallet" is used by zero incumbents for themselves. It appears only for the *recipient's* side (Consul, Dots) `[discover-stablecoin-wallet.md] [discover-payouts.md]`. It says custody, not control.

**Decision: Tiba is "spend control for AI agents".** One-liner: *"Spend control for AI agents. Two checks agree, or nothing moves."*

Why: every incumbent that judges respect sells **control**, not storage (Ramp: "Build control into the card, before spend even happens" `[ramp.md]`; Allowance: "The spend control layer for AI agents" `[discover-agent-payments.md]`). Tiba's feature is refusing to pay `[DESIGN.md]`; "wallet" hides that. "Allowance" is taken. "Spend control" is the noun the category already pays for, and it makes the limits screen the product instead of a settings footnote — the exact trap Consul and Sphere fall into `[discover-stablecoin-wallet.md] [sphere.md]`.

Drop "a wallet for AI agents" from the hero, OG image, README, deck.

---

## 2. The first screen

Every good money product's home is the same three things:

- **Primary number**: a balance or a remaining-limit. Wise: currency balance cards `[discover-consumer-wallet-ux.md]`. Dots/Consul: wallet balance `[discover-payouts.md] [discover-stablecoin-wallet.md]`. Ramp: remaining on the fund `[ramp.md]`. Jeeves: total available balance `[jeeves.md]`.
- **Primary object**: the thing money flows through — accounts (Mercury), fund (Ramp), one pending approval (Allowance) `[mercury.md] [ramp.md] [discover-agent-payments.md]`.
- **Primary action**: one verb, top right. "Move Money → Send" (Mercury, Slash), "Send" (Wise), "Request spend" (Ramp) `[mercury.md] [slash.md] [discover-consumer-wallet-ux.md] [ramp.md]`.
- Below it: recent activity on the same screen (Wise, Ramp "recent activity", Slash "transactions table on home") `[discover-consumer-wallet-ux.md] [ramp.md] [slash.md]`.
- A "needs your attention" strip when something is pending (Mercury Action Bar, Ramp Inbox, Jeeves Needs Attention) `[mercury.md] [ramp.md] [jeeves.md]`.

**Decision: Tiba's `/` becomes Home.** Contents, in order:

1. **Spendable today** — the hero number: `min(balance, daily limit − spent today)`. Label exactly "Spendable today". Balance is secondary text under it. (Consul's "agent can still spend this period", Ramp's remaining/limit as hero `[discover-stablecoin-wallet.md] [ramp.md]`.)
2. **Today vs limits** — two thin meters: per-day and per-invoice, as sentences: "$40 of $100 today" / "Max $25 per invoice". (Jeeves amount+interval `[jeeves.md]`.)
3. **Attention strip** — only when something is Awaiting 2nd check or Refused unread. Otherwise absent, not empty. `[mercury.md]`
4. **Last 5 activity rows** — recipient · amount · status word · time. Link "All activity → /ledger".
5. **One primary button: "Send"** — the only filled `--action` element on the page. `[ramp.md]` yellow-only-on-money rule.

### 390px

```
┌──────────────────────────────────────┐
│ Tiba                          ⚙  ◉   │
├──────────────────────────────────────┤
│ SPENDABLE TODAY                      │
│ $60.00                               │
│ Balance $412.10 · resets 00:00 UTC   │
│                                      │
│ Today   ▓▓▓▓░░░░░░  $40 of $100      │
│ Invoice max $25                      │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 1 payment awaiting 2nd check  →  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ RECENT                    All →      │
│ ─────────────────────────────────────│
│ Helius RPC        $12.00   Paid  2m  │
│ Openrouter        $25.00   Paid  1h  │
│ Datalake Co       $40.00 Refused 3h  │
│ Helius RPC        $12.00   Paid  1d  │
│ Pinata            $ 3.00   Paid  1d  │
│                                      │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │             Send                 │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ Home   Activity  Invoices  Limits  ⋯ │
└──────────────────────────────────────┘
```

### 1440px

```
┌──────────┬───────────────────────────────────────────────────────────────────────┐
│ Tiba     │                                                       [ Send ]  ◉     │
│          ├───────────────────────────────────────────────────────────────────────┤
│ Home   ● │  SPENDABLE TODAY                        TODAY                          │
│ Send     │  $60.00                                 ▓▓▓▓▓▓░░░░░░░░  $40 of $100    │
│ Activity │  Balance $412.10 · resets 00:00 UTC     Per invoice      max $25       │
│ Invoices │                                         Recipients       4 verified    │
│ Recipients│                                                                       │
│ Limits   │  ┌─────────────────────────────────────────────────────────────────┐   │
│ Payments │  │ 1 payment awaiting 2nd check — Datalake Co $40.00           →   │   │
│          │  └─────────────────────────────────────────────────────────────────┘   │
│          │                                                                        │
│          │  RECENT                                                   All →        │
│          │  ──────────────────────────────────────────────────────────────────    │
│          │  2m    Helius RPC      INV-0412   $12.00   Paid       receipt ↗        │
│          │  1h    Openrouter      INV-0411   $25.00   Paid       receipt ↗        │
│          │  3h    Datalake Co     INV-0410   $40.00   Refused    over limit       │
│          │  1d    Helius RPC      INV-0409   $12.00   Paid       receipt ↗        │
│          │  1d    Pinata          INV-0408   $ 3.00   Paid       receipt ↗        │
│ ⚙        │                                                                        │
└──────────┴───────────────────────────────────────────────────────────────────────┘
```

No cards around the number. Rules, not boxes (Arbital hairline panels, Mercury rules-for-rows `[arbital.md] [mercury.md]`).

---

## 3. Information architecture

Incumbent nav is 4–7 items and every item is a noun (Wise: Home · Card · Recipients · More; Ramp: Home · Cards and funds · Expenses · Inbox; Mercury: Accounts · Payments · Cards · Transactions `[discover-consumer-wallet-ux.md] [ramp.md] [mercury.md]`). Ramp's dossier draws the line for Tiba: "Beyond Home / Agents / Activity / Limits is overreach" `[ramp.md]`.

**Decision — six items, this order, these labels:**

| # | Label | Route | What it is |
|---|---|---|---|
| 1 | Home | `/` | Section 2 |
| 2 | Send | `/console` | The Send flow (Section 4). Agent-tool console moves behind an "Advanced" disclosure on this page `[slash.md]` |
| 3 | Activity | `/ledger` | One feed, all states incl. refused `[discover-consumer-wallet-ux.md]` |
| 4 | Invoices | `/work-orders` | Rename. "Work order" is internal vocabulary; every incumbent says invoice/bill `[mercury.md] [ramp.md] [jeeves.md]` |
| 5 | Recipients | `/recipients` | First-class verified objects `[sphere.md]` |
| 6 | Limits | `/policies` | Rename. "Policy" is Slash/Ramp admin-speak; the owner sets limits `[jeeves.md]` |

Mobile bottom bar: Home · Activity · Invoices · Limits · ⋯ (More = Send is the button, Recipients + Payments under ⋯). Wise pattern `[discover-consumer-wallet-ux.md]`.

**Merge / disappear:**

- `/intents` (Payments) → **merge into `/ledger`** as a state filter. Mercury's Payments tabs are states of one list: Inbox / Needs Approval / Scheduled / Paid `[mercury.md]`. Tiba's are Proposed · Awaiting 2nd check · Paid · Refused. An "intent" is a payment before it's paid; one list, one filter chip row. Keep `/intents` as a redirect to `/ledger?state=pending`.
- `/console` stops being a JSON terminal. It becomes the Send page. JSON/tool console → "Advanced" accordion at the bottom `[slash.md] [discover-agent-payments.md]`.
- `/r/[token]` stays (public receipt). Not in nav; reached from Activity rows and the Send result.
- `/a2a` is an API route, invisible.
- Kill switch and identity gate (currently `/policies` buttons) stay on Limits as the top row: a single **Lock** toggle with a red banner across every page when locked `[ramp.md]`.

---

## 4. The Send flow

Every incumbent: recipient → amount/method → details → review → confirm, with approval surfaced *during* creation, not after (Mercury "You'll be notified during the payment creation stage" `[mercury.md]`; Slash 6 steps `[slash.md]`; Wise 5 steps ending "Continue and Send" `[discover-consumer-wallet-ux.md]`).

**Decision — five steps, one screen each on mobile, one two-column page on desktop (form left, live review right):**

**Step 1 — Recipient.** Search + list of verified recipients; each row shows name, verified badge, last paid, receipt count (Arbital trust block, Jeeves hover-card `[arbital.md] [jeeves.md]`). Unverified recipients render disabled with "Verify first" `[sphere.md]`. "+ Add recipient" at the bottom.

**Step 2 — Invoice.** List of that recipient's open invoices: reference, amount, due. Selecting one fills the amount; amount is read-only (an agent pays an invoice, it doesn't invent a number). Show against limits inline: "$40.00 · over your $25 per-invoice max" in `--held` if it will need the owner. Ramp "prevent > $500 on any transaction" stated *before* the send `[ramp.md]`.

**Step 3 — Delivery note.** One optional text field, "Note (optional)" — Slash "Add a Memo", Mercury "Details" `[slash.md] [mercury.md]`. Nothing else.

**Step 4 — Review.** A statement, not a form:

```
Pay Helius RPC $12.00 for INV-0412.
Within limits: $12.00 ≤ $25 per invoice · $52 of $100 today after this.
Two independent checks must agree before a coin moves.
[ Continue and Send ]
```
The sentence under the button is Allowance's "An agent can prepare… It cannot approve it" rewritten for Tiba `[discover-agent-payments.md]`. Button label is Wise's `[discover-consumer-wallet-ux.md]`.

**Step 5 — Result.** One page, three possible outcomes, all rendered as first-class, none as an error modal:

```
Both checks agreed — sent.               PAID   (green)
Check A  ✓ amount matches invoice
Check B  ✓ recipient verified, within limits
$12.00 → Helius RPC · INV-0412 · 14:02 UTC
Receipt  tiba.app/r/9f3k…   [copy] [open ↗]
Reference TB-0412-9F3K
[ Done ]   [ Send another ]
```

```
Checks disagreed — refused. Nothing moved.   REFUSED  (--refused, not error red)
Check A  ✓ amount matches invoice
Check B  ✗ $40.00 exceeds $25 per-invoice max
Nothing was sent. Balance unchanged: $412.10.
What next: raise the per-invoice limit → Limits, or split the invoice.
Receipt  tiba.app/r/…   [copy]
[ Done ]
```

```
Waiting for second check.                    HELD   (amber)
Check A  ✓ · Check B  pending
We'll show this in Activity as soon as it resolves.
[ Back to Home ]
```

Rules for the result:
- Two checks are two rows with ✓/✗ and a one-clause reason each — Slash `approvalReason`/`declineReason` on every row `[slash.md]`.
- Refusal copy always ends with what happens next and states nothing moved — Sphere's failure pattern, Mercury code+cause+fix `[sphere.md] [mercury.md]`.
- Refusals get a receipt too. The refusal is the product; it must be linkable.
- Human reference code on every result (Jeeves "JPP…" `[jeeves.md]`) + idempotency key printed on the receipt page (Dots `[discover-payouts.md]`).
- The receipt link appears on the result page (step 5), on the Activity row, and on the `/r/[token]` page itself with copy on every field `[sphere.md]`.

---

## 5. Recipients, Limits, Activity

### Recipients

Incumbent pattern: a verified first-class object, saved once, picked by search; verification badge gates payment; show name + masked details, never raw addresses; archive never delete (Sphere, Jeeves, Dots, Consul, Wise `[sphere.md] [jeeves.md] [discover-payouts.md] [discover-stablecoin-wallet.md] [discover-consumer-wallet-ux.md]`).

Tiba spec:
- **Fields:** Name (required) · Address (shown truncated `7Gh4…k9Qp` + copy) · Per-recipient cap (optional, "up to $N per invoice") · Note.
- **Statuses:** `Unverified` (grey chip, cannot be paid) · `Verified` (green chip; how: address ownership check or first successful two-check payment) · `Archived` (badge, hidden from Send, history kept `[jeeves.md]`).
- **Row:** Name · Verified · Last paid · Receipts count · cap. Hover/tap → panel with created/updated, last 3 payments `[jeeves.md]`.
- **Empty state:** "No recipients yet. Your agent can only pay recipients you add here." + "Add recipient".
- **Wording:** Slash's sentence per row: "Agent may pay Helius RPC up to $25 per invoice" `[slash.md]`.

### Limits

Incumbent pattern: amount + interval (Daily/Weekly/Monthly/Lifetime) with explicit reset, single-transaction cap, a lock toggle, approvals as a sentence, closed defaults (Jeeves, Ramp, Mercury, Wise `[jeeves.md] [ramp.md] [mercury.md] [discover-consumer-wallet-ux.md]`). Anti-pattern: Slash's default "auto-approve all outgoing transfers" `[slash.md]`.

Tiba spec — one page, four rows, no JSON:
1. **Lock** — toggle. "Locked: every payment is refused until you unlock." Red banner site-wide when on `[ramp.md]`. Replaces the kill-switch button.
2. **Per invoice** — "$ [25.00] max per invoice." Over-limit sentence shown beneath, verbatim style of Jeeves: "Above this, the payment is refused and shown in Activity" `[jeeves.md]`.
3. **Per day** — "$ [100.00] per day · resets 00:00 UTC" `[jeeves.md]`.
4. **Two checks** — fixed, not a toggle: "Two independent checks must agree before any payment. The agent cannot approve its own payment." Wise wording `[discover-consumer-wallet-ux.md]`. Rendered as a rule, not a control, so judges see it cannot be turned off `[slash.md]`.
- **History** tab below: who changed what, when (Jeeves per-object History `[jeeves.md]`).
- **Empty state:** none — limits ship with defaults ($25 / $100), because closed defaults are the promise.
- Identity gate stays as row 0 only if it blocks payment; otherwise it moves to Settings.

### Activity

Incumbent pattern: one chronological feed across all products, statuses as words with a one-line meaning, every failure is a row with a reason and a next step, state tabs/filters, no separate "failures" page (Wise, Sphere, Consul, Mercury, Ramp `[discover-consumer-wallet-ux.md] [sphere.md] [discover-stablecoin-wallet.md] [mercury.md] [ramp.md]`).

Tiba spec:
- **Columns:** Time · Recipient · Invoice · Amount · Status · Reason/Receipt. Mobile: two lines per row.
- **Statuses (chip word → sentence on detail):**
  - `Proposed` → "Agent proposed this payment. Checks running."
  - `Awaiting 2nd check` → "One check passed. Waiting for the second."
  - `Paid` → "Both checks agreed — sent."
  - `Refused` → "Checks disagreed — refused. Nothing moved." + reason clause.
  - `Locked` → "Refused because the wallet is locked."
- **Filter chips:** All · Pending · Paid · Refused (this absorbs `/intents`).
- **Row detail** → the receipt page `/r/[token]`.
- **Empty state:** "Nothing yet. When your agent pays — or is refused — it shows here."
- Refused rows use `--refused` ink, never error-red `[DESIGN.md]`; they stay in the feed forever.

---

## 6. Visual system deltas

Current Sigma: bone `#FBFAF7` / ink `#14161A` / action `#2D4FC7`, Instrument Serif display, Inter body, JetBrains Mono, decision colours paid/held/refused (`src/app/globals.css`). Keep all tokens. Change how they're used:

- **Density: up.** YC-grade money UIs are table-dense with tabular numbers (Arbital, Mercury "spreadsheet-style", Slash tables `[arbital.md] [mercury.md] [slash.md]`). Body 14px, rows 40px desktop / 56px mobile, `font-variant-numeric: tabular-nums` on every amount in Inter, not Mono. Mono only for addresses, references, idempotency keys `[discover-agent-payments.md]`.
- **Spacing: one scale.** 4/8/12/16/24/32. Page padding 24 desktop, 16 mobile (Ramp 24px card padding `[ramp.md]`). Drop the `--display-xl` clamp on app pages; display serif only for the hero number on Home and marketing.
- **Cards → rules.** Lists are hairline-separated rows (`--border`), not stacked cards. Cards allowed for exactly two things: the attention strip and the Send result. Ramp radius 12/8/6 `[ramp.md]`.
- **Tables:** header row in `--muted` 12px uppercase tracking 0.04em, right-aligned amounts, status chip last-but-one, hover row tint `--action-tint` at 40%. Sticky header on desktop.
- **Colour discipline:** `--action` appears once per screen (the Send button / Continue and Send). Status colours only on chips and the result headline. Everything else ink and muted `[ramp.md] [DESIGN.md]`.
- **Hero number:** 40px desktop / 32px mobile, weight 500, tracking −0.5px (Mercury amount spec `[mercury.md]`). Instrument Serif here only.
- **Mobile:** bottom tab bar (Wise), full-width primary button pinned above it, one step per screen in Send, slide/hold-to-confirm not needed — two checks are the confirm `[discover-consumer-wallet-ux.md] [mercury.md]`.
- **Chips:** 20px tall, 6px radius, bg = the `*-bg` token, text = the ink token. Never a filled saturated chip.
- **Empty states:** one sentence + one action, no illustration.

---

## 7. Do not copy

- **Terminal density and live-ticking numbers** (Arbital). Owner opens Tiba to answer "what did my agent pay, was it allowed?" in ten seconds `[arbital.md]`.
- **Product sprawl** — Mercury's 12 products, Ramp's six-plus-AP nav, Jeeves' five-role matrix and approval-tier builder `[mercury.md] [ramp.md] [jeeves.md]`. Six nouns, one owner, no roles.
- **Open defaults** — Slash "auto-approve all outgoing transfers", rule Inactive `[slash.md]`. Tiba ships closed.
- **Hiding controls inside compliance** — Sphere's `pendingReview`, Consul's near-absence of limits `[sphere.md] [discover-stablecoin-wallet.md]`. Limits are screen 2, not settings.
- **Human tap on every payment** — Allowance's Face ID sheet. Tiba's default is auto-approved within limits; the human sees exceptions only `[discover-agent-payments.md]`.
- **Exposing the object model** — Dots' App/wallet/transfer/payout. One object: a payment `[discover-payouts.md]`.
- **Promo-tile Home** — Wise's new-user six equal tiles `[discover-consumer-wallet-ux.md]`.
- **Red for refusal.** Every incumbent's red means "error/declined by the network". Tiba's refusal is a correct decision; keep `--refused` oxblood, never `#D62828` `[DESIGN.md]`.
- **JSON as the primary surface.** Nobody in the set shows JSON to the owner; it's behind Details/Advanced or in docs `[slash.md] [discover-agent-payments.md]`.

---

## 8. Build order

Ordered by perception shift per hour, one implementer (Devin). 20 hours total.

1. **Send result page (step 5) — 4h.** Three outcomes, two check rows, receipt link, reference code. This is the demo moment and the deck screenshot. Wire it to the existing two-check response; no new backend.
2. **Home `/` — 4h.** Spendable-today number, two limit meters, attention strip, last 5 rows, Send button, bottom tab bar. Reads from existing ledger + policies data.
3. **Send flow steps 1–4 on `/console` — 5h.** Recipient picker → invoice picker → note → review sentence. Existing console JSON/tool panel moves under an "Advanced" accordion; nothing deleted.
4. **Activity `/ledger` + absorb `/intents` — 4h.** Column spec, status chips with sentences, filter chips, `/intents` → redirect. Row click → `/r/[token]`.
5. **Limits `/policies` — 3h.** Lock toggle + banner, per-invoice, per-day with UTC reset line, fixed two-checks rule row, History list. Rename nav labels (Invoices, Limits, Recipients) in the same pass.

Recipients page keeps its current build; add the Verified/Unverified chip and the per-row sentence inside item 3 (30 min, already counted).
