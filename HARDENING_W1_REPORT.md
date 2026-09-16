# Hardening week 1

Tiba on Solana devnet now needs two independent RPCs before it calls a payout paid, and it has a documented way to rotate the hot signing key. Nothing was merged, pushed, or deployed. Devnet is still the only rail.

## What changed

The rail reads `SOLANA_RPC_URLS` (comma-separated, first is primary). `SOLANA_RPC_URL` still works as a single URL. Send uses the primary and moves to the next URL on network or HTTP 5xx errors. After send, every configured URL is asked `getSignatureStatuses`. Two confirmed or finalized answers mark the intent Paid. One answer stores `pending_confirmation` with the signature and explorer link. Zero answers still refuse, as today. `scripts/reconcile.mjs` re-asks pending intents later. A single configured RPC cannot mark paid.

`scripts/rotate-key.mjs` generates a new devnet keypair, writes the secret once to a local `.secrets/` file (mode 600), and prints only the public key plus the env lines to change. `--verify` checks `TREASURY_ADDRESS` / `SOLANA_ADDRESS` against the derived key. Boot and send fail if they disagree. `docs/KEY_ROTATION.md` is the six-step procedure, including moving leftover devnet USDC with the existing rail / `solana:smoke` path.

## What an operator does now

Set two RPC URLs in `SOLANA_RPC_URLS`. Run `node scripts/reconcile.mjs` for anything stuck pending. To rotate: kill switch on, generate, move USDC, update env, `--verify`, kill switch off.

## What the public sees

Paid receipts are unchanged. A transfer that only one RPC has confirmed shows "Pending confirmation" and the explorer link, not Paid. During a key rotation, old Paid receipts keep their signatures. New ones are signed by the new key. Receipts never show the secret, the key file, or which treasury key signed.

## Verification

Branch `hardening-w1`, commit `e25712e25832e2fdfaf5b93c038404e03ac53086`.

- `npm run typecheck`: clean
- `npm test`: 57/57 pass (about 34s). New coverage: both RPCs confirm -> paid; one confirms -> pending; primary send fails -> fallback send; all fail -> `SOLANA_EXECUTION_FAILED`; treasury address mismatch; rotate-key refuses non-devnet.

## Still open from THREAT_MODEL.md

- Hot key in env: no KMS, multisig, or transaction-approval service
- No alerting when limits are approached
- Crash after send before persist: no durable outbox
- Model outputs remain a dependency
- Public receipt page still trusts its database record
- Stolen operator bearer token stays usable until replaced
