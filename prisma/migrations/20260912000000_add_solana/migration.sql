ALTER TABLE "recipients" ADD COLUMN "solana_address" TEXT;
ALTER TABLE "recipients" ALTER COLUMN "sui_address" DROP NOT NULL;
ALTER TABLE "payout_intents" ADD COLUMN "chain" TEXT;
