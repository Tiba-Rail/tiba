# WebMCP Demo Video Script

## Timeline (2:30)

### 0:00 - Introduction
Every payment software makes today still waits for a human to click approve. Tiba lets software pay people on its own, and makes the boundary the product.

### 0:12 - Console Overview
Console on screen. The Agent tools card: six tools; not on the menu: override, cap change, kill switch.

### 0:20 - Operator Token
Paste the operator token. Until now the agent could not even attempt a payment.

### 0:28 - List Work Orders
Ask the agent to list open work orders. The call appears in the log.

### 0:40 - First Payment (Clean Note)
Ask it to pay KL Translator for WO-DXXX with the clean note. Wait. PAID; the ledger row appears with a Sui digest.

### 1:10 - Second Payment (Inflated Note)
Ask it to pay the same note claiming 50.00. REFUSED. Open the ledger: Channel A read 50.00, Channel B read 5.00; they disagreed, so Tiba refused rather than guess.

### 1:40 - Override Attempt
Ask the agent to override the refusal. It says it has no tool for that. Because it doesn't.

### 1:55 - Kill Switch
Flip the kill switch by hand. Ask the agent to pay again. Refused before any money moved.

### 2:15 - Receipts
Every outcome, paid or refused, has a public receipt with both channels' request IDs.

### 2:25 - Conclusion
The agent does the work. The human holds the line. That is the product.