-- Issue #3: every recipient belongs to one workspace (agent). Work orders belong to their
-- recipient's workspace, so they need no column of their own.
ALTER TABLE "recipients" ADD COLUMN "agent_id" TEXT;

-- Backfill, most specific evidence first.
-- 1. Onboarding creates a workspace and its example recipient (ref "owner-<suffix>") in one
--    transaction. Matched by ref, since the kyc_* columns were added outside migrations.
UPDATE "recipients" AS r
SET "agent_id" = (
  SELECT a."id" FROM "agents" AS a
  WHERE a."created_at" <= r."created_at"
    AND a."created_at" > r."created_at" - INTERVAL '5 seconds'
  ORDER BY a."created_at" DESC
  LIMIT 1
)
WHERE r."agent_id" IS NULL AND r."ref" LIKE 'owner-%';

-- 2. The workspace that first submitted a payment to the recipient.
UPDATE "recipients" AS r
SET "agent_id" = first_payer."agent_id"
FROM (
  SELECT DISTINCT ON ("recipient_id") "recipient_id", "agent_id"
  FROM "payout_intents"
  ORDER BY "recipient_id", "created_at" ASC
) AS first_payer
WHERE r."agent_id" IS NULL AND r."id" = first_payer."recipient_id";

-- 3. Anything left predates per-workspace owner keys: it was managed with the global operator
--    token, which acts as the oldest workspace.
UPDATE "recipients"
SET "agent_id" = (SELECT "id" FROM "agents" ORDER BY "created_at" ASC LIMIT 1)
WHERE "agent_id" IS NULL;

-- CreateIndex
CREATE INDEX "recipients_agent_id_idx" ON "recipients"("agent_id");

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
