# Copy map — wallet language pass (`wallet-language` branch)

Every user-facing string audited in `src/app/**/*.tsx`, `src/app/console/types.ts`,
`src/app/console/use-agent-tools.ts` and `src/components/**/*.tsx`.
Columns: file | current | new. Rows marked **KEEP** were deliberately left unchanged
(routes, data, reason codes, proof surface). A2A (`src/app/a2a/route.ts`) is a
machine-facing JSON-RPC endpoint — left untouched by design.

## src/components/site-nav.tsx

| current | new |
|---|---|
| Nav order: Payments, Jobs, People, Rules & limits, History, Console | Send, Activity, Payments, Invoices, Recipients, Limits |
| "Console" (/console) | "Send" |
| "History" (/ledger) | "Activity" |
| "Payments" (/intents) | KEEP |
| "Jobs" (/work-orders) | "Invoices" |
| "People" (/recipients) | "Recipients" |
| "Rules & limits" (/policies) | "Limits" |

## src/app/page.tsx (landing)

| current | new |
|---|---|
| "A wallet for software · test network" (hero eyebrow) | KEEP |
| "A wallet your software can pay people from." (h1) | KEEP |
| Hero lede | KEEP |
| "Try a test payment" | "Send a payment" |
| "See every decision" | "See activity" |
| "Measured on the test-network pilot" | "Measured on the test network" |
| "honest notes paid" / "tampered notes refused" / "false refusals" / "per decision" | KEEP |
| "How a payment gets checked" | KEEP |
| "A program acting for the payer submits a delivery note for a job." | "Your software submits a delivery note for an invoice." |
| "…one the payer's own record." | "…one your own records." |
| "Same job and same amount from both: paid…" | "Same invoice and same amount from both: paid…" |
| "…limits a human sets and an agent can only read: a per-payment ceiling, hourly and daily spending limits, an allowlist of who may be paid, and a kill switch." | "…limits you set and your software can only read: a per-payment ceiling, hourly and daily spending limits, a list of saved recipients, and a freeze." |
| "Paid to the wallet you already have." | KEEP |
| "A real example, from this pilot" | "A real example" |
| "Refused" / "Paid" pills, "Reason code …", "Open receipt →", "Transaction", "Check references", "View on test network" | KEEP (proof surface) |
| "No paid example yet. Send a test payment from the console." | "No paid example yet. Send a payment from Send." |
| Footer "Tiba · Test network only — no real money moves yet · source" | KEEP |

## src/app/console/page.tsx + console-client.tsx (/console → "Send")

| current | new |
|---|---|
| "Nothing is set up yet" / "This workspace has no paying program yet." | KEEP title / "This wallet has no software attached yet." |
| eyebrow "Console" | "SEND" |
| "Send a payment. Watch it decide." | "Send a payment" |
| "Pick a delivery note, send it, and see whether Tiba pays or refuses — and why." | "Pick a delivery note, send it, and watch Tiba pay or refuse — and say why." |
| "Operator key" | "Owner key" |
| "Set by whoever runs this deployment. Kept in this tab only." | "Set by whoever owns this wallet. Kept in this tab only." |
| "Send a test payment" (heading) | "New payment" |
| "Pay" (recipient select label) | KEEP |
| Preset "Honest note" | "Genuine delivery note" |
| Preset "Note that tries to trick the check" | "Note with a hidden instruction" |
| Preset "Inflated amount" | KEEP |
| Preset "Unknown work order" | "Unknown invoice" |
| Preset note bodies (incl. "Work order: WO-13", injection text) | KEEP (data sent to the checks) |
| "The first should be paid. The other three should be refused. That is the point." | "The first should be paid. The other three should be refused." |
| "Delivery note" | KEEP |
| "Send test payment" (button) | "Send payment" |
| "Checking… usually about 13 seconds, up to a minute" | KEEP |
| "Enter the operator key above to send." | "Enter the owner key above to send." |
| "View transaction" / "Open receipt" | KEEP |
| "See in history" | "See in activity" |
| "What an AI assistant may do here (WebMCP)" | "What an AI assistant may do here" |
| Capability rows: "List jobs" | "List invoices" |
| "List people" | "List recipients" |
| "Read spending limits" | KEEP |
| "Ask to pay someone" | KEEP |
| "Read the last decision" | KEEP |
| "Read history" | "Read activity" |
| Scope "Operator key" (×2) | "Owner key" |
| "Approve a payment by hand" | "Approve a payment" |
| "Change a limit or the approved list" / "Only a human with the operator key" | "Change a limit or the saved recipients" / "Only you, with the owner key" |
| "Turn the emergency stop on or off" | "Turn the freeze on or off" |
| "Checking this browser…" / support sentences / "Recent AI actions" / "None yet." | KEEP |
| Card title `{budget.agentName}` ("Tiba pilot agent") | "Your software's spending" |
| "Daily limit …", "Today", "This hour" | KEEP |
| "Kill switch" (card eyebrow) | "Freeze" |
| "ON — refusing everything" / "OFF" | KEEP |
| "Stop all payments" | "Freeze wallet" |
| "Allow payments again" | "Unfreeze" |
| "While on, every payment is refused before any check runs." | "While frozen, every payment is refused before any check runs." |
| Panel "Jobs" / "N open work orders." / "Manage work orders →" | "Invoices" / "N awaiting delivery." / "See invoices →" |
| Panel "People" / "N people may be paid." / "Manage people →" | "Recipients" / "N saved." / "See recipients →" |
| "Waiting for a human" | "Needs your approval" |
| "Nothing waiting." | KEEP |
| "Approve by hand" | "Approve" |
| "Saved." / "Sent. Result below." / "Reason code …" | KEEP |

## src/app/console/use-agent-tools.ts (WebMCP tool descriptions — agent-facing copy)

| current | new |
|---|---|
| "List the open work orders an agent may pay against. A payment must match exactly one of these by ref and amount." | "List the invoices awaiting delivery that your software may pay against. A payment must match exactly one of these by ref and amount." |
| summary "Listed N work orders" | "Listed N invoices" |
| "List recipients on the allowlist. Only these can be paid." | "List saved recipients. Only these can be paid." |
| "Read the agent's spending caps and current usage. The agent cannot change these." | "Read the software's spending limits and current usage. Your software cannot change these." |
| summary "Retrieved budget for …" | KEEP |
| submit_payment description "…the work order and amount; if they disagree the payment is refused and the agent cannot override that." | "…the invoice and amount; if they disagree the payment is refused and the software cannot override that." |
| "A human must paste the operator token into the console before any payment can be attempted." (×2) | "Paste the owner key into Send before any payment can be attempted." |
| "Failed: Operator token not set" (×2) | "Failed: Owner key not set" |
| "Get the result of the most recent payment attempt." | KEEP |
| "Get the payment ledger history." | "Get the payment history." |
| "Retrieved ledger" | "Retrieved activity" |
| Tool names (`list_work_orders`, `list_recipients`, `get_budget`, `submit_payment`, `get_last_decision`, `list_ledger`) | KEEP (API identifiers) |
| sessionStorage key `tiba_operator_token` | KEEP (storage key, not copy) |

## src/app/console/types.ts (shared decision copy)

| current | new |
|---|---|
| decisionWord AMBER → "HELD" | "NEEDS APPROVAL" |
| decisionSentence AMBER → "Held — waiting for a human" | "Needs approval" |
| "…your rules require a human to decide." | "…your limits require you to decide." |
| "…so the payment is held for a human." (×5) | "…so the payment is held for approval." |
| "Held for a human." | "Held for approval." |
| "The two checks named different jobs…" | "…different invoices…" |
| "…take the program past its daily/hourly spending limit…" (×2) | "…take your software past its daily/hourly spending limit…" |
| "The program has already made its maximum number of payments today/this hour…" (×2) | "Your software has already made its maximum number of payments today/this hour…" |
| "…more than this job allows…" | "…more than this invoice allows…" |
| "The job named has passed its deadline…" / "The job named is closed…" | "The invoice named has passed its deadline…" / "The invoice named is closed…" |
| "There is no open job matching this delivery note…" | "There is no invoice awaiting delivery matching this delivery note…" |
| "This person is not on the approved list…" | "This recipient is not saved…" |
| "This person is on the approved list but blocked…" | "This recipient is saved but blocked…" |
| "This person's identity has not been checked, and your rules require it…" | "This recipient's identity is not verified, and your limits require it…" |
| "The emergency stop is on…" | "The wallet is frozen…" |
| humanError: "Wrong operator key." / "Enter the operator key first." (×2) | "Wrong owner key." / "Enter the owner key first." |
| "This one cannot be approved by hand." | "This one cannot be approved." |
| "That person is not on the approved list." | "That recipient is not saved." |
| "The payer record is not valid JSON." | "Your record is not valid JSON." |
| workOrderStatusWord: "Open" / "Closed" / "Expired" / "Closed" | "Awaiting delivery" / "Closed" / "Expired" / "Paid" |
| disagreementLine "Reader A (the delivery note) saw job … Reader B (the payer's record) saw job …" | "Check 1 (the delivery note) saw invoice … Check 2 (your own records) saw invoice …" |
| Reason codes, PAID/REFUSED pills | KEEP |

## src/app/recipients/* (/recipients)

| current | new |
|---|---|
| eyebrow "People" | "RECIPIENTS" |
| "Who the program may pay" | "Saved recipients" |
| "The approved list. The program cannot pay anyone who is not on it." | "Your software can only send to people saved here." |
| "Approved people" | "Recipients" |
| "Nobody yet. Add the first person below." | "No recipients yet. Add the first one below." |
| "can be paid" | "ready" |
| "blocked" | KEEP |
| "ID {ref}" / "Wallet {addr}" | KEEP |
| "Identity checked" | "Verified" |
| "Identity check failed" | "Verification failed" |
| "Identity not checked" | "Not verified" |
| "checked by {provider}" / "no identity check yet" / "valid until" | "verified by {provider}" / "not verified yet" / "valid until" |
| "Run identity check" | "Verify identity" |
| "Checking…" | KEEP |
| "Add a person" | "Add recipient" |
| "Add person" (button) / "Adding…" | "Save recipient" / "Saving…" |
| success "Person added." | "Recipient saved." |
| "Identity check done." | "Identity verified." |
| "Short ID (e.g. translator-kl)" / "Name" / "Wallet address (test network)" | KEEP |
| "Connect wallet" / "Address from your connected wallet…" / "Use a different address" | KEEP |
| "Get paid to the wallet you already have. … any other Sui wallet." | "Get paid to the wallet you already have. Connect it and the address fills in — no copying. Works with Slush, Suiet, OKX, Bitget, Nightly, Backpack and other compatible wallets." |

## src/app/work-orders/* (/work-orders → "Invoices")

| current | new |
|---|---|
| eyebrow "Jobs" | "INVOICES" |
| "What the program may pay for" | "Invoices you've approved" |
| "Every job that is still open for payment. Adding one here pays nobody. It only makes a payment possible." | "Your software can pay against these, up to the amount on each. It can never invent an amount." |
| "Job added." | "Invoice added." |
| "Open jobs" | "Awaiting delivery" |
| Headers "Job ID" / "Paid to" / "Maximum" / "Open until" / "Status" | "Invoice" / "Recipient" / "Maximum" / "Open until" / "Status" |
| "No jobs yet. Add the first one below." | "No invoices yet. Add the first one below." |
| WO-13 / WO-9999 reference codes | KEEP (data) |
| "Add a job" | "Add invoice" |
| "Job ID (e.g. WO-14)" | "Invoice ID (e.g. WO-14)" |
| "Paid to" (select) | "Recipient" |
| "Maximum payment (USDC)" | "Maximum amount (USDC)" |
| "Who must confirm before paying" → "The payer's record only" / "Both checks" / "A human" | "What must pass before paying" → "Your own records only" / "Both checks" / "You" |
| "What the job is" | "What the invoice is for" |
| "The payer's own record of this job (JSON)" | "Your own record of this invoice (JSON)" |
| "Amounts are in millionths…" | KEEP |
| "Add job" / "Adding…" | "Add invoice" / "Adding…" |

## src/app/ledger/page.tsx (/ledger → "Activity")

| current | new |
|---|---|
| eyebrow "History" | "ACTIVITY" |
| "Every decision" | "Every payment and every refusal" |
| (no lede) | "Refusals are shown beside payments, because a refusal is Tiba working." |
| Headers "Result" / "When" / "Paid to" / "Amount" / "Why" / "Check references" / "Transaction" | KEEP, except "Paid to" → "To" |
| "Nothing yet. Send a test payment from the console and it will appear here." | "Nothing yet. Send a payment and it will appear here." |
| "Reader A (the delivery note) saw job …" / "Reader B (the payer's record) saw job …" / "They disagreed, so Tiba refused." | "Check 1 (the delivery note) saw invoice …" / "Check 2 (your own records) saw invoice …" / "They disagreed, so Tiba refused." |
| "Receipt →" / check refs A/B / digest link / reason codes | KEEP (proof surface) |
| Status pills PAID / REFUSED / HELD | PAID / REFUSED / NEEDS APPROVAL (via decisionWord) |

## src/app/policies/* (/policies → "Limits")

| current | new |
|---|---|
| "Nothing is set up yet" / "This workspace has no paying program yet." | KEEP / "This wallet has no software attached yet." |
| eyebrow "Rules & limits" | "LIMITS" |
| "Limits the program cannot get past" | "Spending limits" |
| "Spending limits, the approved list, the emergency stop and the identity check. The program can read them. Only a human can change them." | "Set once by you. Your software can read these and never change them." |
| Card "Spending limits" / "Today" / "This hour" | KEEP |
| Card "Approved people" | "Saved recipients" |
| "N of M may be paid" | "N of M ready" |
| "Manage people →" | "See recipients →" |
| Card "Kill switch" | "Freeze" |
| "ON — all payments refused" / "OFF" | KEEP |
| "Stop all payments" / "Allow payments again" | "Freeze wallet" / "Unfreeze" |
| "While on, every payment is refused before any check runs." | "While frozen, every payment is refused before any check runs." |
| "You can also do this from the console." | "You can also do this from Send." |
| "Identity check before paying" | KEEP |
| "When required, anyone without a current identity check is refused…" | KEEP |
| "Require identity check" / "Stop requiring identity check" | "Require verification" / "Stop requiring verification" |
| "Uses the operator key typed in the Kill switch box. See who is checked under People." | "Uses the owner key typed in the Freeze box. See who is verified under Recipients." |
| "Saving…" / "Saved." | KEEP |

## src/app/intents/page.tsx (/intents → "Payments")

| current | new |
|---|---|
| eyebrow "Payment attempts" | "PAYMENTS" |
| "Every payment, start to finish" | "Payments" |
| "Every payment the program has tried to make, grouped by what happened. Open one to read its receipt." | "Every payment your software asked to make." |
| Groups "Paid" / "Refused" | KEEP |
| "Approved but the transfer failed" | KEEP |
| "Waiting for a human" | "Needs approval" |
| "None yet." / "ID {ref}" | KEEP |

## src/app/r/[token]/page.tsx (receipt)

| current | new |
|---|---|
| "Receipt — anyone with this link can read it" | KEEP |
| decisionSentence h1 | via types.ts ("Needs approval" for held) |
| "Amount" / "Amount asked for" | KEEP |
| "Paid to" | KEEP |
| "Would have paid" | "To" |
| "Why" / "Reason code …" / "Left to spend today (live)" | KEEP |
| "How this decision was made" / "Step / Result / Detail" | KEEP |
| "Reader A — read the delivery note" | "Check 1 — read the delivery note" |
| "Reader B — read the payer's own record" | "Check 2 — read your own records" |
| "Did the readers agree?" | "Did both checks agree?" |
| "Your rules" | "Your limits" |
| "Identity check" | KEEP |
| "Money sent?" | "Payment" |
| "Model used:", Gonka request-ID links, fallback line, "Took:", "view on Sui test network", "Not run / Same answer / Different answer / Yes / No / Blocked / Passed / Not required / Never reached / Not checked / Tried and failed / Not tried" | KEEP (proof surface) |
| "This reader was not run." (×2) | "This check was not run." |
| "Reader cost basis (GNK/USD)" | "Verification cost (GNK/USD)" |
| "price not available" | KEEP |
| "See all payments →" | "See all activity →" |

## src/components/*

| file | current | new |
|---|---|---|
| operator-token-field.tsx | "Operator key" | "Owner key" |
| operator-token-field.tsx | "Set by whoever runs this deployment. Kept in this tab only." | "Set by whoever owns this wallet. Kept in this tab only." |
| denial-banner.tsx | "Held — waiting for a human" | "Needs approval" |
| denial-banner.tsx | "Refused — Tiba decided not to pay" | KEEP |
| router-health-strip.tsx | "Checks · none run yet" / "Checks online" | KEEP |
| wordmark.tsx / sigma-mark.tsx / sui-providers.tsx | brand, no copy | KEEP |

## src/app/layout.tsx + metadata

| current | new |
|---|---|
| Root title "Tiba — a wallet for software" + description | KEEP |
| (no per-page titles) | /console "Send - Tiba"; /ledger "Activity - Tiba"; /intents "Payments - Tiba"; /work-orders "Invoices - Tiba"; /recipients "Recipients - Tiba"; /policies "Limits - Tiba"; /r/[token] "Receipt - Tiba" |
