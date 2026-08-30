# 5-Minute Pitch Deck

## Slide 1 -- Cold Open

Slide text:
Software is ready to pay people.
The dangerous part is deciding when money may move.

On screen:
Slide.

Speaker line:
Everyone else built an AI that decides; Tiba decides what a deciding AI is allowed to spend.

## Slide 2 -- The Problem

Slide text:
Faris pays creators and contractors from a fixed budget.
Today the final approval is still a human queue.
At platform scale, delay becomes liability.

On screen:
Slide.

Speaker line:
The bottleneck is not moving money; it is trusting software with a bounded right to release it.

## Slide 3 -- The Boundary

Slide text:
Every payable amount starts as a registered work order.
Models can only match a delivery to that obligation.
Policy enforces caps, who can be paid, retries, and the kill switch.

On screen:
Slide, then the operator console.

Speaker line:
This is the rule: match, don't mint. The AI can match a delivery to work we already approved; it cannot invent a new amount to pay.

## Slide 4 -- Live Demo: Clean Pay

Slide text:
Clean evidence.
Two checks agree.
Sui testnet receipt appears.

On screen:
Operator console, then ledger.

Speaker line:
The clean path is about sixteen seconds, including roughly seven seconds of Sui testnet finality.

## Slide 5 -- Live Demo: Refusal

Slide text:
Tampered evidence asks for more money.
The evidence check and payer-record check disagree.
Red refusal: the amount does not match.

On screen:
Operator console, then ledger.

Speaker line:
The model reading the evidence can be fooled; the separate payer-record check never sees that attack.

## Slide 6 -- Public Receipt

Slide text:
Paid and refused outcomes are both records.
Receipt shows the rule that fired, AI call receipts, latency, remaining budget, and blockchain digest when paid.

On screen:
Public receipt page.

Speaker line:
The recipient does not need to trust my database; the receipt exposes the decision trail.

## Slide 7 -- Eval Table

Slide text:
| Scenario | Result |
| --- | --- |
| Clean paid | 20/20 |
| Adversarial refused | 10/10 |
| False refusals on clean | 0/20 |
| Mean latency | 13 s |

On screen:
Slide.

Speaker line:
Small, self-authored eval, but direct: clean paid, adversarial refused, and no clean false refusals.

## Slide 8 -- What We Cut

Slide text:
Cut: cross-border orchestration, KYC, mainnet, real USDC, image evidence.
Testnet only.
Settlement uses SUI as the USDC stand-in: 1 payout micro-unit maps to 1 MIST.

On screen:
Slide.

Speaker line:
We narrowed the proof so the judges can inspect the actual GonkaRouter and Sui path.

## Slide 9 -- Ask + Team

Slide text:
Ask: test the refusal boundary, receipts, and testnet digest.
Judge us on whether GonkaRouter is load-bearing.
Faris Irfan, Arthur Wong, Aariz Sajan -- Rizqey Labs.

On screen:
Slide, with the operator console, ledger, and public receipt ready.

Speaker line:
Jack and Rain, try the payment flow after the pitch; it stays testnet and keeps calling GonkaRouter.
