# Tiba Solana Devnet Threat Model

## Scope

This covers the server-side payout path: authenticated `POST /api/v1/intents` creates a payout intent, verifies a delivery claim against an open work order, applies limits, then sends Circle devnet USDC on Solana. It does not cover a production/mainnet wallet, browser-wallet deposits, or the retired alternate-chain code.

## Assets

- Treasury signing key and associated USDC account: `SOLANA_PRIVATE_KEY` and the derived keypair in `src/lib/rails/solana.ts`.
- Payout intents, work-order state, limits, and idempotency keys: `src/lib/payout-intent.ts`, `src/lib/policy.ts`, and `prisma/schema.prisma`.
- On-chain transaction signature and public receipt URL: `src/lib/rails/solana.ts` and `src/lib/payout-intent.ts`.
- Agent API key and owner/operator token hashes: `src/lib/agent-auth.ts`, `src/lib/operator-auth.ts`, and `prisma/schema.prisma`.

## Trust boundaries

- An agent submits an untrusted delivery artifact over the intents API; it is never treated as payment authority by itself.
- The operator token authorizes recipient, work-order, limits, and override actions.
- Gonka responses, Solana RPC responses, and the PostgreSQL database are external or persistence boundaries.
- The treasury key stays server-side; browser clients only submit signed wallet logins or deposit transactions.

## Threats, mitigations, and gaps

| Threat | Current mitigation | Gap |
|---|---|---|
| Signing-key theft or misuse | The rail reads the key only on the server, requires devnet, validates configured treasury address against the derived key, and uses a fixed devnet USDC mint by default (`src/lib/rails/solana.ts`). | A raw hot key remains an environment secret; there is no KMS, multisig, rotation procedure, or transaction-approval service. |
| Limit bypass | Per-payment, hourly, daily, count, kill-switch, work-order, recipient, and KYC checks run before debit; the debit is atomic (`src/lib/policy.ts`, `src/lib/payout-intent.ts`). | No independent alerting or operator notification when limits are approached or refused. |
| Replay or double pay | `idempotencyKey` is unique and checked before creation. The selected work order is conditionally claimed with `dischargedByIntentId: null` in the same transaction (`src/lib/payout-intent.ts`, `prisma/schema.prisma`). | If the process crashes after send but before persistence, reconciliation is manual; no durable outbox or chain-signature recovery worker exists. |
| Tampered or prompt-injected claims | Raw artifacts are stored and hashed. Two isolated prompts must produce the same work order, amount, and delivery time; disagreement refuses or holds (`src/lib/payout-intent.ts`, `src/lib/prompts.ts`, `src/lib/reconcile.ts`). | Model outputs remain a dependency. There is no deterministic document-signature or source-system attestation layer. |
| Receipt forgery | A paid record requires a returned transaction signature and explorer URL; the rail confirms the signature with Solana RPC before returning it (`src/lib/rails/solana.ts`). | The public receipt page trusts its database record and does not independently re-fetch or display transaction instruction details. |
| Operator-token theft | Operator routes use bearer-token verification against a stored hash (`src/lib/operator-auth.ts`); UI storage is session-scoped. | A stolen bearer token remains usable until replaced; there is no expiry, scoped role, MFA, or revocation audit trail. |
| RPC failure or deception | The rail checks devnet configuration, catches send/confirmation failures, and stores a refused failure result instead of marking payment paid (`src/lib/rails/solana.ts`, `src/lib/payout-intent.ts`). | A single configured RPC endpoint is trusted; there is no quorum, retry/reconciliation queue, or independent signature-status provider. |

## Required operational rule

Recipients lacking `solanaAddress` remain in the database but are refused with `RECIPIENT_NEEDS_SOLANA_ADDRESS` before inference or debit (`src/lib/rails/index.ts`, `src/lib/payout-intent.ts`).
