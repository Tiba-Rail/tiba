# Day 1 decisions

- **Database:** The requested Day 1 setup uses SQLite through Prisma, because the immediate task explicitly says there is no Postgres yet. The datasource provider and `DATABASE_URL` are the only schema-level changes needed to move to Postgres; the raw policy debit is intentionally standard SQL with SQLite-specific timestamp parameters isolated in `policy.ts`.
- **Sixth model:** The supplied data-model list names five models but requires six. `Artifact` is the sixth model: it preserves the raw untrusted artifact and SHA-256 independently of the intent, as the pipeline requires.
- **Networks:** This repository contains no mainnet path. Settlement is a deterministic mock rail on Day 1; Sui testnet is deferred to Day 3.
- **Gonka artifacts:** The verified router behavior means artifacts are text and links only. No image payload is sent to the router.

# Day 3 decisions

- **Sui settlement transport:** Tiba uses `@mysten/sui` `2.27.1` with `SuiGraphQLClient` against `https://graphql.testnet.sui.io/graphql`. JSON-RPC fullnode helpers are not used.
- **Testnet only:** Sui settlement hard-fails unless `SUI_NETWORK` is exactly `testnet`. There is no mainnet branch or fallback.
- **Demo asset:** Until testnet USDC is funded, `SUI_USDC_TYPE` stays unset and the Sui rail transfers `0x2::sui::SUI`. For this demo only, `1` payout micro-unit maps to `1` MIST. Once Circle testnet USDC is available, `SUI_USDC_TYPE` selects that coin type without changing the rail interface.
- **Batch settlement:** `batch()` builds one programmable transaction block with one transfer command per payout. The SDK's `CoinWithBalance` resolver groups same-type payouts into a combined split before execution.
- **First live Sui testnet payout:** `1_000_000` MIST was transferred to the configured settlement address on Sui testnet. Digest: `Cz2DWU6hQQfRQ1JCCDP3qw27XGD5P2MSEJw5Y6W87wpE`. Explorer: `https://suiscan.xyz/testnet/tx/Cz2DWU6hQQfRQ1JCCDP3qw27XGD5P2MSEJw5Y6W87wpE`.
- **Settlement failure behavior:** Rail failures throw typed `PayoutRailError`s. The intent and override settlement paths record `RED: SETTLEMENT_FAILED` and clear digest/explorer fields instead of marking an intent paid without a digest.
