# Q&A Preparation

## 1. Jack: Why not one model?

Because the useful separation is isolated inputs, not a magic claim that two models are always independent. The artifact channel sees the untrusted delivery text and open work-order IDs; the payer-record channel sees the payer's own records and never receives the artifact. DeepSeek usually wins both channels today, so model diversity is a hedge on top, not the guarantee.

## 2. Jack: What happens when both channels are wrong the same way?

Then Tiba can still make the wrong decision. The control is that deterministic policy caps bound the loss: per-transaction ceiling, rolling hourly and daily caps, payout-count caps, recipient allowlist, kill switch, and idempotency all sit after the models. That is the point of the product: let software make small bounded payments, not hold an unlimited wallet.

## 3. Jack: Two intents arrive at once, both pass the cap check, and together they blow the cap.

They should not, because the cap check and debit are one database write, not a read-then-write in app code. The policy path only spends if the conditional debit succeeds; otherwise the intent is refused. Retries are collapsed by idempotency keys, so a replay should not double-spend the same request.

## 4. Jack: Where is GonkaRouter actually load-bearing?

GonkaRouter is on the decision path before settlement: it runs the isolated verification channels whose exact match is required before policy and Sui settlement. The proof is not a swapped base URL; the app records router request IDs and refuses on channel disagreement, which is what stopped the adversarial e2e case with `QUORUM_SPLIT:amount_micros`. The measured eval was 20/20 clean paid, 10/10 adversarial refused, 0/20 clean false refusals, mean 13 s.

## 5. Rain: Is this real or just a UI?

It is testnet only, but it is not just a mock UI. The clean e2e path went through `POST /api/v1/intents`, real GonkaRouter calls, and Sui testnet settlement; `docs/DECISIONS.md` records digest `4EZgiwH4a6eU1KyawxX7tNbJC4K2SX5g9yfYV9AZvHVG` for the clean payment. The UI surfaces that reality as an operator console, a ledger where refusals are first-class rows, and public receipts at `/r/<token>`.

## 6. Rain: What is not done, and why should this not be penalised as another generic AI idea?

It is not mainnet, not KYC, not real USDC, and not cross-border compliance. Settlement uses SUI on testnet as the stand-in asset until testnet USDC lands, with `1` payout micro-unit mapping to `1` MIST. The non-generic part is the control surface: Tiba is not an AI that gives advice, it is a bounded payment rail where a model can match a human-created obligation but cannot mint a payable amount.
