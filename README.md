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
