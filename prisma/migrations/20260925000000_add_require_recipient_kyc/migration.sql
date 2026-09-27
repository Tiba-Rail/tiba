-- The Agent model already maps this column. It was never in a migration, so a
-- database built with `prisma migrate deploy` cannot render pages that read an agent.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "require_recipient_kyc" BOOLEAN NOT NULL DEFAULT false;
