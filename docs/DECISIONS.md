# Day 1 decisions

- **Database:** The requested Day 1 setup uses SQLite through Prisma, because the immediate task explicitly says there is no Postgres yet. The datasource provider and `DATABASE_URL` are the only schema-level changes needed to move to Postgres; the raw policy debit is intentionally standard SQL with SQLite-specific timestamp parameters isolated in `policy.ts`.
- **Sixth model:** The supplied data-model list names five models but requires six. `Artifact` is the sixth model: it preserves the raw untrusted artifact and SHA-256 independently of the intent, as the pipeline requires.
- **Networks:** This repository contains no mainnet path. Settlement is a deterministic mock rail on Day 1; Sui testnet is deferred to Day 3.
- **Gonka artifacts:** The verified router behavior means artifacts are text and links only. No image payload is sent to the router.
