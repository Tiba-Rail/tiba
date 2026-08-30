# Tiba Demo Voiceover

0:00 - Tiba is a payment rail for software that pays people without asking a human to approve every transfer.

0:20 - The operator console shows the boundary: daily cap, hourly cap, recipients, work orders, and the kill switch.

0:50 - The demo submits two payout paths in the background: one clean delivery and one tampered request.

1:15 - Every payable amount starts as a registered work order. The AI can match delivery to approved work; it cannot invent a new payment.

1:50 - The ledger records both outcomes. A clean path becomes paid, while the adversarial path is refused.

2:20 - The red row shows the refusal reason. The model reading the evidence can be fooled, but the separate payer-record check blocks the mismatch.

2:40 - The paid row includes a public digest. The recipient can inspect the chain record instead of trusting our database.

3:10 - Back in the ledger, both the paid and refused outcomes stay visible as records with request IDs, reason codes, and receipt links.

3:30 - The proof is narrow on purpose: testnet only, SUI as the stand-in settlement asset, and GonkaRouter doing the load-bearing verification.
