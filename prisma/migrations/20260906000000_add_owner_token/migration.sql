-- AddOwnerToken
ALTER TABLE "agents" ADD COLUMN "owner_token_hash" TEXT;
ALTER TABLE "agents" ADD COLUMN "owner_token_prefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_owner_token_hash_key" ON "agents"("owner_token_hash");
