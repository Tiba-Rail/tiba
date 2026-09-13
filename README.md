# Tiba

Tiba authorizes software payouts against approved work orders. Two independent verification channels must agree on the work order and amount before Tiba applies spending policy and settles devnet USDC on Solana.

## Settlement

Solana devnet is the only settlement rail. Tiba transfers Circle devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) to a recipient's saved Solana address. A recipient without one is retained but cannot be paid until an operator adds a valid Solana address.

Required settlement configuration:

```env
SOLANA_NETWORK=devnet
SOLANA_ADDRESS=<treasury public key>
SOLANA_PRIVATE_KEY=<Solana CLI keypair JSON byte array>
```

The app refuses a non-devnet rail, invalid recipient address, missing treasury key, or failed transaction. Public receipts link to Solana Explorer.

## Local development

```bash
npm install
npm run dev
```

Use `.env.example` as the configuration template. Never commit a private key or database URL.

## Verification

```bash
npm run typecheck
npm test
```

GitHub Actions is the branch build and test gate.

## History

Tiba previously used Sui testnet during the MUBA hackathon track; that settlement path was retired on 11 September 2026.

## Legacy records and rollback

Historical Sui receipts remain readable with their stored digest, Suiscan URL and network label. No Sui address is deleted or repointed. The following retained recipients are intentionally not payable until an operator saves a valid Solana address: `ali-sui`, `creator-lagos`, `translator-kl`, `r-b91e5bd8`, `owner-0b0b365e`, `owner-26fdc704`, `owner-659264d3`, `owner-793c4dce`, and `owner-c0ea67b6`.

Deployment reference: apply `prisma/migrations/20260913000000_add_solana_rail/migration.sql` by reviewed database change before deploying this branch. Rollback reference: `origin/master` at `7c1df08`; the enum addition is additive, so rolling application code back does not require dropping database data.
