-- Issue #5 data step. NOT a migration: run it by hand, once, in the Neon SQL editor, after
-- `node scripts/anonymous-wallets-preflight.mjs` has printed the count and the demo wallet id.
--
-- Before the fix, wallets created at /start without sign-in settle on Solana devnet and are paid
-- from the shared treasury. This switches them to the simulated rail. Their past receipts keep
-- their real network label (receipts read the payment's own chain, not the wallet's rail).
-- Stays live: the shared demo wallet behind TIBA_AGENT_KEY (paste its id below) and the oldest
-- workspace. Wallets saved to a signed-in account are not touched.
--
-- In the first line after WITH, replace the placeholder inside the quotes with the id the preview
-- printed. If it is left as is, or is not a real workspace id, this changes nothing.
BEGIN;

WITH demo AS (
  SELECT "id" FROM "agents" WHERE "id" = 'PASTE_THE_DEMO_WALLET_ID_HERE'
), oldest AS (
  SELECT "id" FROM "agents" ORDER BY "created_at" ASC, "id" ASC LIMIT 1
)
UPDATE "agents"
SET "rail" = 'mock', "updated_at" = CURRENT_TIMESTAMP
WHERE "rail" = 'solana'
  AND "user_id" IS NULL
  AND "id" NOT IN (SELECT "id" FROM demo)
  AND "id" NOT IN (SELECT "id" FROM oldest)
  AND EXISTS (SELECT 1 FROM demo);

COMMIT;
