# Devfolio Submission Text

Plain language. Nothing here that the person pitching can't explain in one sentence.
See docs/GLOSSARY.md for the terms judges may use.

## Tagline (44 / 60)

Software pays people. Policy holds the line.

## The problem it solves

When software needs to pay a person, a human still has to approve every transfer. That works at ten payments a day and breaks at ten thousand, and nobody gets paid at 2am or on a weekend. Meanwhile the person waiting is a freelancer or contractor who did the work, and the person on the hook if the software pays the wrong claim is the operator who switched it on.

Tiba lets software pay a person without a human approving each transfer, and keeps that safe with limits set once in advance. When an agent asks to pay someone, Tiba runs two separate checks through GonkaRouter: one reads the delivery note or invoice, the other reads our own records and never sees the note. Both have to name the same person and the same amount. If they disagree, Tiba refuses. No averaging, no tie-break. Then the operator's limits apply — a cap per payment, caps per hour and per day, a list of who can be paid, and a kill switch — and the payment settles on the Sui test network with a public receipt showing exactly why it was paid or refused.

Proof, on the test network, not a mock: 20 out of 20 legitimate payouts paid, 10 out of 10 tampered claims refused, no false refusals, about 13 seconds per decision.

Not included: real money, mainnet, KYC, cross-border compliance, image-based evidence. Settlement uses the network's own coin as a stand-in for USDC until test USDC is available.

## Challenges we ran into

- The first working version took 45 seconds per payment — too slow for a stage demo. The two checks were running one after the other instead of at the same time; fixing that was the first win.
- Response times on the router varied about tenfold depending on which node answered. We now send each check to two models at once and take the first valid answer.
- One model kept "thinking out loud" before answering and ran out of space before giving us anything usable, so we dropped it.
- Another returned oddly padded answers when we asked for strict JSON, so we validate every answer ourselves instead of trusting the format.
- The router doesn't accept images, so evidence is text only for this submission.
- Our deployment shipped with no styling for a while because a build plugin was missing. Nobody had looked at a rendered page — only at status codes. Lesson learned.

## Technologies used

Next.js, TypeScript, PostgreSQL, Tailwind CSS, Vercel (the five in Devfolio's list). GonkaRouter, Prisma and Sui are named in the description.

## Platforms

Web.

## Project links

- Live: https://tiba-omega.vercel.app
- Source: https://github.com/Tiba-Rail/tiba

## Track fit — Gonka Router, AI For Society

Tiba lets software pay a person with no human approving each transfer, with policy caps as the boundary. GonkaRouter is load-bearing: two isolated channels — one reads the untrusted invoice text, one reads the payer's own records and never sees the invoice — must agree on who is owed and how much before money moves. Disagreement is a refusal, never a tie-break. Every outcome gets a public receipt showing both Gonka request IDs. Proof on testnet: 20/20 clean payouts paid, 10/10 adversarial claims refused, 0 false refusals. The person paid gets paid in seconds; the operator is protected from an autonomous system paying the wrong claim.

## Track fit — Sui Foundation, Anything AI powered by Sui

You asked for AI agents with on-chain wallets executing agentic payments. Tiba is the harder half: agent-to-human. A person can't be rolled back, so the agent gets a bounded ability to pay — per-transfer ceiling, rolling caps, allowlist, kill switch, idempotency — enforced in one atomic debit before a Sui testnet transaction is signed. Verification runs through GonkaRouter; settlement is a real Sui transaction with a digest on every receipt. Complete rather than complex: an operator console, a ledger where refusals sit beside payments, and a public receipt page, all live at tiba-omega.vercel.app.

## Track fit — Sui Foundation, Payment and stablecoins

Tiba solves a real payment workflow: paying freelancers and contractors the moment a delivery is verified, instead of waiting for a human to open a banking app. An operator registers work orders and recipients once; the agent submits payout intents; Tiba verifies, applies policy, and settles on Sui testnet in one atomic step, with a PTB for batch payouts. The recipient opens a public receipt with the settlement digest and the reason if refused. Settlement today uses SUI as a stand-in for USDC on testnet; sponsored transactions so recipients never hold gas are the next step. Real digests are in the repo README.

## Track fit — single version, if one field covers all tracks

Tiba is the agent-to-human payment rail: software pays a person with no human approving each transfer, and operator policy is the boundary. An agent submits a payout intent with the untrusted invoice text; two isolated channels through GonkaRouter — one reads the invoice, one reads the payer's own records and never sees the invoice — must agree on who is owed and how much. Disagreement is a refusal, never a tie-break. Deterministic policy then runs — per-transfer ceiling, rolling caps, allowlist, kill switch, idempotency — as one atomic debit, and settlement is a real Sui testnet transaction with the digest on a public receipt alongside both Gonka request IDs. Proof: 20/20 clean payouts paid, 10/10 adversarial claims refused, 0 false refusals; refusal about 7 s, payment about 16 s. For Gonka: the router is the cross-check money waits on. For Sui: agent-to-human is the harder half of agentic payments, because a person can't be rolled back — bounded on-chain payouts, PTB batch settlement, and a recipient-facing receipt, live at tiba-omega.vercel.app. Testnet only; SUI stands in for USDC.
