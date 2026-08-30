# Q&A Preparation

## 1. Jack: Why not one model?

Because the useful separation is not a magic claim that two models are always independent. It is the separation of what each check is allowed to see. One check reads the untrusted delivery note and the open work orders. The other reads our own payment records and never sees the delivery note. Today the same model often answers first on both sides, so using more than one model helps with speed and backup, but it is not the safety guarantee.

## 2. Jack: What happens when both channels are wrong the same way?

Then Tiba can still make the wrong decision. The control is that policy limits bound the loss: per-transaction ceiling, rolling hourly and daily caps, payout-count caps, recipient allowlist, kill switch, and retry protection all sit after the AI checks. That is the point of the product: let software make small bounded payments, not hold an unlimited wallet.

## 3. Jack: Two intents arrive at once, both pass the cap check, and together they blow the cap.

They should not, because the limit check and the spend happen as one locked step. Tiba only spends if that step succeeds; otherwise the payment is refused. If the same request is sent again, Tiba treats it as the same request, so a retry should not pay twice.

## 4. Jack: Where is GonkaRouter actually load-bearing?

GonkaRouter sits on the decision path before settlement. It runs the two separate checks that must agree before policy and Sui settlement can happen. The proof is not just changing where a request is sent; the app records the router's receipts and refuses when the two checks disagree, which is what stopped the adversarial test where the requested amount was changed. The measured eval was 20/20 clean paid, 10/10 adversarial refused, 0/20 clean false refusals, mean 13 s.

## 5. Rain: Is this real or just a UI?

It is testnet only, but it is not just a mock UI. The clean end-to-end path went through the real payment request flow, real GonkaRouter calls, and Sui testnet settlement; docs/DECISIONS.md records digest 4EZgiwH4a6eU1KyawxX7tNbJC4K2SX5g9yfYV9AZvHVG for the clean payment. The UI surfaces that reality as an operator console, a ledger where refusals are first-class rows, and public receipts recipients can open.

## 6. Rain: What is not done, and why should this not be penalised as another generic AI idea?

It is not mainnet, not KYC, not real USDC, and not cross-border compliance. Settlement uses SUI on testnet as the stand-in asset until testnet USDC lands, with 1 payout micro-unit mapping to 1 MIST. The non-generic part is the control surface: Tiba is not an AI that gives advice, it is a bounded payment rail where a model can match a human-created obligation but cannot mint a payable amount.
