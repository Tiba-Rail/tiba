# Council amendments to YC_STUDY.md (8 seats, 6 Sep 2026 09:08)

Verdicts: first screen APPROVE 7/8 · Send flow APPROVE 5/8 (2 want amount adjustable - deferred, see below) · merge /intents into /ledger YES 7/8.

## Amendment 1 - "Add funds" screen (3 seats: a wallet must let the owner put money in)
New route `/fund` ("Add funds"), reachable from Home ("Add funds" secondary link next to the balance) and from Limits. Contents:
- Current balance of the settlement account (read from the existing balance source used by the console spending card) and the account address, truncated + copy button + QR code (render with a tiny inline SVG QR or a data-URI; no new heavy dependency - `qrcode` npm is acceptable if already transitively present, else draw with a small pure-TS QR encoder file).
- "Deposit from your wallet": uses the already-installed @mysten/dapp-kit. ConnectModal (existing pattern on /recipients) -> amount input (SUI, testnet) -> `useSignAndExecuteTransaction` building a `Transaction` that `splitCoins` + `transferObjects` to the settlement address -> success line with the digest link on suiscan testnet. Wallet rejection is not an error: return to idle quietly.
- Testnet faucet link ("Get test SUI") for people without funds.
- Copy: "Add funds" / "Your agent can only spend what is here, within your limits." Never say real money.
This is client-side signing only; no API or schema changes.

## Amendment 2 - the human "Approve anyway" already exists
Held payments ("Needs your approval" on Send) already have an Approve action. Keep it; surface it on Home's attention strip and in Activity's Pending filter. Do not build a second-check UI - the checks are automated by design.

## Deferred (not for this build)
- Adjustable amount / partial payments (2 seats): the invoice amount is the cap by design; revisit after the pitch season.
- Onboarding / "link your agent" step (1 seat): worthwhile; after the five screens.

## Build order (amended)
1 Send result -> 2 Home -> **2b Add funds** -> 3 Send steps -> 4 Activity (+ Pending filter, /intents merge) -> 5 Limits + nav.
