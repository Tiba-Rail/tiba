# Security fixes for issues #1 to #6

Branch `security-fixes`, based on `origin/master` at `8fa7571`. Nothing has been pushed or
deployed, and no migration or SQL has been run against any real database.

## What changed, in plain English

**#1: Vercel token in the repo.** The file itself was already removed by `e112e95` on master.
Now Git ignores every `.env*` file except the placeholder `.env.example`, and CI fails if one is
ever committed again. The expired token still sits in Git history: it was added in `777b056`
(6 Sep) and removed in `e112e95`. No branch tip still contains the file, but anyone can read it
from an old commit. History has not been rewritten. The token had already expired when the
audit ran.

**#2: Ledger and approval scoping.** Already fixed by `de7ccc6` on master. No change here.

**#3: Private pages were public.** Home (`/app`), Send, Activity, Invoices, Recipients and Limits
used to show every wallet's data to anyone. Now each wallet's pages are shown only to its owner,
who proves it by signing in or pasting the owner key. The browser keeps only a hash of the owner
key. That hash opens the pages but cannot be used against the API. Receipts at `/r/<token>` stay
public by link. Each recipient now belongs to one wallet, and the API and payment pipeline only
touch the caller's own recipients and invoices.
The one exception is the **shared demo wallet** (the wallet behind `TIBA_AGENT_KEY`, the one the
Telegram demo pays from, holding synthetic test-network data). Anyone can view it, read-only:
a banner says so, and every button and field on its pages is disabled. The owner APIs still
refuse without its owner key. Any other wallet id in a link reveals nothing.
Found while fixing this: any owner key could overwrite another wallet's recipient address and
redirect that wallet's payouts. Anyone can create an owner key at `/start`, so this was open to
everyone. The API now refuses with `RECIPIENT_REF_TAKEN`.

**#4: CI supply chain.** GitHub Actions are pinned to exact commit SHAs, and CI installs with
`npm ci`, which uses exactly the lockfile. The CI token is read-only. Dependabot now proposes
weekly updates as pull requests. The lockfile was missing two optional entries that had made
`npm ci` fail on Linux before, and they are added. This was checked on Windows only; the first CI
run on GitHub is the real test.

**#5: Free money from onboarding.** Wallets created at `/start` without signing in are now
simulated: the treasury never pays for them. Signed-in users get real devnet wallets. Sign-in
accepts any Solana wallet, and anyone can make as many of those as they like, so the "3 per
account" limit is not a real limit. **The real limit is 20 new live wallets a day across the
site** (`LIVE_ONBOARDING_DAILY_CAP`). Each live wallet can spend up to 20 USDC a day, and keeps
that allowance on later days, so the total the treasury can be asked for grows over time: up to
400 USDC a day after the first day, 800 after the second, and so on (test-network USDC, and never
more than the treasury holds). Wallets created without sign-in **before** the fix are still live
until the #5 data step in step 4 below. The rate limiter no longer trusts a forwarded IP the
caller can fake. On Telegram, chats that have not connected their own wallet can still pay the
demo invoices, such as WO-13, but can no longer pay new addresses from the shared wallet.

**#6: Telegram keys stored in plain text.** Connecting a Telegram chat now stores only the
wallet id, never the keys. The bot also deletes the `/connect` message, which contains the keys,
when Telegram allows it. A migration links existing chats to their wallet by hashing their keys,
then deletes the plain-text columns. Chats whose two keys don't belong to the same wallet are
dropped and must `/connect` again.

## What changes for visitors and judges

- "See the demo wallet" on the home page still opens the shared demo wallet on `/app`, with a
  banner: read-only, test network only, create your own or sign in. Its Send, Activity,
  Invoices, Recipients and Limits pages are viewable the same way.
- The demo wallet's Recipients page lists the recipients Telegram users added before this fix,
  with the names they typed. That was public before too.
- Every other wallet is shown only to its owner. Creating a wallet at `/start` opens that
  wallet's pages straight away.
- A wallet created without signing in shows "Payments from this wallet are simulated", and its
  receipts say "Simulated, no transfer". To get a live devnet payment, sign in first.
- The Telegram demo line "pay the KL translator for invoice WO-13" still works for everyone.
- The home page, receipts and the `tiba-standard` pages (`/receipts`, `/verify`,
  `/permissions`, `/developers`) don't change.

## What you approve, in order

Order on the day: **1, 2, 3, 5a, 4, 5b.** Step 4 changes the production database, and the
currently live site breaks against the new database (the Telegram bot fails, and new recipients
get lost). So step 4 runs only once the new site is built and waiting (5a), and 5b puts it live
straight after.

Commands run in Git Bash. `read -rs` asks for a value without showing or saving it; paste it and
press Enter. Keep the same window open from step 3 to step 5b.

### 1. Push the branch on its own, and watch CI

This runs the first Linux `npm ci` on the branch, so master is untouched if it fails.

```
git -C C:/Users/diony/dev/tiba-secfix push origin security-fixes
gh run list --repo Tiba-Rail/tiba --branch security-fixes --limit 1
gh run watch <run id from the line above> --repo Tiba-Rail/tiba --exit-status
```

Carry on only when it ends green. If it is red, stop: nothing on master changed.

### 2. Fast-forward master

```
git -C C:/Users/diony/dev/tiba-secfix push origin security-fixes:master
```

If Git refuses because master moved, stop. The commits say `Fixes #N`, so this closes issues #1,
#3, #4, #5 and #6. The old commit `777b056` will still contain the expired #1 token. Leave it
(it is expired), or approve a history rewrite separately. A rewrite is a force-push, and every
clone and fork keeps the old copy anyway.

### 3. Run the read-only previews

None of these writes anything. They print ids, names and counts, never a key.

```
cd C:/Users/diony/dev/tiba-secfix
read -rs DATABASE_URL && export DATABASE_URL
read -rs TIBA_AGENT_KEY && export TIBA_AGENT_KEY
npx prisma migrate status
node scripts/recipients-preflight.mjs
node scripts/telegram-keys-preflight.mjs
node scripts/anonymous-wallets-preflight.mjs
```

What to look for:

- `migrate status`: which migrations are not yet applied. This picks A or B in step 4.
- `recipients-preflight`: which wallet the demo recipients (translator-kl, creator-lagos, ali and
  WO-13's recipient) will belong to, whether that is the `TIBA_AGENT_KEY` wallet, and how many
  leftover recipients go to the oldest wallet. **The last line must say `RESULT: OK`.** If it
  says `STOP`, go no further: the Telegram WO-13 demo would break.
- `telegram-keys-preflight`: how many connected chats will be kept and how many dropped.
- `anonymous-wallets-preflight`: how many wallets created without sign-in are still live, and
  the demo wallet id you paste into the #5 SQL file.

### 5a. Merge into tiba-standard and build the new site, without putting it live

The main `tiba` folder has uncommitted work in progress. Commit or stash it first; the first
command must print nothing.

```
git -C C:/Users/diony/dev/tiba status --short
git -C C:/Users/diony/dev/tiba checkout tiba-standard
git -C C:/Users/diony/dev/tiba fetch origin
git -C C:/Users/diony/dev/tiba merge origin/master
cd C:/Users/diony/dev/tiba
npm run typecheck && npm test
vercel deploy --prod --skip-domain
```

The last command builds a production deployment but leaves tiba.rizqey.com on the old one. Note
the deployment URL it prints.

### 4. Production migrations and the #5 data step

Only after 5a has printed its URL. Run the migrations from the `tiba-secfix` window:

```
cd C:/Users/diony/dev/tiba-secfix
```

- **A.** `migrate status` listed only `20260915000000_scope_recipients_to_workspaces` and
  `20260915010000_telegram_chats_store_workspace_not_keys` as not yet applied:

  ```
  npx prisma migrate deploy
  ```

- **B.** It listed anything else, or said the database has no migration history. Some tables
  and columns (the `kyc_*` columns, `telegram_chats`) were created with `prisma db push`, so this
  is possible. Do **not** run `migrate deploy`. In the Neon SQL editor, run each file below on
  its own, in this order, with `BEGIN;` added as the first line and `COMMIT;` as the last, so a
  failure part-way changes nothing:

  ```
  prisma/migrations/20260915000000_scope_recipients_to_workspaces/migration.sql
  prisma/migrations/20260915010000_telegram_chats_store_workspace_not_keys/migration.sql
  ```

  If `migrate status` showed a migration history, record both as applied:

  ```
  npx prisma migrate resolve --applied 20260915000000_scope_recipients_to_workspaces
  npx prisma migrate resolve --applied 20260915010000_telegram_chats_store_workspace_not_keys
  ```

Then go straight to 5b. The #5 data step can run just after 5b or any time later, since it
works with the old and the new site alike. Open
`scripts/sql/anonymous-live-wallets-to-mock.sql`, copy it all into the Neon SQL editor, replace
`PASTE_THE_DEMO_WALLET_ID_HERE` with the id `anonymous-wallets-preflight` printed, and run it.
It already has `BEGIN;` and `COMMIT;`. Left unedited, it changes nothing. Check it worked:

```
node scripts/anonymous-wallets-preflight.mjs
```

It should now say 0 wallets are still live.

### 5b. Put the new site live

```
vercel promote <the deployment URL from 5a>
```

Then check, in a private browser window: tiba.rizqey.com, then "See the demo wallet" shows the
demo wallet with the read-only banner. In Telegram, "pay the KL translator for invoice WO-13"
ends with a receipt link. If the new site misbehaves, do not roll back to the old deployment:
the old code cannot read the new Telegram table. Leave it and ask Claude.

### Optional, after step 4

Postgres keeps dropped column data on disk until the table is rewritten. This rewrites it (Neon
SQL editor):

```
VACUUM FULL telegram_chats;
```

Neon's point-in-time history still holds the old plain-text keys for its retention window. If
the Telegram preview linked any chats, treat those wallets' keys as exposed to anyone with
database access. There is no key-rotation feature yet; the owner can create a new wallet and
`/connect` again.

## How it was checked

- `npm run typecheck`: clean.
- `npm test`: 44 of 44 pass (36 before this branch). New tests:
  - `workspace-access`: a guessed wallet id shows nothing; the demo wallet is public and
    read-only, and is never swapped in for a guessed id.
  - `recipient-scope`: runs every migration on a throwaway in-memory PGlite Postgres (no
    network, no real database) with production-shaped rows. Each recipient lands where the
    preview predicts, including a demo recipient paid later by another wallet, two sign-ups
    close together, and leftovers before and after 6 Sep. The #5 SQL file changes nothing
    unedited, and once edited switches only wallets created without sign-in. All 8 migrations
    also apply to an empty database.
  - `onboarding-abuse`: a spoofed IP is ignored; anonymous wallets are never live; the caps
    hold and fail closed.
  - `telegram-keys`: a chat is linked only when both keys belong to one wallet.
  - `legacy-receipt`: the simulated label.
- `git merge-tree` against `tiba-standard`: merges with no conflicts. The merged home page still
  links "See the demo wallet" to `/app`.
- `next build` was not run (low memory), and `npm ci` has not run on Linux (that is step 1).
