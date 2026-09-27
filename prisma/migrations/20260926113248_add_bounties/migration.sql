-- Additive only: two new tables for the bounty-claim flow. Nothing here touches an existing
-- table, so this is safe to run against the live database.
--
-- (This migration was generated with `prisma migrate dev --create-only` against a local dev
-- database whose `accounts`/`sessions` tables had already drifted from an unrelated earlier
-- change; the generated file included destructive DROP/ALTER statements for those two tables
-- that have nothing to do with bounties. Those are deliberately left out here.)

-- CreateTable
CREATE TABLE "bounties" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done_criteria" TEXT NOT NULL,
    "amount_micros" BIGINT NOT NULL,
    "allowed_claimers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "share_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bounties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounty_claims" (
    "id" TEXT NOT NULL,
    "bounty_id" TEXT NOT NULL,
    "work_link" TEXT NOT NULL,
    "claimer_solana_address" TEXT NOT NULL,
    "amount_asked_micros" BIGINT NOT NULL,
    "summary" TEXT NOT NULL,
    "payout_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bounty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bounties_share_code_key" ON "bounties"("share_code");

-- CreateIndex
CREATE INDEX "bounties_agent_id_created_at_idx" ON "bounties"("agent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bounty_claims_payout_intent_id_key" ON "bounty_claims"("payout_intent_id");

-- CreateIndex
CREATE INDEX "bounty_claims_bounty_id_created_at_idx" ON "bounty_claims"("bounty_id", "created_at");

-- AddForeignKey
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_bounty_id_fkey" FOREIGN KEY ("bounty_id") REFERENCES "bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_payout_intent_id_fkey" FOREIGN KEY ("payout_intent_id") REFERENCES "payout_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
