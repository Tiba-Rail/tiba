# Security

## Reporting a problem

Email friends@rizqey.com. Say which page or file you looked at, what you expected, and what happened. Leave private keys, passwords, and database URLs out of the email.

## The 15 Sep 2026 review

`SECURITY_REVIEW.md` is dated 13 Sep 2026. `docs/PRD.md` records that this review closed on 15 Sep 2026. It found six issues. `SECURITY_FIXES.md` describes the fixes. All six are marked fixed.

1. High. A Vercel token was committed in `.env.prod` (commit `777b056`) and later removed (commit `e112e95`). Git ignores every `.env*` file except `.env.example`, and CI fails if another env file is committed. The expired token is still in old git history. History was not rewritten. The review says the token had already expired when the audit ran.

2. High. Ledger reads and approval overrides could see another agent's records. Ledger reads now stay on the resolved agent (`src/app/api/console/ledger/route.ts`), and an override loads only that agent's intent (`src/app/api/v1/intents/[id]/override/route.ts`). The review names commit `de7ccc6`.

3. Medium. Wallet pages for home, Send, Activity, Invoices, Recipients, and Limits showed every wallet's data. Each wallet's pages are limited to its owner. The shared demo wallet stays readable, and its controls stay off. Receipts at `/r/<token>` stay public by link. One owner key could also overwrite another wallet's recipient address; that write is refused with `RECIPIENT_REF_TAKEN`. The review's status is "Fixed (needs its migration run)". The migration in this repo is `prisma/migrations/20260915000000_scope_recipients_to_workspaces`.

4. Medium. GitHub Actions now run at fixed commit SHAs, and CI installs with `npm ci` (`.github/workflows/ci.yml`). The workflow permission is contents read. Dependabot opens weekly update pull requests.

5. Medium. Wallets created without signing in could ask the treasury to pay. Those wallets are simulated. A signed-in user can get a Solana devnet wallet, and the site caps how many new live wallets it creates in a day (`LIVE_ONBOARDING_DAILY_CAP` in `src/app/api/v1/workspaces/route.ts`, and `onboardingRail` in `src/lib/rate-limit.ts`).

6. Medium. Telegram chats stored bearer keys in plain text. A connected chat now stores the wallet id. The review's status is "Fixed (needs its migration run)". The migration in this repo is `prisma/migrations/20260915010000_telegram_chats_store_workspace_not_keys`.

`SECURITY_REVIEW.md` calls this an AI-assisted review, and says it is not a professional penetration test.

## Test network

This is test-network software. The payment rail sends Solana devnet test USDC. Real money is outside this repository. A second audit has not been done.
