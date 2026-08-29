# Decisions

Kept so the reasoning is visible to a judge, and so the same argument is not had twice.

## Scope

**In:** agent-to-human payouts — a machine pays a person with no approver in the loop.
**Out:** cross-border payout orchestration. Deel, SpherePay, Bridge and BVNK own that lane;
it is a licensing business before it is a software one, and the interesting part is
paperwork that cannot be demonstrated in five minutes.

## Why verification is multi-model

A payout cannot be un-made. One model returning "yes, the work was done" is an opinion with
no error bar. Several independent models, required to agree, give a signal — and the case
where they disagree is exactly the case a single model would have hidden. Disagreement
routes to a human rather than resolving by majority, because the expensive failure is paying
when it should not have paid.

## Why settlement is on-chain, on testnet

On-chain: instant, always on, and callable directly by software without a bank integration
or a money-transmitter licence.

Testnet: "Deploying smart contracts to mainnet using real funds during the hacking period"
is a verbatim disqualification ground in the MUBA rules. There is no mainnet path in this
repository.

## Controls, and why fail-closed

Every control refuses on ambiguity rather than allowing. An earlier prototype parsed stored
UTC timestamps as local time on UTC+8, so hourly caps silently never fired, and a
time-window check failed open. Both are the same class of bug: a control that does nothing
looks identical to a control that passes. Ambiguity is therefore a refusal.

## GonkaRouter — verified against the live API, 29 Aug 2026

Probed with a real key before writing any client code. These are observed, not read from docs.

- **Live models, exactly three:** `deepseek-ai/DeepSeek-V4-Flash-0731`, `moonshotai/Kimi-K2.6`,
  `MiniMaxAI/MiniMax-M2.7`. `zai-org/GLM-5.2-FP8` is not served by `/v1/models`; it is not
  a failover target.
- **`response_format: json_schema` is accepted** on `/v1/chat/completions` (200). Still parse
  defensively — one repair retry, then deny.
- **Request ID is the `x-request-id` response header** (`req-<nanos>-<n>`). This is what the
  receipt page shows as the Gonka request ID. There is also `x-devshard-id`.
- **Image input does NOT survive the router.** A Kimi call with an `image_url` content part
  returns 400. The artifact channel is text and links only. No screenshot OCR in scope.
- **Anthropic-compatible `/v1/messages` works** (200) with `x-api-key` + `anthropic-version`.
- **Three concurrent calls, one per model, all 200.** Latency 0.7s / 0.9s / 2.4s
  (DeepSeek / Kimi / MiniMax). No 429 at this concurrency.
