-- Issue #3: every recipient belongs to one workspace (agent). Work orders belong to their
-- recipient's workspace, so they need no column of their own.
-- Preview what this does first, read-only: node scripts/recipients-preflight.mjs
-- (planRecipientOwners in that script mirrors these steps; keep the two in step.)
ALTER TABLE "recipients" ADD COLUMN "agent_id" TEXT;

-- Backfill, strongest evidence first.
-- 1. The workspace that first submitted a payment to the recipient.
UPDATE "recipients" AS r
SET "agent_id" = first_payer."agent_id"
FROM (
  SELECT DISTINCT ON ("recipient_id") "recipient_id", "agent_id"
  FROM "payout_intents"
  ORDER BY "recipient_id", "created_at" ASC, "id" ASC
) AS first_payer
WHERE r."agent_id" IS NULL AND r."id" = first_payer."recipient_id";

-- 2. Onboarding creates a workspace and its example recipient (ref "owner-<suffix>") in one
--    transaction. Matched by creation time, only when exactly one workspace was created in the
--    5 seconds before the recipient; two sign-ups that close together are left to step 3.
UPDATE "recipients" AS r
SET "agent_id" = (
  SELECT a."id" FROM "agents" AS a
  WHERE a."created_at" <= r."created_at"
    AND a."created_at" > r."created_at" - INTERVAL '5 seconds'
)
WHERE r."agent_id" IS NULL
  AND r."ref" LIKE 'owner-%'
  AND (
    SELECT count(*) FROM "agents" AS a
    WHERE a."created_at" <= r."created_at"
      AND a."created_at" > r."created_at" - INTERVAL '5 seconds'
  ) = 1;

-- 3. Anything left from before per-workspace owner keys (6 Sep 2026) was managed with the global
--    operator token, which acts as the oldest workspace. Later leftovers stay unassigned: no
--    workspace sees them, rather than the oldest workspace getting somebody else's recipient.
UPDATE "recipients"
SET "agent_id" = (SELECT "id" FROM "agents" ORDER BY "created_at" ASC, "id" ASC LIMIT 1)
WHERE "agent_id" IS NULL AND "created_at" < TIMESTAMP '2026-09-06 00:00:00';

-- CreateIndex
CREATE INDEX "recipients_agent_id_idx" ON "recipients"("agent_id");

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
