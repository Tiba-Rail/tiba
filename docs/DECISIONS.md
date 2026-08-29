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
