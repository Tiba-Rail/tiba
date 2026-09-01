
# Product Requirements Document — Tiba

## 1. One-paragraph summary

Tiba is an agent-to-human payment rail: infrastructure that lets software pay a real person without a human clicking "approve" for every transfer. An agent submits a payout request containing the recipient, amount, and supporting evidence, such as a delivery note. Two isolated verification channels independently check whether the payment matches an open work order and the payer's own records. The payment executes only when both produce the same work order and amount. Any disagreement or policy failure causes a refusal. Tiba settles payments on the Sui testnet using SUI as a stand-in for USDC, a dollar-linked stablecoin, and publishes receipts that let third parties verify what happened.

## 2. The problem

The immediate customer is a founder who has already shipped an AI agent with access to a wallet, card, or stablecoin balance.

That founder's customer asks: "Can your agent pay people without me approving every payment?"

The honest answer today is often: "Not safely."

An agent that can spend money needs more than a wallet and spending limits. It needs a way to determine whether a requested payment is actually supported by the payer's records and the work being performed. If the agent can approve its own evidence, a bad instruction, incorrect record, or fraudulent artifact may lead to the wrong person being paid. If every payment still requires a human approval click, the agent is not truly autonomous.

Tiba addresses this authorization problem. The agent can request a payment, but it cannot override a refusal, increase its own limits, change the recipient allowlist, or disable the kill switch.

## 3. Why now

YC's "Best Time to Build in Crypto" request for startups explicitly identifies agentic commerce and agents using crypto networks as financial rails as funded categories.

The broader implication is that crypto rails may become invisible infrastructure: companies will use them to move money without necessarily describing their products as "crypto products." Agents using financial rails is treated as an increasingly inevitable direction.

Tiba is aimed at the missing authorization layer in that direction. It is designed for companies that want autonomous payments while retaining a decision process that fails safely when the evidence does not agree.

## 4. What Tiba does today (v1, built and live)

Tiba's current payment flow is:

1. An agent submits a payout intent containing:

   - The recipient
   - The amount
   - An untrusted evidence artifact, such as a delivery note

2. Tiba sends the request through GonkaRouter, a gateway that routes inference requests to multiple models, using two isolated verification channels.

   - Channel A reads only the evidence artifact and the list of open work-order IDs.
   - Channel B reads only the payer's own records and never sees the evidence artifact.

3. Each channel independently produces:

   `{work_order_id, amount}`

4. The two outputs must be identical.

   - Agreement allows the request to continue.
   - Disagreement causes a refusal.
   - There is no tie-breaker and no fallback guess.

5. A fail-closed policy layer checks:

   - The maximum amount allowed for one transfer
   - Rolling hourly and daily spending caps
   - Whether the recipient is on the allowlist
   - Whether the kill switch is active
   - Whether the request has already been processed, using idempotency so a repeated request does not create a duplicate payment

6. Approved payments settle on the Sui testnet. SUI is currently used as a stand-in for USDC because testnet USDC has not yet been funded.

7. Paid and refused outcomes receive public receipts. Each receipt includes both verification channels' request IDs and links to Gonka's public receipt-verification endpoint, allowing a third party to independently confirm that the calls occurred.

The live product is deployed at `tiba-omega.vercel.app`. Its current surfaces include:

- An operator console with a test-payment panel, spending caps, kill switch, WebMCP agent-tools capability matrix, and held-intent queue
- `/intents`, showing payments grouped as Paid, Refused, Settlement failed, or Held
- `/work-orders`
- `/recipients`
- `/policies`
- `/ledger`
- `/r/[token]`, providing a public receipt for an individual payment

The ledger and individual receipt pages include a unified decision pipeline showing Channel A, Channel B, Agreement, Policy, and Settlement.

Tiba also exposes six WebMCP tools. WebMCP tools are browser-callable functions that an AI agent can use. The tools allow a browser AI agent to list work orders, recipients, and budget information, submit a payment, and read the ledger. They do not allow the agent to override a refusal, change a spending cap, or use the kill switch. This flow has been verified end-to-end in real Chrome against the live site.

## 5. Who it's for

The buyer is a company or founder building an autonomous agent that needs to pay people or services.

The buyer needs:

- Autonomous payment execution
- A way to connect a payment request to work-order and payer records
- Spending and recipient controls
- Refusal when independent checks disagree
- A public record of why a payment was paid or refused

The end recipient is different. The recipient is the human or service receiving payment for completed work or another authorized obligation.

Tiba serves the buyer's need for controlled autonomous spending. It does not represent the recipient, approve the recipient's work independently as a human would, or provide a full identity-verification service today.

## 6. Competitive landscape and differentiation

The supplied research shows that existing products cover important parts of the agent-payment problem, but not the same verification-and-refusal mechanism.

| Product or company | Focus identified in the research | Verification mechanism | Tiba's relevant difference |
|---|---|---|---|
| Circle Agent Stack | Agent wallet and payment infrastructure | Single verification | Tiba adds two isolated verification channels that must agree before execution. |
| Skyfire | Agent identity, including KYA ("Know Your Agent"), which is different from human KYC | Single verification | Tiba's core control is payment authorization through independent evidence checks, not agent identity alone. |
| Crossmint | Agent wallet and payment tooling | Single verification | Tiba adds mandatory agreement between two independent checks and refusal on disagreement. |
| Coinbase x402 | Agent payment infrastructure; the research reports more than 100 million transactions | Single verification | The research does not identify x402 as documenting Tiba's two-channel agreement requirement. A builder described its developer funnel as narrow despite the high transaction volume. |
| Google AP2 | Agent payment and agent-to-agent protocol infrastructure | Single verification | Open GitHub feedback challenged claims that AP2 was production-ready. The research does not identify AP2 as documenting Tiba's independent verification-and-refusal mechanism. |
| Stripe and Bridge | Stablecoin infrastructure and live agent-stablecoin-payment documentation, including MPP and x402; Stripe acquired Bridge in a deal reported at $1.1 billion | Single verification | Tiba is not trying to replace Stripe or Circle as a settlement rail. Its distinction is the authorization engine that refuses when independent checks disagree. |
| **Tiba** | Payment authorization for autonomous agents | **Two independent verification channels that must agree** | Disagreement is a refusal, not a guess. |

Two independent verification channels that must agree provide superior security compared to a single verification path. This approach catches specific failure modes that single verification systems miss: if one verification channel is compromised or hallucinates, or if an evidence artifact is manipulated, the disagreement between the isolated channels will trigger a refusal. Single verification systems have no way to detect these failures and may incorrectly approve fraudulent payments. By requiring agreement between two independent, isolated channels, Tiba creates a fail-closed system that defaults to refusing payment when there's any doubt about the validity of the request.

The differentiated claim is:

Tiba requires two independent checks to agree before a payment executes; disagreement is a refusal, not a guess.

The research supports this as a real differentiation in the verification mechanism. None of the competitors' public documentation reviewed for this product documents the same requirement.

## 7. What's explicitly out of scope for v1

### Full KYC platform

Tiba will not build a complete know-your-customer platform in v1. KYC means verifying a person's identity for compliance purposes. The current product is focused on deciding whether a payment request is authorized, not on becoming an identity or compliance provider.

### Replacing Stripe or Circle as a settlement rail

Tiba is not positioned as a replacement for established stablecoin infrastructure. It already holds funds and settles payments as part of its mechanism, but its product value is the verification-and-refusal layer around payment execution.

### Mainnet production custody

V1 does not provide production custody of real funds on a mainnet network. It runs settlement on Sui testnet, with SUI standing in for USDC. Moving to production custody would require unresolved decisions about custody, regulation, real-money operations, and the appropriate funded settlement setup.

## 8. Roadmap (v1.1+, not yet built)

### Priority 1: A thin Agent2Agent adapter — built (v1.1)

Build a small adapter for Google's Agent2Agent, or A2A, protocol. A2A is a standard way for one software agent to call another.

The adapter would allow external agents to call Tiba's payment authorization and settlement flow without changing the core verification engine.

**Status (1 Sep 2026):** built. Agent Card at `/.well-known/agent-card.json`, JSON-RPC `SendMessage` / `GetTask` at `POST /a2a`, forwarding to `/api/v1/intents` with the caller's agent key; the verification engine is untouched (`docs/A2A.md`).

This is a build hypothesis supported by the current research, not a proven market gap or guaranteed source of demand.

**Timeline:** Shipped (v1.1). Streaming and push notifications: only if a real A2A client asks.

### Priority 2: Electronic identity and compliance checks as another gate — built (v1.1, default off)

Integrate checks from an electronic KYC or compliance provider as one additional gate in the existing refuse-or-pay decision.

**Status (1 Sep 2026):** built. A provider abstraction (`src/lib/identity.ts`, mock provider today; `IDENTITY_PROVIDER` reserved for Persona/Sumsub) writes a verdict onto the recipient; when an agent has `require_recipient_kyc` on (toggle on /policies, default off), an intent for a recipient whose check is missing, failed, or expired is refused `RED RECIPIENT_UNVERIFIED` before any model runs.

The design is:

- Verification channels agree
- Policy checks pass
- Identity or compliance checks pass
- Payment settles

A failed check would result in refusal or non-execution according to the policy design.

This would not turn Tiba into a full KYC product. It would add compliance-provider results around the existing payment authorization engine. The specific provider and scope of checks remain unresolved.

The verification-and-refusal engine remains the core product. A2A and electronic KYC are integrations around it, not a rewrite of Tiba.

**Timeline:** Gate shipped (v1.1). A real provider behind the same interface: after v1 traction.

## 9. Success criteria

Tiba would have meaningful product proof when the following are demonstrated with real use cases rather than staged demo data:

- A genuine payment is processed end-to-end: an agent submits the intent, both channels agree, policy checks pass, settlement completes on testnet, and the public receipt can be independently verified.
- A genuine error or fraud scenario produces a refusal, including a case where the two channels disagree or a policy rule blocks the transfer.
- The refusal cannot be overridden by the connected agent.
- A repeated request does not create a duplicate payment.
- A third party can inspect a public receipt and understand the decision pipeline across Channel A, Channel B, Agreement, Policy, and Settlement.
- A browser AI agent can use the permitted WebMCP tools to submit and inspect payments while remaining unable to change limits, disable controls, or bypass refusals.

## 10. Open questions

1. What custody and regulatory structure is appropriate before Tiba handles real money on a production network?

2. Which identity or compliance provider should be integrated first, and which jurisdictions and checks should that integration cover?

3. Is there enough demand from external agent builders to justify the A2A adapter as the first integration after v1?