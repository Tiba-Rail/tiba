# Tiba

**The agent-to-human payment rail.** Software pays a person, on its own, without a human
approving each transfer - and can't run away with the money.

Built for the MUBA Blockchain Hackathon 2026, GonkaRouter "AI For Society" track.

## The Problem

Every payment made by software today still needs a human to click approve. That is fine at
ten payments a day and impossible at ten thousand. It also means nobody gets paid at 2am,
on a weekend, or while the person with approval rights is asleep.

The reason the human is still there is not that moving money is hard. It is that nobody
trusts software to decide *when* to move it. A bug at 3am that pays the wrong person forty
thousand ringgit, four hundred times, is not recoverable.

## What Tiba Does

Tiba gives an agent a bounded ability to pay people, and makes the boundary the product.

1. **An agent submits a payout intent** - who, how much, and the evidence that the work
   happened.
2. **Verification (GonkaRouter).** The evidence is checked by several independent models.
   Agreement is required. Disagreement is treated as a stop, not a tie-break.
3. **Policy checks.** Per-transaction ceiling, rolling hourly and daily amount caps,
   payout-count caps, recipient allowlist, kill switch, idempotency. Any failure is
   fail-closed.
4. **Settlement.** Sui testnet, using SUI as the current stand-in asset until testnet
   USDC is funded.

## Why Multiple Models, And Why A Router

Releasing money is irreversible, so a single model's opinion is not enough to act on. Asking
several independent models and requiring them to agree turns one opinion into a signal, and
turns disagreement - the case a single model hides - into a refusal.

That is only practical if several frontier models sit behind one endpoint at low cost, which
is what GonkaRouter is. The router is load-bearing here, not a swapped base URL.

## Status

Early. Nothing here is deployed. Testnet only - mainnet settlement with real funds is a
disqualification ground during the hackathon period and is deliberately absent.

## Blockchain Used

Sui testnet. There is no mainnet settlement path in this repository.

## Testnet Contract Addresses

- SUI package: `0x2`
- SUI coin type: `0x2::sui::SUI`
- Testnet USDC package: pending funding/configuration through `SUI_USDC_TYPE`
- Settlement wallet: `0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef`
- First live Sui testnet payout digest: `Cz2DWU6hQQfRQ1JCCDP3qw27XGD5P2MSEJw5Y6W87wpE`
- Explorer: `https://suiscan.xyz/testnet/tx/Cz2DWU6hQQfRQ1JCCDP3qw27XGD5P2MSEJw5Y6W87wpE`

For the demo, when `SUI_USDC_TYPE` is unset, Tiba treats `1` payout micro-unit as
`1` MIST and transfers SUI. Once testnet USDC is funded, set `SUI_USDC_TYPE` to the
Circle testnet USDC coin type.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill `DATABASE_URL`, `GONKA_API_KEY`,
   `SEED_AGENT_KEY`, `SUI_NETWORK=testnet`, `SUI_ADDRESS`, `SUI_PRIVATE_KEY`, and
   optionally `SUI_USDC_TYPE`.
3. Apply database migrations: `npx prisma migrate deploy`
4. Seed the demo data: `npm run seed`
5. Start the app: `npm run dev`

Useful checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run sui:smoke`

## Team

Rizqey Labs.
