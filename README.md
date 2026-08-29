# Tiba

**The agent-to-human payment rail.** Software pays a person, on its own, without a human
approving each transfer — and can't run away with the money.

Built for the MUBA Blockchain Hackathon 2026, GonkaRouter "AI For Society" track.

## The problem

Every payment made by software today still needs a human to click approve. That is fine at
ten payments a day and impossible at ten thousand. It also means nobody gets paid at 2am,
on a weekend, or while the person with approval rights is asleep.

The reason the human is still there is not that moving money is hard. It is that nobody
trusts software to decide *when* to move it. A bug at 3am that pays the wrong person forty
thousand ringgit, four hundred times, is not recoverable.

## What Tiba does

Tiba gives an agent a bounded ability to pay people, and makes the boundary the product.

1. **An agent submits a payout intent** — who, how much, and the evidence that the work
   happened.
2. **Verification (GonkaRouter).** The evidence is checked by several independent models.
   Agreement is required. Disagreement is treated as a stop, not a tie-break.
3. **Policy checks.** Per-transaction ceiling, rolling hourly and daily amount caps,
   payout-count caps, recipient allowlist, kill switch, idempotency. Any failure is
   fail-closed.
4. **Settlement.** USDC on testnet.

## Why multiple models, and why a router

Releasing money is irreversible, so a single model's opinion is not enough to act on. Asking
several independent models and requiring them to agree turns one opinion into a signal, and
turns disagreement — the case a single model hides — into a refusal.

That is only practical if several frontier models sit behind one endpoint at low cost, which
is what GonkaRouter is. The router is load-bearing here, not a swapped base URL.

## Status

Early. Nothing here is deployed. Testnet only — mainnet settlement with real funds is a
disqualification ground during the hackathon period and is deliberately absent.

## Team

Rizqey Labs.
