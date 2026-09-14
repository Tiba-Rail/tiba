# Tiba Standard QA

## Decision

PASS for the requested Omega-standard implementation, visual review, regression checks, and fresh preview. The browser-local demo boundary is recorded below rather than presented as live payment enforcement.

## Visual QA

- PASS — Home, Permissions, Receipts, Verify, and Developers use Omega's off-white surface, serif display type, cobalt accent, thin rules, restrained cards, and button treatment.
- PASS — Desktop and 400 px views were checked against the Omega home. Paired comparison sheets place the home beside every new route; no new page looked like the rejected plain standalone page.
- PASS — Desktop navigation now resets its horizontal scroll when the viewport expands. This fixed the clipped desktop navigation found during resize testing.
- PASS — Every saved image is less than 2,500 px tall.

## Flow QA

- PASS — A person can enter a plain-English instruction, review scope, budget, and expiry, confirm it, sign it in the browser, see the signed values, and revoke it.
- PASS — Changing a reviewed instruction or expiry invalidates the review, so the signed record uses the reviewed snapshot rather than a later value.
- PASS — A generic money permission without a named counterparty is blocked. An instruction that names the recipient remains available for signing.
- PASS — Receipts list and expand. All four demo receipts were opened, and the signed USDC receipt's Solana devnet explorer link was opened successfully.
- PASS — The real receipt verifies. A deliberately altered receipt fails with `TIBA_SIGNATURE_INVALID`.
- PASS — Existing wallet and demo-send paths behave as before. The send action remains disabled without the owner key; no transaction was sent.
- PASS — The twelve shared navigation links were clicked: Home, Send, Permissions, Receipts, Verify, Activity, Invoices, Recipients, Limits, Developers, Sign in, and Create wallet.

## Reliability and responsive QA

- PASS — Browser console errors: 0 across the tested flows.
- PASS — Hydration warnings in new disclosure panels were fixed.
- PASS — At 400 px, each reviewed route had `scrollWidth` equal to `clientWidth`; there was no root horizontal layout break.
- PASS — `npm run typecheck`, `npm test` (38/38), and `npm run build` passed.
- PASS — In `C:\Users\diony\dev\tiba-mandate`, JavaScript (27), Python (9), and interop (2) test suites passed.

## Known boundary

NOT LIVE ENFORCEMENT — Signed permission slips, revocation, and receipt fixtures live in the browser-local Standard demo. They do not yet drive the existing server-backed wallet send path. This is stated in the UI; the existing send behavior was deliberately preserved and regression-tested.

## Fresh preview

- URL: https://tiba-pecf4ykxa-kroevasuperadmins-projects.vercel.app
- Vercel deployment: `dpl_Cv7s1u17NEtrgufQK39YRWX4woWi`
- Target/status: `preview` / `Ready`
- No production deployment, domain, DNS change, or git push was made.

## Screenshot paths

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
