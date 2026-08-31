# Tiba Demo Voiceover

0:00 - Tiba is a payment rail for software that pays people without asking a human to approve every transfer.

0:06 - The operator console shows the boundary: daily cap, hourly cap, recipients, work orders, and the kill switch.

0:36 - The demo submits two payout paths in the background: one clean delivery and one tampered request.

1:01 - Every payable amount starts as a registered work order. The AI can match delivery to approved work; it cannot invent a new payment.

1:36 - The ledger records both outcomes. A clean path becomes paid, while the adversarial path is refused.

2:06 - The red row shows the refusal reason. The model reading the evidence can be fooled, but the separate payer-record check blocks the mismatch.

2:26 - The paid row includes a public digest. The recipient can inspect the chain record instead of trusting our database.

2:41 - Back in the ledger, both the paid and refused outcomes stay visible as records with request IDs, reason codes, and receipt links.

2:52 - The proof is narrow on purpose: testnet only, SUI as the stand-in settlement asset, and GonkaRouter doing the load-bearing verification.
