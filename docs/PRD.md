
# Product Requirements Document — Tiba v5

## 0. What changed from v4 (17 Sep) to v5 (26 Sep)

v4 was written before the 25 September competitive research and centred on Tiba as the authorization
layer in front of x402. The research (18 rivals checked feature by feature, all 1,916 YC companies since
Winter 2024, Colosseum's own hackathon record) found something more specific: giving an agent a spending
limit is now a crowded, funded category — Coinbase, Stripe, Squads all ship it, and 36 YC companies sit
directly in the same corner. Of the 18 we compared as of 25 Sep 2026, none offered both a bill check and a
public receipt for a refusal. Tiba works for any payer and any bill, not one supply chain, and every check,
paid or refused, gets a public receipt anyone can open by link. That is Tiba's actual
differentiator, and v5 rewrites around it: "the check before an agent's payment goes out," 3DS for AI
agents. Section 4 now states the true rule for how many channels check a payment (it was previously easy
to read as "always two independent checks," which is not accurate at every amount). Section 4 also adds
Tempo and Zcash, built and tested since v4, which only covered Solana. x402 buyer support carries over from
v4 but moves from Priority 1 to a later distribution item — it is not what makes Tiba the check, it is one
more place the check can run. Section 5 was revised again the same day: instead of three rails read as
three separate buyers, the story leads with one first buyer (bounty and grant payouts in the Superteam
Malaysia and KrackedDevs crowd) and keeps the three rails as proof the check travels.

## 1. One-paragraph summary

Tiba is the check before an AI agent's payment goes out — 3DS for AI agents. It sits in front of any
wallet: an agent submits a payout, Tiba reads the bill against the payer's own record, and pays only when
they match. When they don't, it refuses, and the refusal still gets a signed public receipt. Tiba is not
trying to out-build Coinbase, Stripe or Squads on spending limits — every rival checked already has those.
Of the 18 we compared as of 25 Sep 2026, none offered both a bill check and a public receipt for a refusal.
Tiba works for any payer and any bill, not one supply chain, and every check, paid or refused, gets a
public receipt anyone can open by link.

Once agents pay bills, the bill itself becomes the attack. The check that reads the payer's record is
never shown the bill (`src/lib/prompts.ts:35`), and the amount paid always comes from the record, so a fake
or padded bill can't raise it. Disagreement between the two readings is the alarm.

## 2. The problem, in plain words

Every AI agent that can research, draft and decide still stops at one spot: the moment money has to move,
a person clicks approve. Plenty of products now give an agent a spending limit — a cap, an allowlist, a
kill switch. Of the 18 we compared as of 25 Sep 2026, none offered both a bill check and a public receipt
for a refusal. A founder running agents that
pay people is left with two bad options: approve every payment themselves, or hand the agent a key and
hope.

## 3. Why now, sourced

- AI can now turn a messy bill into exact fields, and agents are starting to pay without a person clicking
  approve.
- Agent payment rails arrived this year. Coinbase ships Agentic Wallets (Feb 2026, limits by token, time
  and amount). Stripe ships one-time payment tokens with an amount cap and an expiry, live in the US,
  Canada and Europe. On Solana, Squads Grid ships spending-limited smart accounts with timelocks and
  multisig. [TIBA_RESEARCH_25Sep.md]
- At least 36 YC companies sit directly in the agent-spend-and-pay corner, and 92 more sit next to it —
  checked across all 1,916 YC companies since Winter 2024. [same]
- 18 named rivals compared feature by feature, quote for quote (Locus, Allowance, Agentcard, Sponge,
  Blaze, IRBC, RentAHuman, Consul, Infinite, Payman, Squads Grid, Coinbase Agentic Wallets, Stripe agentic
  commerce, Mercantill, plus others): all cap spend; only Blaze mentions checking an invoice before paying,
  and even there a person still approves. Of the 18 we compared as of 25 Sep 2026, none offered both a bill
  check and a public receipt for a refusal.
  [rivals-matrix.jsonl]
- Two people who tried an earlier framing of this space left it: Sky Yap (agent payments) moved to
  tokenised-stock income products; Payman, the original "AI pays humans" company, now sells agents to
  banks instead. [TIBA_RESEARCH_25Sep.md, "Three lessons from the people who won near you"]
- x402 (Coinbase's payment protocol, broadly adopted this year) is the terminal, not the check — its own
  documentation puts budget, session and approval decisions out of scope. Being a buyer on x402 is
  distribution for Tiba later, not the product itself.

## 4. What Tiba does today — only what the code proves

1. An agent submits a payout intent: recipient, amount, an evidence artifact (e.g. a delivery note).
2. Two channels each independently read a different source and produce a `{work_order_id, amount}` answer
   through Groq: one reads the evidence artifact, the other reads the payer's own record. The two checks
   use two different makers (`src/lib/gonka.ts`, `CANDIDATES`). The artifact check asks OpenAI's model
   first (`openai/gpt-oss-120b`) and falls back to Alibaba's model (`qwen/qwen3.8-27b`). The payer-record
   check asks Alibaba's model first (`qwen/qwen3.8-27b`) and falls back to OpenAI's model
   (`openai/gpt-oss-120b`). Which model actually answered is stored on the adjudication. If both checks
   had to run and a fallback left both answered by the same maker, the payment still pays or refuses on
   its own. That fact is stored on the adjudication, and the receipt says both checks used the same model
   because the other was unavailable.
3. Both readings always run (`src/lib/payout-intent.ts`, `Promise.allSettled`). Each invoice (work order)
   carries its own setting:
   - `both`: the default (`prisma/schema.prisma:135`); job and amount must match.
   - `payer_record`: the amount comes from the record; the bill must still name the same job
     (`src/lib/reconcile.ts:31-37`).
   - `human`: a person decides.

   The amount bands in `requiredChannelsForAmount` (under $50 / $50-250 / over $250) are used only by the
   Telegram agent today (`src/lib/telegram-agent.ts:220`); making them a floor for every invoice is an open
   board job.
4. Agreement pays. Disagreement, or a policy limit (kill switch, per-payment ceiling, daily cap, recipient
   allowlist), refuses. No tie-breaker, no guess. A same-maker fallback does not change that.
5. Every outcome, paid or refused, gets a public signed receipt (`/r/[token]`) naming which channels ran,
   what each one found, and which rule decided it. A channel that did not run says so, not "agreed."
6. Live rail: Solana devnet, USDC. Built and tested; deployed on the live site but switched off (no treasury
   keys set): Tempo (an EVM-compatible stablecoin chain, fees paid in the stablecoin itself — no separate
   gas token) and Zcash (shielded payments; an auditor gets a viewing key, nobody else sees the amount).
   Combined on branch `colosseum-all` / `v4-the-check`, 71 of 71 tests pass.
7. Five test payouts exist on Solana devnet (13 Sep 2026, 0.01 USDC each, each with a public receipt
   — `PAYOUTS_PROOF.md`). A security review closed 15 Sep, six of six findings fixed
   (`SECURITY_FIXES.md`).

## 5. Who it's for

One buyer, first: communities and grant programs that pay contributors and bounties, starting with
Superteam Malaysia and the KrackedDevs crowd. An agent pays a contributor; Tiba reads the claim against
the bounty and the record, pays or refuses, leaves a receipt either way. Solana is the home rail — where
Tiba already runs and already won.

Tempo and Zcash are proof the same check works on any rail, not two more customer segments: Tempo shows
it for contractors and suppliers paid in stablecoins; Zcash shows it for private payroll and grants, with
a viewing key for the auditor.

*Decided 26 Sep: the two winners near this contest (Sky FH at MUBA, Semi at Colosseum) each picked one
route and one buyer rather than several at once. Tiba's own win was at Superteam Malaysia, whose leaders
also decide the pending Solana Foundation grant — the same crowd is the natural first buyer.*

## 6. Competitive landscape — 18 rivals checked, 25 Sep 2026, only what the table supports

| Product | What it does | Reads the bill before paying | Refuses a wrong bill automatically | Proves a refusal |
|---|---|---|---|---|
| Coinbase Agentic Wallets | Spend limits by token, time, amount | Not stated | Not stated | Not stated |
| Stripe agentic commerce | Capped, expiring one-time payment tokens | Not stated | Not stated | Not stated |
| Squads Grid (Solana) | Spending limits, timelocks, multisig | Not stated | Not stated | Not stated |
| Blaze (YC) | Agent payments across 80+ currencies | Yes — mentions checking the invoice | No — a person still approves | Not stated |
| Locus, Allowance, Agentcard, Sponge, IRBC, RentAHuman, Consul, Infinite, Payman (YC) | Each caps or gates agent spend | Not stated for any | Not stated for any | Not stated for any |
| Mercantill (Colosseum, 4th place, Stablecoins) | Audit trails, team controls, spending safeguards, built on Squads Grid | Not stated | Not stated | Not stated |
| **Tiba** | Reads the bill against the payer's own record | Yes | Yes, automatically, up to $250 | Yes — every refusal is a signed public receipt |

Of the 18 we compared as of 25 Sep 2026, none offered both a bill check and a public receipt for a refusal.
Tiba works for any payer and any bill, not one supply chain, and every check, paid or refused, gets a
public receipt anyone can open by link.

## 7. Roadmap to 12 October, in priority order

1. Make the bill check the headline — on the site, the deck and every receipt: show the bill, the record,
   and the mismatch when there is one. (Site copy repositioned this week on branch `v4-the-check`.)
2. One real refusal receipt visible on the home page. The code already supports this (`page.tsx` queries a
   real refused example when one exists) — confirm the live database actually has one, or seed one from an
   existing signed receipt. Never edit a signed receipt.
3. Tempo and Zcash rails live, not just built and tested. Built and tested on `colosseum-all` /
   `v4-the-check`; going live is a separate decision this document does not make.
4. Three outside teams running test payouts through Tiba, each with a public receipt and a refusal.
5. x402 buyer support stays on the roadmap as later distribution — once Tiba can pay any x402-speaking
   endpoint, that is one more place its checks run — but it does not come before items 1 to 4.

## 8. Success test by 12 October

Three outside teams run test payouts through Tiba, each with a public receipt, and each with at least one
refusal. Nothing else counts as proof.

## 9. Open questions

1. **Pricing.** Free on test networks, then a monthly plan plus a small fee per checked payment — the same
   shape as Locus (start at $0, pay per call), which the market already accepts. No number is set.
2. **Market size**, sourced: $3-5 trillion is all buying run by AI agents by 2030, mostly shopping
   (McKinsey, Oct 2025; US retail alone up to $1 trillion); paying people is one slice. $303 billion sits
   in stablecoins today, heading to roughly $420 billion by year end (Stablecoin Beat, 10 Sep 2026;
   year-end figure via Citi/Spark). If 1% of agent spending ran through a check like Tiba at 0.1% per
   payment, that is $30-50 million a year — our own what-if math, shown as a what-if, not a forecast.
   Re-verify both external figures before citing them publicly; they were checked 25 September and may
   have moved.
3. Custody and regulatory structure before any production-network money — unresolved, carried over from
   v4.
4. Which identity/compliance provider, and for which jurisdictions — unresolved, carried over from v4 (the
   KYC gate exists in code, default off, `require_recipient_kyc`).
5. Whether Tempo and Zcash go live before or after the three-outside-teams test in Roadmap item 4 — the
   roadmap above treats "live" as its own decision, not a side effect of testing.
