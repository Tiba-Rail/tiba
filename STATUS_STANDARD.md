# Tiba Standard status

## Result

Tiba Standard is integrated on `tiba-standard` while preserving the Tiba Omega visual system. A new Vercel preview is Ready.

## Branch and commits

- Branch: `tiba-standard`
- Omega baseline: `de7ccc6c1ee599978f4c892b8f07576f8dc71c19`
- Feature commit: `7d7ca21 feat: bring Tiba standard into Omega`
- Deploy-exclusion commit: `36b65ed chore: exclude local operator artifacts from deploys`
- No git remote was pushed. No production deployment, domain, or DNS setting was changed.

## Delivered

- Native Omega home copy and routes for Permissions, Receipts, Verify, and Developers.
- Human-confirmed permission slips with plain-English instructions, scope, budget, expiry, browser Ed25519 signing, signed-state display, and local revocation.
- Four signed demo receipts with expandable details and the signed USDC transfer's Solana devnet explorer link.
- Browser-safe receipt verification. The real fixture passes; a tampered fixture fails with `TIBA_SIGNATURE_INVALID`.
- Developer specification, schemas, and AP2, x402, Visa TAP, MCP, and A2A positioning.
- Mobile navigation reset after viewport resizing, and hydration fixes for the new disclosure panels.

## Final verification

- `npm run typecheck`: passed.
- `npm test`: passed, 38 of 38 tests.
- `npm run build`: passed.
- `C:\Users\diony\dev\tiba-mandate`: `npm run test:js` passed 27 tests, `npm run test:py` passed 9 tests, and `npm run test:interop` passed 2 tests.
- Browser QA: all shared navigation links, the existing demo-wallet/send flow, permission draft-review-sign-revoke, all receipt disclosures, real/tampered verification, and developer disclosures passed with zero console errors.
- At 400 px, Home, Permissions, Receipts, Verify, and Developers had no root horizontal overflow. All saved screenshots are below 2,500 px tall.
- Paired visual-comparison sheets put the Omega home beside each new route at both widths.

## Preview

- URL: https://tiba-pecf4ykxa-kroevasuperadmins-projects.vercel.app
- Deployment: `dpl_Cv7s1u17NEtrgufQK39YRWX4woWi`
- Target/status: Vercel `preview`, `Ready`, confirmed with `vercel inspect`.
- The linked project is `tiba`; the production alias and `tiba-rizqey` project were not touched.

## Scope boundary

The Standard permission and receipt fixtures are a browser-local demo. They do not alter the existing wallet's server-backed send behavior. The existing wallet/demo flow was regression-smoke-tested without sending a transaction.

## Screenshots

- `shots/standard/home-1280.png`
- `shots/standard/home-400.png`
- `shots/standard/permissions-1280.png`
- `shots/standard/permissions-400.png`
- `shots/standard/receipts-1280.png`
- `shots/standard/receipts-400.png`
- `shots/standard/verify-1280.png`
- `shots/standard/verify-400.png`
- `shots/standard/developers-1280.png`
- `shots/standard/developers-400.png`
- `shots/standard/compare-home-permissions-1280.png`
- `shots/standard/compare-home-permissions-400.png`
- `shots/standard/compare-home-receipts-1280.png`
- `shots/standard/compare-home-receipts-400.png`
- `shots/standard/compare-home-verify-1280.png`
- `shots/standard/compare-home-verify-400.png`
- `shots/standard/compare-home-developers-1280.png`
- `shots/standard/compare-home-developers-400.png`
