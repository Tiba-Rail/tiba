# Tiba Security Review

- Auditor: Codex, gpt-5.6-luna, running the gstack CSO comprehensive checklist
- Date: 2026-09-13
- Scope: `solana-only` at `de7ccc6`, public repository `Tiba-Rail/tiba`, live `https://tiba-omega.vercel.app`

## Method

Phases 0–14 were reviewed: architecture and attack-surface census; git-history secrets archaeology; dependency and install-script review; GitHub Actions and deployment checks; webhook/integration checks; both Gonka model paths and prompt-injection data flow; OWASP Top 10; STRIDE against `THREAT_MODEL.md`; data classification; and safe active verification. I used code tracing and self-verification because no independent verifier tool was available. No production database writes, payouts, credential tests, deployments, or rotations were performed. Local `npm install`, `next build`, and `tsc` were not run; CI performed install, typecheck, and tests.

Architecture: Next.js App Router on Vercel, Prisma/Postgres, Solana devnet settlement through a server-side hot key, two isolated Gonka adjudication prompts, NextAuth wallet/social sign-in, bearer agent/operator APIs, and a Telegram webhook.

The local CSO JSON artifact is stored under `.gstack/security-reports/` and excluded from version control.

## Findings

| Issue | Severity | Status | Affected area | Fix commit |
|---|---|---|---|---|
| [#1](https://github.com/Tiba-Rail/tiba/issues/1) | High | Open — current-tree copy removed; history/credential action pending | `.env.prod:26`, commit `777b056` | [e112e95](https://github.com/Tiba-Rail/tiba/commit/e112e95) |
| [#2](https://github.com/Tiba-Rail/tiba/issues/2) | High | Fixed | `api/console/ledger`, intent override | [de7ccc6](https://github.com/Tiba-Rail/tiba/commit/de7ccc6) |
| [#3](https://github.com/Tiba-Rail/tiba/issues/3) | Medium | Open | Public server-rendered data pages | — |
| [#4](https://github.com/Tiba-Rail/tiba/issues/4) | Medium | Open | `.github/workflows/ci.yml:11-20` | — |
| [#5](https://github.com/Tiba-Rail/tiba/issues/5) | Medium | Accepted for devnet demo; open for production design | Anonymous Solana onboarding | — |
| [#6](https://github.com/Tiba-Rail/tiba/issues/6) | Medium | Open | Telegram-linked bearer keys | — |

Issue #2 was fixed with the shortest correct diff: ledger reads now filter by the resolved agent, and overrides load only intents belonging to that agent. GitHub Actions passed in [run 34730917619](https://github.com/Tiba-Rail/tiba/actions/runs/34730917619).

## Accepted risks

- The application uses a server-side devnet hot key without KMS/multisig; this is documented in `THREAT_MODEL.md` and mainnet was explicitly out of scope.
- Anonymous onboarding can consume bounded shared devnet allowance. It is retained as an intentional public demo flow; issue #5 must be resolved before a funded production rail.
- Artifact text remains untrusted user content in a user-message position. The two checks are separated, schema-constrained, and reconciled deterministically; no system-prompt injection or unsafe LLM output execution was found.
- GitHub Dependabot reports an open `bigint-buffer` high alert, but the reviewed advisory path is availability/DoS and was excluded by the CSO checklist without a proven non-DoS impact.

## Not covered

Credential revocation/rotation, public-history rewriting, Vercel project settings, provider audit logs, production database inspection, Telegram administration, mainnet custody, and a full penetration test were not performed. Active checks used only safe GETs, an invalid workspace POST that returned `400 NAME_REQUIRED`, and read-only Solana devnet RPC health.

This is an AI-assisted review, not a substitute for a professional penetration test.
