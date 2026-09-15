# Security fixes for issues #1 to #6

Branch `security-fixes`, based on `origin/master` at `8fa7571`. Nothing has been pushed or
deployed, and no migration has been run against any database.

## What changed, in plain English

**#1: Vercel token in the repo.** The file itself was already removed by `e112e95` on master.
Now Git ignores every `.env*` file except the placeholder `.env.example`, and CI fails if one is
ever committed again. The expired token still sits in Git history: it was added in `777b056`
(6 Sep) and removed in `e112e95`. No branch tip still contains the file, but anyone can read it
from an old commit. History has not been rewritten. The token had already expired when the
audit ran.

**#2: Ledger and approval scoping.** Already fixed by `de7ccc6` on master. No change here.

**#3: Private pages were public.** Home (`/app`), Send, Activity, Invoices, Recipients and Limits
used to show data to anyone who opened them. They now show an unlock screen until the visitor
proves they own a wallet, either by signing in or by pasting the owner key. After that they see
only their own wallet's data. The browser keeps only a hash of the owner key. That hash opens
the pages but cannot be used against the API. Receipts at `/r/<token>` stay public by link.
Each recipient now belongs to one wallet, and the API and payment pipeline only touch the
caller's own recipients and invoices.
Found while fixing this: any owner key could overwrite another wallet's recipient address and
redirect that wallet's payouts. Anyone can create an owner key at `/start`, so this was open to
everyone. The API now refuses with `RECIPIENT_REF_TAKEN`.

**#4: CI supply chain.** GitHub Actions are pinned to exact commit SHAs, and CI installs with
`npm ci`, which uses exactly the lockfile. The CI token is read-only. Dependabot now proposes
weekly updates as pull requests. The lockfile was missing two optional entries that had made
`npm ci` fail on Linux before, and they are added. This was checked on Windows only; the first CI
run on GitHub is the real test.

**#5: Free money from onboarding.** Wallets created at `/start` without signing in are now
simulated: the treasury never pays for them. Signed-in users get real devnet wallets, at most 3
per account and 20 per day across the site (`LIVE_ONBOARDING_DAILY_CAP`). Each live wallet can
still spend at most 20 USDC a day. The rate limiter no longer trusts a forwarded IP the caller
can fake. On Telegram, chats that have not connected their own wallet can still pay the demo
invoices, such as WO-13, but can no longer pay new addresses from the shared wallet.

**#6: Telegram keys stored in plain text.** Connecting a Telegram chat now stores only the
wallet id, never the keys. The bot also deletes the `/connect` message, which contains the keys,
when Telegram allows it. A migration links existing chats to their wallet by hashing their keys,
then deletes the plain-text columns. Chats whose two keys don't belong to the same wallet are
dropped and must `/connect` again.

## What changes for visitors and judges

- Anonymous visitors to `/app`, `/console`, `/ledger`, `/recipients`, `/work-orders` and
  `/policies` see "Open your wallet" instead of the shared demo wallet. Creating a wallet at
  `/start` takes one step and opens that wallet's pages straight away.
- A wallet created without signing in shows "Payments from this wallet are simulated", and its
  receipts say "Simulated, no transfer". To get a live devnet payment, sign in first.
- The Telegram demo line "pay the KL translator for invoice WO-13" still works for everyone.
- The home page, receipts and the `tiba-standard` pages (`/receipts`, `/verify`,
  `/permissions`, `/developers`) don't change.

## What needs your approval

1. **Pushing the branch.** The commits say `Fixes #N`, so pushing to master closes issues #1,
   #3, #4, #5 and #6 automatically. For #1, the old commit `777b056` will still contain the
   expired token. Leave it (it is expired), or approve a history rewrite separately. A rewrite
   is a force-push, and every clone and fork keeps the old copy anyway.
2. **Running the two migrations on production.** Run them before deploying the new code,
   because the new code reads the new columns. The first migration only adds a column, so the
   current site keeps working. The second removes the Telegram key columns, so the currently
   deployed Telegram bot fails until the new code is live. Run it right before promoting the
   deploy.
3. **The deploy itself.** The live site runs `tiba-standard`. This branch merges into it
   cleanly (checked with `git merge-tree`, no conflicts).

## Exact commands

All commands run from `C:\Users\diony\dev\tiba-secfix` in Git Bash, after the step before
succeeds.

Review the changes:

```
git log --oneline origin/master..security-fixes
git diff origin/master..security-fixes --stat
```

Push (needs your yes):

```
git push origin security-fixes:master
```

Before the migrations, point the shell at production without saving the value to a file.
In Git Bash, `read -rs` asks for the value without echoing it:

```
read -rs DATABASE_URL && export DATABASE_URL
```

Check how production is managed. This is read-only:

```
npx prisma migrate status
```

Preview the Telegram migration. This is read-only and prints counts, never keys:

```
node scripts/telegram-keys-preflight.mjs
```

Then apply the migrations (needs your yes). Pick A or B based on `migrate status`:

- **A.** `migrate status` lists only `20260915000000_scope_recipients_to_workspaces` and
  `20260915010000_telegram_chats_store_workspace_not_keys` as not yet applied:

  ```
  npx prisma migrate deploy
  ```

- **B.** It lists anything else, or says the database has no migration history. Some tables
  and columns (the `kyc_*` columns, `telegram_chats`) were created with `prisma db push`, so this
  is possible. Do **not** run `migrate deploy`. Instead, paste the two `migration.sql` files
  into the Neon SQL editor, in this order:

  ```
  prisma/migrations/20260915000000_scope_recipients_to_workspaces/migration.sql
  prisma/migrations/20260915010000_telegram_chats_store_workspace_not_keys/migration.sql
  ```

  If `migrate status` showed a migration history, record both as applied:

  ```
  npx prisma migrate resolve --applied 20260915000000_scope_recipients_to_workspaces
  npx prisma migrate resolve --applied 20260915010000_telegram_chats_store_workspace_not_keys
  ```

Then deploy as usual, and bring `tiba-standard` up to date. The main `tiba` folder has
uncommitted work in progress: commit or stash it first, and check `git status` is clean before
merging:

```
git -C C:/Users/diony/dev/tiba status --short
git -C C:/Users/diony/dev/tiba fetch origin
git -C C:/Users/diony/dev/tiba merge origin/master
```

Optional, after migration 2. Postgres keeps dropped column data on disk until the table is
rewritten. This rewrites it (Neon SQL editor):

```
VACUUM FULL telegram_chats;
```

Neon's point-in-time history still holds the old plain-text keys for its retention window. If
the preflight linked any chats, treat those wallets' keys as exposed to anyone with database
access. There is no key-rotation feature yet; the owner can create a new wallet and `/connect`
again.

## How it was checked

- `npm run typecheck`: clean.
- `npm test`: 41 of 41 pass (36 before). New tests:
  - `workspace-access`: a guessed wallet id shows nothing.
  - `onboarding-abuse`: a spoofed IP is ignored; anonymous wallets are never live; the caps
    hold and fail closed.
  - `telegram-keys`: a chat is linked only when both keys belong to one wallet.
  - `legacy-receipt`: the simulated label.
- `prisma migrate diff`: the final schema matches both migrations' column, index and foreign-key
  changes.
- Both migrations were run on a throwaway in-memory PGlite Postgres with sample rows (no
  network, no real database):
  - Each recipient landed in the expected wallet.
  - Only the Telegram chat with a matching key pair was kept, and the key columns were removed.
  - All 8 migrations also apply to an empty database.
- `next build` was not run (low memory), and `npm ci` has not run on Linux.
