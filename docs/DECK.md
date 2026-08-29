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
Policy code enforces caps, allowlists, idempotency, and kill switch.

On screen:
Slide, then live app at `/console`.

Speaker line:
This is the rule: match, don't mint; no model output can create a payable amount.

## Slide 4 -- Live Demo: Clean Pay

Slide text:
Clean artifact.
Two channels reconcile.
Sui testnet digest appears.

On screen:
Live app at `/console`, then `/ledger`.

Speaker line:
The clean path is about sixteen seconds, including roughly seven seconds of Sui testnet finality.

## Slide 5 -- Live Demo: Refusal

Slide text:
Adversarial artifact asks for more money.
Artifact channel and payer-record channel disagree.
RED: `QUORUM_SPLIT:amount_micros`

On screen:
Live app at `/console`, then `/ledger`.

Speaker line:
The model reading the artifact can be fooled; the isolated payer-record channel never sees that attack.

## Slide 6 -- Public Receipt

Slide text:
Paid and refused outcomes are both records.
Receipt shows rule fired, request IDs, latency, remaining budget, digest when paid.

On screen:
Live app at `/r/<token>`.

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
Cut: cross-border orchestration, KYC, mainnet, real USDC, image payloads.
Testnet only.
Settlement uses SUI as the USDC stand-in: `1` micro == `1` MIST.

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
Slide, with `/console`, `/ledger`, and `/r/<token>` ready.

Speaker line:
Jack and Rain, hit the API after the pitch; it stays testnet and keeps calling GonkaRouter.
