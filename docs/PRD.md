
# Product Requirements Document — Tiba v4

## 0. What changed from the last version

The previous version of this document (1 Sep 2026) described settlement on Sui testnet. That was true of a parallel experiment at the time (real transaction proof in `docs/DECISIONS.md`, digest `Cz2DWU6hQQfRQ1JCCDP3qw27XGD5P2MSEJw5Y6W87wpE`), but the current codebase settles on **Solana devnet** (`src/app/settlement.ts`, `@solana/web3.js`, `api.devnet.solana.com`) — that pivot happened after this doc was last touched and was never written back. This version corrects that, and adds the actual product decision made on 17 Sep 2026 after a night of research: what Tiba is for, in one sentence, and why x402 changes the roadmap.

## 1. One-paragraph summary

Tiba is the authorization layer for autonomous agent payments: infrastructure that lets software pay a real person or another service without a human clicking "approve" for every transfer. An agent submits a payout request with the recipient, amount, and supporting evidence. Two isolated verification channels independently check the request against the payer's own records; the payment executes only when both agree, and any disagreement is a refusal, not a guess. Tiba settles on Solana devnet today and publishes a public receipt for every decision, paid or refused, that a third party can independently check.

## 2. The problem

The immediate customer is a founder who has already shipped an AI agent with access to a wallet, card, or stablecoin balance.

That founder's customer asks: "Can your agent pay people without me approving every payment?"

The honest answer today is often: "Not safely." An agent that can spend money needs more than a wallet and spending limits — it needs a way to determine whether a requested payment is actually supported by the payer's records and the work being performed. Tiba addresses this: the agent can request a payment, but it cannot override a refusal, increase its own limits, change the recipient allowlist, or disable the kill switch.

## 3. Why now — the case as of 17 Sep 2026, checked against real sources

Three independent checks run tonight landed on the same conclusion from different angles, which is the strongest signal this kind of research can give:

1. **A fresh redo of all 102 YC Requests for Startups** (three engines, real sources, 17 Sep) found 97 dead ends for Rizqey Labs and one real survivor: packaging the permission-and-receipt engine as a devtool other agent builders can install. Every other RFS category (fintech, stablecoins, government) died on regulatory or capital grounds a solo founder can't clear.
2. **A 19-model Council vote** on the crypto-to-QR idea independently converged on the same shape: the one gap that's real and specific is "no card required, no ceiling" agent-initiated payment — and the confident votes all said Tiba doesn't fit a consumer QR product, it fits the authorization layer underneath any rail.
3. **A three-engine sweep on x402** (Coinbase's open HTTP-402 payment protocol, now governed by the Linux Foundation, ~40 member orgs including AWS, Cloudflare, Circle, Binance, Google) found the identical hole from the primary spec itself: x402's own documentation states client-side budget management, session policy, and dual-check/human approval are explicitly **out of scope** — MetaMask's own words, "the wallet decides what an agent is allowed to spend and whether a transaction gets signed at all." A peer-reviewed security study (USENIX Security 2026, arXiv:2607.19545 — verified as a real paper, not a fabricated citation) checked 15 x402 facilitators handling 60k+ sellers and found **every single one violated at least one of eight basic security rules**, including a "free shopping" flaw. Nobody has built the missing policy/approval layer well. Real 2026 adoption is genuine (AWS CloudFront, Cloudflare Workers, Fireblocks, Circle's Arc mainnet all ship it), but the settlement-volume headlines are inflated — three independent firms (Chainalysis, TRM Labs, Bitquery) separately found the bulk of on-chain "agent payment" volume is bridge traffic, self-pay, and test loops, not real commerce.

The conclusion these three checks agree on: **do not try to become a new settlement rail to replace x402** — that fight is already lost to a free, neutrally-governed, already-adopted standard with AWS and Cloudflare built on top of it. **Do become the thing that decides whether the payment x402 is about to send should actually happen.** That is not a pivot. It is the same product this document already described in September, stated more precisely, with three independent 2026 checks behind it instead of none.

## 4. What Tiba does today (built and live)

Tiba's current payment flow:

1. An agent submits a payout intent: recipient, amount, an untrusted evidence artifact (e.g. a delivery note).
2. The request goes through GonkaRouter (`src/lib/gonka.ts`) to two isolated verification channels.
   - Channel A reads only the evidence artifact and the list of open work-order IDs.
   - Channel B reads only the payer's own records and never sees the evidence artifact.
3. Each channel independently produces `{work_order_id, amount}`. Agreement continues the request; disagreement refuses it. No tie-breaker, no fallback guess.
4. A fail-closed policy layer checks: max amount per transfer, rolling hourly/daily caps, recipient allowlist, kill switch, and idempotency (a repeated request never double-pays).
5. Approved payments settle on **Solana devnet**, using a devnet USDC mint as the asset.
6. Paid and refused outcomes get public receipts, including both verification channels' request IDs and a link to Gonka's public verification endpoint.

Live surfaces (`tiba-omega.vercel.app` / `tiba.rizqey.com`): operator console (test-payment panel, spending caps, kill switch, WebMCP capability matrix, held-intent queue), `/intents`, `/work-orders`, `/recipients`, `/policies`, `/ledger`, `/r/[token]` (public per-payment receipt). Six WebMCP tools let a browser AI agent list work orders/recipients/budget and submit a payment or read the ledger — verified end-to-end in real Chrome — with no path to override a refusal, change a cap, or use the kill switch.

An A2A (Agent2Agent) adapter shipped in v1.1: Agent Card at `/.well-known/agent-card.json`, JSON-RPC `SendMessage`/`GetTask` at `POST /a2a`, forwarding into the same verification engine untouched. An identity/compliance gate also shipped, default off (`require_recipient_kyc` on `/policies`), provider abstraction ready for a real KYC vendor later.

## 5. Who it's for

The buyer is a company or founder building an autonomous agent that needs to pay people or services, and needs: autonomous execution, a real link between the payment and work-order/payer records, spending and recipient controls, refusal on disagreement, and a public record of every decision. The end recipient is the human or service getting paid — Tiba doesn't represent them or do their KYC.

## 6. Competitive landscape (checked 17 Sep 2026, real sources)

| Product | What it actually does | Has Tiba's mechanism? |
|---|---|---|
| **x402** (Coinbase → Linux Foundation) | The payment handshake itself — HTTP 402, a server asks, a wallet signs, a facilitator settles. Real 2026 adoption: AWS CloudFront/Bedrock AgentCore, Cloudflare Workers, Fireblocks, Circle Arc, Binance B402. | No — the spec explicitly puts budget/session/dual-check "out of scope." A 2026 security study found every checked facilitator (15/15) violated a basic security rule. |
| **Google AP2** | Authorization/mandate layer (donated to FIDO Alliance, Apr 2026), rail-agnostic, crypto via the a2a-x402 extension. | No published transaction volume as of mid-2026; the right abstraction, no shipped product to point to. |
| **OpenAI ACP / Stripe** | Consumer checkout inside ChatGPT (Etsy, Shopify, etc.) | Retail SKU checkout, not API-to-API authorization. |
| **Visa TAP / Mastercard Agent Pay** | Card-network agent identity and tokenized credentials, real 2026 bank pilots (Santander). | Closed network, card rails; not built for a $0.001 API call or a Solana-native agent wallet. |
| **Circle Agent Stack, Skyfire, Crossmint** | Agent wallets, agent identity (KYA), payment tooling | Single verification path each; none require two independent checks to agree before executing. |
| **Tiba** | Two independent, isolated verification channels that must agree; disagreement is a refusal, not a guess. Solana-native. | — |

Nothing in this table does what Tiba does. x402 in particular is not a competitor to out-build — it's the rail Tiba should speak, with Tiba's authorization sitting in front of every signature.

## 7. Roadmap — v4 priorities (17 Sep 2026)

### Priority 1 (new): Tiba as an x402 buyer on Solana

Implement Tiba as an x402 v2 buyer: parse `PAYMENT-REQUIRED`, sign an SPL `transfer_checked` transaction (facilitator as fee-payer, per the x402 Solana `exact` scheme), attach `PAYMENT-SIGNATURE`, read `PAYMENT-RESPONSE`. Gonka's two-channel agreement and the existing policy gate (caps, allowlist, kill switch) run **before** the signature is produced — x402 never gets to sign anything Tiba's own engine hasn't already cleared. This is additive to the existing settlement path, not a replacement: Tiba keeps its own intent/receipt flow for direct payouts, and gains the ability to pay any endpoint that only speaks 402.

Do not build a facilitator. That is a separate, gas-sponsoring, security-exposed business (the thing the USENIX paper studied) and is explicitly out of scope.

Optional, lower priority within this item: emit the `offer-and-receipt` x402 extension so a Tiba receipt is protocol-shaped for anyone already parsing x402 receipts, not just Tiba's own `/r/[token]` page.

### Priority 2: Marketing and positioning refresh

Update site copy and the deck to state the x402-aware positioning plainly: Tiba is the check that runs before an agent's payment goes out, on any rail, including the one the rest of the industry just agreed to standardize on. Follow the existing `docs/COPY_MAP.md` convention (file | current | new | KEEP) — do not silently rewrite copy that already tested fine.

### Priority 3 (unchanged from v1.1): identity/compliance provider

A real KYC provider behind the existing abstraction, after v1/x402 traction — no change to this priority's scope or reasoning.

### Explicitly still out of scope

- Full KYC platform, mainnet production custody, replacing Stripe/Circle/x402 as a settlement rail, running an x402 facilitator. Same reasoning as before: the product is the authorization decision, not custody or plumbing.
- Crypto-to-QR (the separate consumer-payment idea researched 17 Sep) is parked, not merged into Tiba. It is a different buyer, a different regulatory problem (a real licensing gap in every jurisdiction checked except El Salvador), and forcing it into this PRD would repeat the exact "bolt it onto Tiba" mistake the RFS research was built to catch.

## 8. Success criteria (unchanged, plus one)

Everything in the 1 Sep version still holds: real end-to-end payment with independent receipt verification, a real refusal on disagreement or policy violation, no override path, no duplicate payment, a third party can read a receipt and understand the pipeline, WebMCP tools can't bypass controls.

New: **an x402-speaking endpoint (e.g. an AWS CloudFront-protected resource, or a Cloudflare Worker charging per request) gets paid by Tiba, with Gonka's two-channel agreement and the policy gate having run first** — proof that the authorization layer works in front of someone else's rail, not just Tiba's own.

## 9. Open questions

1. Custody/regulatory structure before any production-network money — unchanged, unresolved.
2. Which identity/compliance provider, and for which jurisdictions — unchanged, unresolved.
3. Whether external x402-speaking endpoints are worth targeting before Tiba has its own paying customers, or whether Priority 1 should stay demo-only until then.
