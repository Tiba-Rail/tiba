-- Additive: existing intents stay on Tiba's own rail. x402-routed payments set this flag.
ALTER TABLE "payout_intents" ADD COLUMN "x402_routed" BOOLEAN NOT NULL DEFAULT false;
