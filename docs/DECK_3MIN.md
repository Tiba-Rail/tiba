# Tiba — 3-Minute Pitch (MUBA, 6 Sep 2026)

**Total spoken words: ~385 (cap 420 @ 140 wpm).** Screen = silent recording `tiba-demo-STAGE-silent.mp4` (3:05); Faris narrates live.

## Run-of-Show

### [0:00] Cold open
**Screen:** Title card over the Send page, idle on invoice WO-13.
**Say:** "Tiba is a wallet for software. It pays people on your behalf, within your limits — and every time it does, it can prove why. Upwork alone moved four billion dollars to freelancers last year, and McKinsey expects software agents to mediate up to five trillion in commerce by twenty thirty. Yet every one of those payments still waits for a human to click approve — or moves on blind trust."

### [0:20] The rule
**Screen:** Owner Send page: policy caps, saved recipients, freeze.
**Say:** "Tiba is a bounded payment rail. The rule is match, don't mint: every payable amount starts as a invoice a human registered. The software can match a delivery to it — it can never invent a new amount, raise its own limits, or touch the freeze."

### [0:40] Demo: clean pay
**Screen:** Test buttons fires a clean delivery note; pipeline animates Channel A / Channel B / Agreement / Policy / Settlement; PAID lands; activity row shows the Sui digest.
**Say:** "The agent submits a payout for invoice thirteen. Two isolated checks run through GonkaRouter. Channel one reads the untrusted delivery note. Channel two reads only our own payer records — it never sees the note. Both write down the same job and the same amount, so it pays on Sui testnet — SUI standing in for USDC. Real transactions, no real money."

### [1:20] Demo: refused
**Screen:** Same Send page; tampered note asking for more; outcome REFUSED, reason `QUORUM_SPLIT`, Gonka request IDs visible.
**Say:** "Now the note is tampered to ask for more. Channel one still reads the note; channel two still reads our records. They disagree — and disagreement is not a problem to resolve, it is the alarm. Verdict: refused, quorum split. The refusal is the product. Isolation is by evidence, not by model — if Gonka substitutes a model, we record and publish it on the receipt."

### [1:50] Freeze
**Screen:** Owner flips the kill-switch toggle; next request row lands refused.
**Say:** "Policy sits after the AI, never inside it: per-payment and rolling caps, an saved recipients, retry protection — and a freeze the agent cannot touch. The owner flips it, and every further request is refused, no matter what the models say."

### [2:10] Receipt, eval, business model
**Screen:** Public receipt page — rule that fired, request IDs, latency, digest — then the eval summary.
**Say:** "Every outcome gets a public receipt: the rule that fired, the request IDs, the settlement digest. Measured: twenty of twenty clean paid, ten of ten tampered refused, zero false refusals, thirteen seconds mean. Proposed model: the owner pays a take rate in basis points on verified payouts plus a monthly fee for policy and Send page — replacing a human approver while capping their loss."

### [2:40] Close (ends ~2:50; 15 s buffer)
**Screen:** Send page left open on WO-13.
**Say:** "The Send page stays live on testnet — try the clean and tampered flows yourselves. Faris Irfan, Arthur Wong. Thank you."

Demo fallback: if Gonka stalls, say "the request is held, not paid" and jump to the last PAID receipt.

## Q&A (1 minute — one breath each)

1. **Why not one model?** The safety is not that two models are independent — it is that each sees different evidence; a trick that fools the note reader never reaches the records check.
2. **Both channels wrong the same way?** Possible — which is why caps, the saved recipients, and the freeze bound the loss; software makes small bounded payments, never holds an unlimited wallet.
3. **Two intents race the cap?** The limit check and the spend are one locked step, and a retried request is the same request — it cannot pay twice.
4. **Where is GonkaRouter load-bearing?** On the decision path before settlement — the two checks run through it, must agree, and every receipt carries the router's request IDs.
5. **Real or just a UI?** Testnet, but not a mock — real GonkaRouter calls, real Sui testnet settlement, clickable digests.
6. **Not done / not generic?** No mainnet, no KYC, no real USDC. The new part is the control surface: an AI can match a registered obligation but cannot mint a payable amount.

## Sources

- Upwork enabled **$4.0B GSV** in FY2024 (10-K). VERIFIED — opened and read. https://www.sec.gov/Archives/edgar/data/1627475/000162747525000011/upwk-20241231.htm
- McKinsey: agentic commerce could reach **$1T US / $3–5T global by 2030**. VERIFIED — opened and read. https://www.digitalcommerce360.com/2025/10/20/mckinsey-forecast-5-trillion-agentic-commerce-sales-2030/
- Business model figures are **PROPOSED**, not sourced.
