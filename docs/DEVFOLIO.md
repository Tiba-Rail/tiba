# Devfolio Submission Text

## Tagline

Agent-checked payments for public aid

Character count: 37 / 60

## The problem it solves

Character count: not process-verified; under 1500 by manual drafting.

People who depend on aid, refunds, stipends, or emergency payouts often wait because software cannot safely pay them on its own. A human reviewer becomes the bottleneck: every transfer waits for someone to read the request, compare it with policy, approve it, and avoid being tricked by bad inputs.

Tiba is a testnet payment agent for bounded payouts. A user submits a plain-language request; Tiba checks the request and the supporting artifact as isolated inputs through GonkaRouter; if both pass policy, it pays on Sui testnet. The design is "match, don't mint": Tiba does not create a new entitlement or token. It matches an approved request to an existing policy and settlement limit, then records the outcome.

The proof is real testnet execution, not a mock UI. The evaluation result is 20/20 clean requests paid, 10/10 adversarial requests refused, 0/20 false refusals, with mean latency of 13 s. The clean payment path is about 16 s including about 7 s of Sui finality; refusal is about 7 s server-side.

Out of scope: mainnet, KYC, real USDC, cross-border compliance, image-input review, and unbounded autonomous payments. Today settlement uses SUI as a stand-in for USDC, where 1 micro == 1 MIST, until testnet USDC lands.

## Challenges we ran into

Character count: not process-verified; under 1200 by manual drafting.

- We had a sequential-channel bug: the two checks were not independent enough, so a failure in one channel could shape the other. We fixed the flow around isolated inputs per channel.
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

Character count: not process-verified; under 700 by manual drafting.

Tiba lets software pay a person without a human approving each transfer, while keeping the payout bounded by policy. GonkaRouter is load-bearing because it checks isolated request and artifact inputs before settlement. That makes the demo concrete for public aid: faster small payments, automatic refusal of adversarial requests, and a ledger judges can inspect.
