-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "api_key_prefix" TEXT NOT NULL,
    "ceiling_micros" BIGINT NOT NULL,
    "hour_cap_micros" BIGINT NOT NULL,
    "day_cap_micros" BIGINT NOT NULL,
    "hour_count_cap" INTEGER NOT NULL,
    "day_count_cap" INTEGER NOT NULL,
    "spent_micros_day" BIGINT NOT NULL DEFAULT 0,
    "spent_micros_hour" BIGINT NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count_day" INTEGER NOT NULL DEFAULT 0,
    "count_hour" INTEGER NOT NULL DEFAULT 0,
    "kill_switch" BOOLEAN NOT NULL DEFAULT false,
    "rail" TEXT NOT NULL DEFAULT 'mock',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sui_address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "ceiling_micros" BIGINT NOT NULL,
    "brief_text" TEXT NOT NULL,
    "payer_record" JSONB NOT NULL,
    "required_channels" TEXT NOT NULL DEFAULT 'both',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "discharged_by_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_intents" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "recipient_id" TEXT NOT NULL,
    "amount_micros" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "reason_code" TEXT,
    "decision_class" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "digest" TEXT,
    "explorer_url" TEXT,
    "gnk_usd" TEXT,
    "pricing_updated_at" TIMESTAMP(3),
    "public_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjudications" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_id" TEXT,
    "prompt_sha" TEXT NOT NULL,
    "response_sha" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "tuple_json" JSONB,
    "ok" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjudications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "untrusted" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_api_key_hash_key" ON "agents"("api_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_ref_key" ON "recipients"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_ref_key" ON "work_orders"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_discharged_by_intent_id_key" ON "work_orders"("discharged_by_intent_id");

-- CreateIndex
CREATE INDEX "work_orders_recipient_id_status_expires_at_idx" ON "work_orders"("recipient_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_intents_idempotency_key_key" ON "payout_intents"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payout_intents_public_token_key" ON "payout_intents"("public_token");

-- CreateIndex
CREATE INDEX "payout_intents_agent_id_created_at_idx" ON "payout_intents"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "adjudications_intent_id_idx" ON "adjudications"("intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_intent_id_key" ON "artifacts"("intent_id");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjudications" ADD CONSTRAINT "adjudications_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payout_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payout_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
