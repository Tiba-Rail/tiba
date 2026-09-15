-- Issue #6: telegram_chats stored both bearer keys in plain text. Keep only the workspace id.
-- Preview what this does first, read-only: node scripts/telegram-keys-preflight.mjs

-- The table was first created with `prisma db push`, so a database built only from migrations
-- lacks it. Create it in its old shape so every step below applies everywhere.
CREATE TABLE IF NOT EXISTS "telegram_chats" (
    "chat_id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "owner_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("chat_id")
);

ALTER TABLE "telegram_chats" ADD COLUMN "agent_id" TEXT;

-- Backfill: hash the stored keys (sha256 hex, the digest agents.api_key_hash and
-- agents.owner_token_hash hold) and link each chat to the workspace BOTH keys belong to.
UPDATE "telegram_chats" AS t
SET "agent_id" = a."id"
FROM "agents" AS a
WHERE a."api_key_hash" = encode(sha256(convert_to(t."agent_key", 'UTF8')), 'hex')
  AND a."owner_token_hash" = encode(sha256(convert_to(t."owner_key", 'UTF8')), 'hex');

-- Chats whose keys no longer belong to one workspace are dropped; they must /connect again.
DELETE FROM "telegram_chats" WHERE "agent_id" IS NULL;

-- Remove the plaintext copies.
ALTER TABLE "telegram_chats" DROP COLUMN "agent_key", DROP COLUMN "owner_key";
ALTER TABLE "telegram_chats" ALTER COLUMN "agent_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "telegram_chats_agent_id_idx" ON "telegram_chats"("agent_id");

-- AddForeignKey
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
