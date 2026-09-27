# Tiba

Tiba is the check before an AI agent's payment goes out. Two separate checks look at each payment, the rules in this code decide whether Solana devnet test USDC may move, and every pay, refusal, or hold leaves a public receipt.

## One payment

1. **The agent asks to pay.** `POST /api/v1/intents` in `src/app/api/v1/intents/route.ts` checks the agent key, then calls `processPayoutIntent` in `src/lib/payout-intent.ts`. The request carries an idempotency key, a recipient ref, and the bill text (`artifact`).

2. **The rules.** `src/lib/payout-guards.ts` stops a bill larger than 16 KB and a workspace that has already started too many payment requests this hour. `processPayoutIntent` then loads only that payer's recipient and open work orders. A missing open invoice, a recipient that fails the identity rule, or a missing Solana address is written on the receipt as a refusal. The work order stores how many checks it requires (`requiredChannels` in `prisma/schema.prisma`, default `both`). `effectiveChannels` in `src/lib/payout-guards.ts` uses `requiredChannelsForAmount` in `src/lib/reconcile.ts` as a floor: under 50 USDC the floor is the payer record, from 50 USDC through 250 USDC the floor is both checks, and above 250 USDC the floor is a person. The stored work-order setting can only make that stricter, so a default work order still runs both checks under 50 USDC. After the two checks agree, `evaluateBeforeDebit` and `debitAtomically` in `src/lib/policy.ts` apply the kill switch, the work-order ceiling, the per-payment ceiling, and the hourly and daily caps. The amount those functions use is the amount from the payer record.

3. **Check 1 reads the bill.** `processPayoutIntent` sends the bill text and the open work-order ids to `runGonka` in `src/lib/gonka.ts`, channel `artifact`, using `artifactSystemPrompt` and `artifactDecisionSchema` in `src/lib/prompts.ts`. The first model is `openai/gpt-oss-120b`. If that answer does not match the schema, the fallback is `qwen/qwen3.8-27b` (`CANDIDATES.artifact`).

4. **Check 2 reads the payer's own record.** The same function sends the stored work orders (the `payer_record` JSON, the ceiling, and the brief) to `runGonka`, channel `payer_record`, using `payerRecordSystemPrompt` and `payerRecordDecisionSchema`. The bill text is only in check 1's message. The first model is `qwen/qwen3.8-27b`. The fallback is `openai/gpt-oss-120b`. The two checks start together (`Promise.allSettled` in `src/lib/payout-intent.ts`). Each answer is stored as an adjudication row.

5. **Both agree, and the amount is inside the rules: pay on Solana devnet and write a public receipt.** `reconcile` in `src/lib/reconcile.ts` compares the two answers. On the default `both` setting they must name the same work order and the same amount. `src/lib/policy.ts` then applies the ceilings and caps. If those pass, `settleCommittedIntent` in `src/lib/payout-settlement.ts` calls the rail from `payoutRail` in `src/lib/rails/index.ts`. The Solana rail is `src/lib/rails/solana.ts`. It sends Circle devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) and refuses any Solana network other than devnet. A payment is recorded as paid only when two devnet RPC endpoints report the same successful signature. The public receipt is the payout intent row (`publicToken`) plus those adjudication rows. Anyone with the link can read it at `/r/<token>`, rendered by `src/app/r/[token]/page.tsx`.

6. **Otherwise Tiba refuses or holds, and writes a receipt too.** A mismatch is a refusal (`QUORUM_SPLIT` in `src/lib/reconcile.ts`). A missing check, a payment above 250 USDC, or a transfer that is not yet confirmed is a hold. A rule failure in `src/lib/policy.ts` is a refusal. If the model service substituted a model and the two checks then disagree, the payment is held (`MODEL_SUBSTITUTED_SPLIT` in `src/lib/payout-intent.ts`). The same receipt row is updated. The page is still `src/app/r/[token]/page.tsx`.

A bill that is too large, or a request over the hourly cap, stops in `src/lib/payout-guards.ts` before a receipt row is stored.

## Run it locally

Use test settings. Point the app at a Postgres database you control. Keep `DATABASE_URL` off the live database.

```bash
npm install
cp .env.example .env
```

Edit `.env` on your machine and leave it uncommitted. `.gitignore` ignores every `.env*` file except `.env.example`.

- `DATABASE_URL`: a Postgres database you control. The value in `.env.example` is a placeholder.
- `RAIL=solana`
- `SOLANA_NETWORK=devnet`
- `MOCK_SETTLEMENT=1` records a result and sends no devnet USDC (`src/lib/rails/index.ts`). Use this when you have no treasury key.
- To send devnet test USDC, leave `MOCK_SETTLEMENT` unset, set `SOLANA_NETWORK=devnet`, and put a devnet treasury key only in this local `.env` as `SOLANA_PRIVATE_KEY` (a Solana CLI JSON byte array). `src/lib/rails/solana.ts` refuses any other network.
- `GROQ_API_KEY`: the key `src/lib/gonka.ts` uses for the two checks. Without it, both checks come back unavailable and the payment is held.
- `IDENTITY_PROVIDER=mock` is already in `.env.example`.

`package.json` asks for Node 24. Apply migrations only to your own database, then start the app:

```bash
npx prisma migrate deploy
npm run dev
```

`npm run build` runs `prisma migrate deploy` against whatever `DATABASE_URL` is set to, then builds. Leave that script alone. To compile without migrating, run `npx next build`.

```bash
npm test
npm run typecheck
```

A written walkthrough of one test payout is in `docs/QUICKSTART.md`.

## Live demo

https://tiba.rizqey.com

That site runs this check. Payments there are Solana devnet test USDC.

## Not done yet

- Real money. This software sends Solana devnet test USDC only.
- A second audit. The review that closed on 15 Sep 2026 is in `SECURITY.md`. A later audit has not been done.
