-- These columns are already on the Prisma models. A database built only from
-- earlier migrations was missing them, so `next build` failed while rendering pages.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "require_recipient_kyc" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "kyc_status" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "kyc_provider" TEXT;
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "kyc_check_id" TEXT;
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "kyc_verified_at" TIMESTAMP(3);
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "kyc_expires_at" TIMESTAMP(3);
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "t3n_did" TEXT;

ALTER TABLE "adjudications" ADD COLUMN IF NOT EXISTS "gonka_fallback" TEXT;
