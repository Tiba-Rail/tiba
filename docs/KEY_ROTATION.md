# Devnet treasury key rotation

The signing key is a hot environment secret. There is no KMS or multisig. Rotate it when the key may have leaked, when an operator or machine that held it is gone, on a regular cadence (at least once per Colosseum week while it stays hot), and before discarding any environment that stored it.

This procedure is **devnet only**. `scripts/rotate-key.mjs` refuses to run unless `SOLANA_NETWORK=devnet`.

## Six steps

1. **Freeze new payouts.** Turn the kill switch on so nothing signs with the old key while you rotate.

2. **Generate the new key.** From the app directory, with `SOLANA_NETWORK=devnet` already set:

   ```
   node scripts/rotate-key.mjs
   ```

   It prints the new public key and writes the secret once to a local file under `.secrets/` with mode 600. It does not print the secret. Keep that file off chat, tickets, and git.

3. **Give the new address fee SOL.** Airdrop a little devnet SOL to the printed public key so later payouts can pay fees. The USDC mint does not cover lamports.

4. **Move remaining devnet USDC** from the old key to the new public key with the existing rail, while env still has the **old** `SOLANA_PRIVATE_KEY` and `SOLANA_ADDRESS`:

   ```
   npm run solana:smoke -- <NEW_PUBLIC_KEY>
   ```

   Set `SOLANA_SMOKE_AMOUNT_MICROS` to the remaining balance in micros (6 decimals; 1 USDC = 1000000). That path is `solanaRail.send` in `src/lib/rails/solana.ts`: memo plus USDC `transferChecked`. Confirm the printed explorer link on Solana Explorer (devnet) before you retire the old key. Repeat if you need to drain a leftover dust amount.

5. **Point env at the new key.** Set:

   ```
   SOLANA_NETWORK=devnet
   SOLANA_ADDRESS=<new public key>
   TREASURY_ADDRESS=<same public key>
   SOLANA_PRIVATE_KEY=<JSON byte array from the file in step 2>
   ```

   Do not log the private key. Then:

   ```
   node scripts/rotate-key.mjs --verify
   ```

   That must print that the configured treasury address matches the derived key. The app also fails on boot and at send time if `TREASURY_ADDRESS` or `SOLANA_ADDRESS` does not match the key.

6. **Unfreeze.** Turn the kill switch off. After a paid test payout from the new key, shred or delete the old key file. Leave the new `.secrets/` file only on the operator machine, or move it into the secret store and delete the file.

## What public receipts show

- Receipts already marked Paid keep their transaction signature and explorer URL. Those transfers were signed by the old key and stay valid on chain.
- Receipts in `pending_confirmation` show the signature and "Pending confirmation". They are not Paid until two RPCs confirm, including across a rotation.
- New payouts after step 5 are signed by the new key. Receipts still show the transfer signature, not which treasury key signed, and not the key file path.
