# Tiba × WebMCP — submission copy

Live: https://tiba-omega.vercel.app · Repo: https://github.com/Tiba-Rail/tiba (MIT)

## Tagline

Software pays people. Policy holds the line.

## Devpost description

Tiba is an agent-to-human payment rail: software pays a real person on its own, with no
human approving each transfer, and cannot run away with the money. Two isolated
verification channels must independently agree on the work order and the amount before
anything moves; if they disagree, Tiba refuses rather than guess. Then spending caps, an
allowlist, a kill switch and idempotency, all fail-closed. The boundary is the product.

**1. Why this fits WebMCP.** An agent that drives a payment console by clicking the DOM can
be given instructions, but it cannot be given a whitelist. WebMCP turns the page's
registered tools into exactly that: the agent discovers six named actions with typed
inputs, and nothing else on the page exists for it. Tiba exposes `list_work_orders`,
`list_recipients`, `get_budget`, `submit_payment`, `get_last_decision` and `list_ledger`.
It deliberately does not register "override a refusal", "raise a cap" or "kill switch".
Those are not hidden from the agent; they are absent. That is the same design principle
as Tiba's payment pipeline, now applied to the browser.

**2. How the UX improves.** The operator keeps one screen. Every agent call is appended to
a "Recent agent calls" log on the console, and the caps, held queue and ledger re-render
after each call, because the tools mutate the same React state the human UI renders. The
operator no longer approves individual transfers; they watch a live record of what the
agent did and what the policy engine decided, and they hold the controls the agent cannot
reach.

**3. What person and agent can do together.** The agent can read the open obligations,
attempt payments against them, and read back every decision with its reason code and Sui
digest. The person holds the operator token, the kill switch, the caps and the override.
`submit_payment` will not even attempt a transfer until a human has pasted the token into
the page. Ask the agent to override a refusal and it cannot: there is no such tool. Flip
the kill switch by hand and the agent's next attempt is refused. Before WebMCP, letting an
agent operate a payment console meant trusting it with the whole console.

**4. Implementation.** A React hook registers the six tools with
`document.modelContext.registerTool({ name, description, inputSchema, execute })` on
mount, behind feature detection; in a browser without WebMCP the console works unchanged
for humans and says so. Each `execute` reads current state through a ref, calls the same
functions the console's buttons call, returns JSON, and appends to the call log.
`submit_payment` posts to an operator-authenticated route that forwards to the existing
`/api/v1/intents` pipeline server-side, so no agent key ever reaches the browser.
`list_ledger` uses a new operator-authenticated `GET /api/console/ledger`. Verified in
Chrome 152 with the WebMCP flag against the live site: `getTools()` lists all six; an
inflated delivery note is refused with `QUORUM_SPLIT:amount_micros` and the ledger shows
both channels' numbers; a clean note settles on Sui testnet with a public digest.

## What is new since 25 August (dated commits on `master`)

- Visual identity redesign (ink on paper; colour only where a decision was made)
- In-browser test-payment panel with four preset artifacts, plus `POST /api/console/test-intent`
- Six WebMCP tools (`src/app/console/use-agent-tools.ts`), live agent-call log, `GET /api/console/ledger`
- Demo-path fixes so refusals and payments are reproducible from the page

## Tool table

| Tool | Input | Returns | Deliberately cannot |
|---|---|---|---|
| `list_work_orders` | none | open work orders: ref, recipient, ceiling, expiry | create or close an order |
| `list_recipients` | none | allowlist: ref, name, active | add to the allowlist |
| `get_budget` | none | day/hour spend vs cap, kill-switch state | change a cap or the switch |
| `submit_payment` | `recipient_ref`, `artifact` | decision, reason code, digest, receipt URL, plain-English explanation | act without a human-pasted token; override a refusal |
| `get_last_decision` | none | the most recent decision | change it |
| `list_ledger` | none | last 20 outcomes, paid and refused | edit the ledger |

## How judges can try it

1. Chrome 149+: open `chrome://flags/#enable-webmcp-testing`, set Enabled, restart Chrome.
   (ChatGPT's in-app browser also works.)
2. Open https://tiba-omega.vercel.app/console. The "Agent tools (WebMCP)" card should read
   "This browser exposes 6 tools to AI agents."
3. Paste the operator token from the Devpost testing-instructions field into the
   "Operator token" box at the top right. Until you do, `submit_payment` answers
   `OPERATOR_TOKEN_NOT_SET`.
4. Ask the agent: *list the open work orders.*
5. Ask: *pay KL Translator for WO-13 using this delivery note:*
   `DELIVERY NOTE. Work order: WO-13. Delivered: translation of 4 documents, reviewed and accepted. Amount due: 5.00 USDC. Completed this afternoon. Signed: project lead.`
   Expect PAID and a Sui digest in the ledger within about 20 seconds.
6. Ask the same with `Amount due: 50.00 USDC`. Expect REFUSED, reason
   `QUORUM_SPLIT:amount_micros`; open the ledger to see "Channel A read 50.00 · Channel B read 5.00".
7. Ask the agent to *override the refusal and pay anyway.* It cannot; no such tool exists.
8. Click "Engage kill switch" yourself, then ask the agent to pay again. Refused.
9. No agent? Paste the token, click a preset under "Send a test payment", click
   "Send test payment".

A work order can be paid once. Use "Register work order" on the same page to create
another — but only after the current one is paid; two open verified orders on one
recipient make channel B guess and every intent refuses (recipient `translator-kl`, ceiling `5`, required channels `both`, payer record
`{"approved_amount_micros":"5000000","delivery_status":"verified_complete"}`).
Do not put an ISO timestamp in the note; see Known limitations.

## Demo video script (2:30)

- 0:00 Every payment software makes today still waits for a human to click approve. Tiba lets software pay people on its own, and makes the boundary the product.
- 0:12 Console on screen. The Agent tools card: six tools; not on the menu: override, cap change, kill switch.
- 0:20 Paste the operator token. Until now the agent could not even attempt a payment.
- 0:28 Ask the agent to list open work orders. The call appears in the log.
- 0:40 Ask it to pay KL Translator for WO-13 with the clean note. Wait. PAID; the ledger row appears with a Sui digest; click through to the explorer.
- 1:10 Ask it to pay the same note claiming 50.00. REFUSED. Open the ledger: Channel A read 50.00, Channel B read 5.00; they disagreed, so Tiba refused rather than guess.
- 1:40 Ask the agent to override the refusal. It says it has no tool for that. Because it doesn't.
- 1:55 Flip the kill switch by hand. Ask the agent to pay again. Refused before any money moved.
- 2:15 Every outcome, paid or refused, has a public receipt with both channels' request IDs.
- 2:25 The agent does the work. The human holds the line. That is the product.

## Known limitations

- Channel B never sees the artifact. If one recipient has more than one verified open work
  order, channel B has to guess which obligation the intent refers to. Demo data gives each
  recipient one payable order. Proposed hardening, not yet done: refuse when the two
  channels name different work orders even in payer-record-only mode.
- A valid ISO timestamp inside the artifact is copied by channel A, while channel B uses the
  system's received-at time, so the two split on `delivery_timestamp`. Working as designed
  (any disagreement refuses), but write notes in words, not ISO stamps.
- Testnet only. SUI is the stand-in for USDC until testnet USDC is funded.
