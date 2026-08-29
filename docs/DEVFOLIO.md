# Devfolio Submission Text

## Tagline

Software pays people. Policy holds the line.

Character count: 44 / 60

## The problem it solves

Character count: 1498 / 1500

Tiba is the agent-to-human payment rail: software pays a person without a human approving each transfer, with operator policy as the boundary. The person paid is a freelancer or contractor waiting after delivery; the liable party is the operator who deployed the agent.

An agent calls `POST /api/v1/intents` with an idempotency key, a recipient ref, and the untrusted artifact: delivery note or invoice text. Channel A sees that artifact and only the open work-order IDs. Channel B sees the payer's records and never sees the artifact. Both must emit the same `{work_order_id, amount_micros}`. Any disagreement is `QUORUM_SPLIT`, never a tie-break.

Then deterministic policy runs: per-transfer ceiling, rolling hourly and daily caps, payout-count caps, recipient allowlist, kill switch, and idempotency. Atomic debit either succeeds or refuses, then settlement happens on Sui testnet.

The design is "match, don't mint": Tiba does not create a new entitlement or token; it matches an existing work record to the artifact and policy limit. Proof is real testnet execution, not a mock UI: 20/20 clean requests paid, 10/10 adversarial requests refused, 0/20 false refusals, mean latency 13 s. Refusal is about 7 s server-side; clean payment is about 16 s including about 7 s of Sui finality.

Out of scope: mainnet, KYC, real USDC, cross-border compliance, image-input review, and unbounded autonomous payments. Settlement uses SUI as a stand-in for USDC: 1 micro == 1 MIST until testnet USDC lands.

## Challenges we ran into

Character count: 829 / 1200

- The first e2e proof was too slow for a stage demo: the artifact channel was awaited before the payer-record channel started, so each intent paid both model latencies in series. We started both channels before awaiting either. Independence was not compromised; the channels were already input-isolated.
- GonkaRouter node latency varied by about 10x between nodes. We added hedged dispatch so the demo path is not hostage to one slow node.
- MiniMax sometimes overran with `<think>` output, which broke strict decision parsing.
- Kimi returned padded JSON even under `json_schema`, so validation had to be stricter than "the model says JSON".
- Image input returned 400, so the artifact channel is text-only for this submission.
- Prisma on Vercel needed an explicit generate step so the deployed app had the client it expected.

## Technologies used

Next.js, TypeScript, Prisma, PostgreSQL (Neon), GonkaRouter, Sui, @mysten/sui, Tailwind, Vercel.

## Platforms

Web.

## Gonka AI For Society Track Fit

Character count: 445 / 700

Tiba fits AI For Society because it lets a real person get paid in seconds instead of days without asking society to trust an autonomous system blindly. The freelancer or contractor gets faster payout after delivery. The operator gets hard limits, input-isolated model agreement, refusal on disagreement, idempotency, and a ledger judges can inspect. GonkaRouter is load-bearing: it turns one model opinion into a cross-check before money moves.
