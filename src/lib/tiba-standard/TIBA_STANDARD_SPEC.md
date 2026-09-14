# Tiba Agent Mandate and Execution Receipt Specification

**Version:** 0.1 (draft)
**Status:** implementation profile for the v0 demo

Tiba is a protocol-neutral, signed permission slip for an agent and a signed
receipt for each action it attempts. It lets a policy author constrain an agent
before it acts, and lets a merchant, tool provider, auditor, or another agent
verify the resulting evidence without contacting Tiba or trusting a Tiba
service.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

## 1. Scope and design position

Tiba adds two portable objects:

1. A **Mandate**: a policy authorizes one identified agent to take a narrow set
   of actions until an expiry, subject to counterparties, data permissions,
   spend budget, revocation, and escalation rules.
2. An **Execution Receipt**: the agent signs a durable statement of a permitted,
   failed, or refused action. It includes the complete signed mandate chain and
   hashes of inputs and outputs, so it can be checked offline.

Tiba is an authorization-and-accountability layer. It is not a wallet, payment
rail, identity registry, OAuth replacement, settlement finality system, or
agent discovery protocol.

### 1.1 Relationship to existing protocols

| Protocol | It already does | Tiba adds | Tiba deliberately does not duplicate |
| --- | --- | --- | --- |
| [AP2](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md) | Payment checkout/payment mandates, their receipts, and dispute evidence. Its authorization model binds open mandates to a concrete action. | A cross-protocol policy envelope and receipt for non-payment actions and agent-to-agent sub-delegation. | AP2 `vct`, `checkout_jwt`, `checkout_hash`, payment credentials, `transaction_id`, AP2 mandate constraints, and AP2 payment/checkout receipts remain AP2 data. Tiba only references their hashes or IDs as evidence. |
| [x402](https://github.com/x402-foundation/x402/tree/main/specs) | HTTP `402 Payment Required`, payment requirements/payloads, facilitator verification and settlement. | A pre-payment policy check, spend accounting, and receipt covering the whole agent action. | `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`, payment schemes, and facilitator APIs. |
| [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications) (TAP) | Agent recognition HTTP Message Signatures, key-store lookup, consumer/device identity, and payment containers for merchant interaction. | User policy, non-payment tool-call receipts, and delegation chains that do not depend on a card network directory. | TAP `Signature-Input`/`Signature`, HTTP-message coverage, TAP key-store/program rules, consumer/device data, and payment credential containers. |
| [MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | Tool discovery/calls, transport, and optional transport authorization. | A semantic permit check for every `tools/call` and a signed action receipt. | MCP OAuth, server access control, tool schemas, and tool results. |
| [A2A](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) | Agent Cards, task/message exchange, binding-specific authentication, and an extension mechanism. | A signed, narrowing sub-mandate passed with a delegated task and an auditable completion receipt. | Agent discovery, task lifecycle, message content, and A2A authorization mechanisms. |

An AP2, x402, or TAP action MAY also have a Tiba receipt. Both protocols must
verify independently. A valid Tiba receipt does not make an AP2 payment mandate,
x402 payment, TAP request, MCP credential, or A2A task valid; the inverse is
also true.

### 1.2 v0 boundaries

Tiba v0.1 uses self-contained `did:key` Ed25519 public keys. It does not define
key rotation, recovery, a DID registry, selective disclosure, a shared spend
ledger, or a consensus mechanism. Those are future extension topics.

## 2. Versioning and schemas

Every object MUST carry the exact pair below:

```text
type:    tiba.mandate | tiba.receipt | tiba.revocation_list
version: 0.1
```

The JSON Schemas are normative for object shape; cross-object and temporal
rules in this document are also normative:

- [Mandate schema](schema/tiba-mandate-v0.1.schema.json)
- [Receipt schema](schema/tiba-receipt-v0.1.schema.json)
- [Revocation list schema](schema/tiba-revocation-list-v0.1.schema.json)

Unknown top-level fields are forbidden. Namespaced `extensions` are allowed for
forward compatibility, but an enforcer MUST reject an unknown extension if it
could relax authorization or alter verification. A breaking change receives a
new `version` and schema file; it is never silently interpreted as 0.1.

## 3. Encoding, identity, hashing, and signatures

### 3.1 Canonical JSON

Tiba uses the [JSON Canonicalization Scheme (JCS), RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).
For a signed object:

1. Parse it as I-JSON. Duplicate object members, invalid Unicode, non-finite
   numbers, and non-JCS values MUST fail.
2. Remove the top-level `signature` member.
3. Serialize the remaining object as UTF-8 JCS bytes.
4. Sign those bytes with pure Ed25519.
5. Add `signature` and serialize normally for transport. Wire-property order is
   irrelevant; the signature is over the JCS form.

All monetary amounts are decimal strings, never JSON numbers. This avoids
floating-point signing and comparison ambiguity. The only numeric v0 field is
`delegation.max_depth`, which is a small integer.

### 3.2 Ed25519 and `did:key`

Signatures use [Ed25519 (RFC 8032)](https://www.rfc-editor.org/rfc/rfc8032.html):

```json
"signature": {
  "alg": "Ed25519",
  "kid": "did:key:z...",
  "value": "<64-byte-signature-as-unpadded-base64url>"
}
```

`kid` MUST equal the object's required signer:

- Mandate: `signature.kid == issuer`
- Receipt: `signature.kid == actor`
- Revocation list: `signature.kid == issuer`

In v0.1, a `did:key` MUST carry the multibase base58btc (`z`) encoding of the
`ed25519-pub` multicodec varint (`0xed 0x01`) followed by exactly 32 public-key
bytes. A verifier extracts that key locally; it MUST NOT fetch a DID document.
The [did:key specification](https://w3c-ccg.github.io/did-key-spec/) describes
that encoding. A syntactically valid but non-Ed25519 `did:key` MUST fail.

### 3.3 Hashes

Tiba hashes are written as:

```text
sha256-<unpadded-base64url(SHA-256(bytes))>
```

For JSON input/output, `bytes` MUST be its UTF-8 JCS representation. For a
non-JSON payload, it MUST be the exact bytes presented to or returned from the
external system. Hashing an empty output uses the hash of the empty byte string.

`mandate_hash` and `delegation.parent.hash` are hashes of the **complete signed
mandate**, including its `signature`, serialized with JCS. This makes each link
stable and detects swapping a signature or any signed field.

## 4. Mandate

A Mandate is signed by its `issuer` (the policy author for a root mandate; the
currently authorized parent agent for a sub-mandate) and authorizes exactly one
`subject` agent.

| Field | Meaning |
| --- | --- |
| `id` | Globally unique mandate identifier in the issuer's domain. UUID URNs are recommended. |
| `issuer` | `did:key` of the policy author or delegating agent. |
| `subject` | `did:key` of the only agent permitted to use this mandate. |
| `issued_at`, `not_before`, `expires_at` | Calendar-valid UTC timestamps in exact `YYYY-MM-DDTHH:mm:ss.sssZ` form. Missing `not_before` means `issued_at`. `expires_at` is exclusive. |
| `scope` | Permitted actions, counterparties, and data references. It is deliberately explicit and closed by default. |
| `budget` | Optional ceiling in one currency. If absent, no monetary action is authorized. |
| `delegation` | Maximum remaining delegation depth and, for a child, its immutable parent reference. |
| `revocation` | Signed-list endpoint, list ID, and the policy-authority key allowed to revoke it. |
| `escalation` | What to do when the action cannot be safely authorized: `deny`, `require_confirmation`, or `notify`. |
| `extensions` | Namespaced optional extensions; security-relevant unknown extensions fail closed. |
| `signature` | Ed25519 signature of this object without `signature`. |

### 4.1 Scope

`scope.actions` is a non-empty list of four-dimensional allow rules:

```json
{
  "protocol": "mcp",
  "action": "tools/call",
  "resource": "mcp://notes-demo",
  "tool": "notes.write"
}
```

Each selector is either an exact non-whitespace string or the complete wildcard
`*`. Partial globs, implicit wildcards, and regular expressions are forbidden
in v0.1. An actual receipt action MUST use exact values, never `*`.

An action matches one allow rule only when all four dimensions match exactly or
the corresponding allow selector is `*`. `scope.counterparties` is also an
explicit exact-or-`*` allow list. A receipt action always identifies one
`counterparty`; a local MCP server MUST use a stable configured identifier such
as `local-notes-server` rather than omitting it.

`scope.data.read` and `scope.data.write` contain data-resource identifiers, not
the data itself. An empty list means no access of that kind. An action's required
`data_access` lists are checked independently against the matching direction.
Use `*` only when all data of that direction is intentionally allowed.

### 4.2 Budget

`budget.amount` and `budget.per_action_max` are non-negative decimal strings.
Before an action with `amount` is sent, an enforcer MUST:

1. require `currency == budget.currency`;
2. compare decimal values exactly, without binary floating point;
3. reject an amount above `per_action_max`, when present; and
4. atomically reserve/record enough budget so the sum of successful monetary
   receipts under the active chain cannot exceed `budget.amount`.

An action without `amount` is not a monetary action. A child may omit `budget`
to prohibit monetary actions, but may never introduce one when the parent has
none. A receipt with `result: "denied"` never consumes budget.

Tiba v0.1 has no global spend lock. Distributed or concurrent agents need a
shared atomic ledger/reservation service if a hard aggregate cap matters. An
offline verifier can validate a provided complete receipt ledger, but cannot
prove it has seen every receipt in the world.

### 4.3 Escalation

`deny` means refuse and issue a denied receipt. `require_confirmation` means
obtain new human approval outside this protocol, then issue a new mandate or
otherwise record the approval under a future extension; it does **not** mean an
agent may assume approval. `notify` means an implementation may continue only
when all other checks pass and its configured notification operation succeeds.
The optional `url` identifies that human/escalation surface and is not a bearer
approval token.

## 5. Delegation and narrowing

An agent may delegate only by creating and signing a new Mandate for a different
or more constrained `subject`. The Receipt carries a full `mandate_chain` in
root-to-leaf order; the active mandate is the leaf.

For each child at index `i > 0`, a verifier MUST require all of the following:

1. The child has `delegation.parent` and it equals the prior mandate's `id` and
   full-signed-document `hash`.
2. The child `issuer` and signature key equal the prior mandate's `subject`.
3. The root has no `delegation.parent`; its chain depth is at most its
   `delegation.max_depth`. A child's `max_depth` is no greater than its parent's
   remaining `max_depth - 1`.
4. `not_before` is no earlier than the parent's effective time, `issued_at` is
   no earlier than the parent's `issued_at`, and `expires_at` is no later than
   the parent's `expires_at`.
5. Every child action allow rule is a subset of a parent rule. Per selector, a
   parent `*` permits a child exact value or `*`; a parent exact value permits
   only that exact child value. A child cannot add a rule outside the parent.
6. Every child counterparty/data selector is allowed by the corresponding parent
   selector using the same exact-or-`*` subset rule.
7. Child monetary limits use the same currency and are no larger than the
   parent amount/per-action maximum. A missing child budget is more restrictive.
8. The child retains the same `revocation.authority`, `list_id`, and `url`.
9. Escalation may only become stricter in this order:
   `notify` -> `require_confirmation` -> `deny`. A changed escalation URL is
   allowed only when the mode is strictly more restrictive.
10. A security-relevant parent extension remains in force. An unknown extension
    causes `TIBA_UNSUPPORTED_CONSTRAINT`, rather than being silently dropped.

A parent revocation invalidates every descendant, even if a descendant ID is
not explicitly listed.

## 6. Revocation

Each Mandate contains a `revocation` object with an endpoint URL, list ID, and
revocation-authority `did:key`. The endpoint serves a signed
`tiba.revocation_list` object. Its `issuer` and `signature.kid` MUST equal that
authority, and its `list_id` MUST match the mandate.

The list has `revoked` entries with `mandate_id` and `revoked_at`. Before a new
action, an enforcer MUST obtain a valid current signed list from the endpoint or
a trusted cache, according to its freshness policy. If `next_update` is present
and is in the past, it MUST fail closed with `TIBA_REVOCATION_STALE`. Failure to
obtain or validate required status MUST fail closed with
`TIBA_REVOCATION_UNAVAILABLE` or `TIBA_REVOCATION_INVALID`.

An action at time `t` is revoked when any mandate in its chain has an entry with
`revoked_at <= t`. A historical receipt created before that time remains a valid
cryptographic record; it does not authorize a future action. For offline
verification, a receipt bundle SHOULD include the signed status list used by
the enforcer as an `evidence` item or be verified against a separately supplied
list snapshot.

## 7. Execution Receipt

Every attempted external action MUST generate a Receipt, including a policy
denial. A receipt is signed by the active agent; in v0.1 its `actor` MUST equal
the leaf mandate's `subject`. This gives an offline verifier a direct chain from
policy author to the actor who claims the action.

| Field | Meaning |
| --- | --- |
| `mandate_id`, `mandate_hash` | ID and complete-signed-document hash of the active leaf mandate. |
| `mandate_chain` | **Required**, non-empty array of the full signed root-to-leaf Mandates. It is the portable authorization proof. |
| `action` | Exact protocol/action/resource/tool, counterparty, actual data references, and optional amount/currency. |
| `input_hash`, `output_hash` | Commitments to what was sent and returned. They contain no raw body. |
| `result` | `success`, `failure`, or `denied`. |
| `reason` | Required for `denied`; a Tiba error code explaining the refusal. |
| `executed_at` | UTC time at which the guard made its final allow/deny result. |
| `actor` | Active subject agent that signs the receipt. |
| `evidence` | Opaque external references such as a Solana transaction signature, an AP2 transaction reference/hash, an x402 settlement reference/hash, or a TAP HTTP-signature hash. |

`success` means the action completed according to the signing actor. `failure`
means the actor attempted the permitted action but it did not complete.
`denied` means no downstream action was sent; it is a signed audit event, not
proof that the action was permitted. A `success` or `failure` receipt MUST pass
all active scope, budget, time, and revocation checks at `executed_at`.

For a successful on-chain Solana payment, `evidence` MUST contain an item with:

```json
{
  "type": "solana_transaction",
  "network": "solana-devnet",
  "reference": "<transaction signature>",
  "url": "https://explorer.solana.com/tx/<transaction signature>?cluster=devnet"
}
```

The transaction reference lets anyone independently inspect the chain. It does
not by itself prove the human authorization; the mandate chain supplies that.

## 8. Verification algorithm

`verify_mandate`, `verify_receipt`, and an enforcement proxy MUST expose clear
machine-readable errors from the table below. An implementation MUST fail
closed, except that it may report a signed `denied` receipt for a prohibited
request.

To verify a mandate chain and receipt:

1. Validate each object against the correct 0.1 schema and reject duplicate
   JSON members before schema validation.
2. Validate every `did:key` as an Ed25519 multicodec key, remove its signature,
   JCS-canonicalize it, and verify the Ed25519 signature.
3. Verify the root-to-leaf chain rules in section 5, and ensure receipt
   `mandate_id`/`mandate_hash` match the final full signed mandate.
4. Require receipt `actor == leaf.subject`, `signature.kid == actor`, and verify
   the receipt signature over its JCS form without `signature`.
5. Check the leaf effective time at `executed_at`. For a prospective action,
   use the current time instead.
6. Verify the configured signed revocation list and reject a successful/failed
   action revoked at or before its action time.
7. For `success`/`failure`, match the exact action tuple, counterparty, and
   each `data_access` item against the leaf scope. Reject receipt wildcards.
8. For an amount, enforce exact decimal currency/per-action/aggregate budget
   checks using an atomically maintained ledger or a supplied complete ledger.
9. Reject unsupported security-relevant extensions. Verify external evidence
   only under the external protocol's own rules; never treat a URL as proof.

An independent verifier needs the receipt file(s) and public keys. In v0.1 those
public keys are self-contained in the `did:key` fields and the receipt embeds
the entire mandate chain. No Tiba network call is necessary to verify signatures
or delegation. Revocation freshness and spend-completeness are necessarily
stronger when a signed status list and complete receipt ledger are supplied.

## 9. Error codes

| Code | Meaning |
| --- | --- |
| `TIBA_SCHEMA_INVALID` | Object shape, field type, identifier, timestamp, or fixed version/type is invalid. |
| `TIBA_CANONICALIZATION_FAILED` | Input cannot be represented as required JCS/I-JSON. |
| `TIBA_DID_KEY_INVALID` | `did:key` is not a supported Ed25519 public key. |
| `TIBA_SIGNATURE_INVALID` | Required Ed25519 signature fails or signer/key fields disagree. |
| `TIBA_HASH_MISMATCH` | A declared mandate/input/output/reference hash does not match computed bytes. |
| `TIBA_CHAIN_INVALID` | Chain ordering, parent reference, signer, or leaf link is invalid. |
| `TIBA_DELEGATION_WIDENED` | A child tries to expand scope, budget, life, revocation control, or delegation. |
| `TIBA_NOT_YET_VALID` | Action occurs before the mandate is effective. |
| `TIBA_EXPIRED` | Action occurs at or after mandate expiry. |
| `TIBA_REVOKED` | An ancestor or active mandate was revoked at or before the action. |
| `TIBA_REVOCATION_UNAVAILABLE` | A required status list could not be obtained. |
| `TIBA_REVOCATION_INVALID` | Status list signature, issuer, or list ID is wrong. |
| `TIBA_REVOCATION_STALE` | A status list is past `next_update`. |
| `TIBA_SCOPE_DENIED` | Protocol/action/resource/tool tuple is not allowed. |
| `TIBA_COUNTERPARTY_DENIED` | The action's counterparty is not allowed. |
| `TIBA_DATA_DENIED` | Requested data read/write reference is not allowed. |
| `TIBA_CURRENCY_MISMATCH` | Monetary action uses a different currency. |
| `TIBA_BUDGET_EXCEEDED` | Per-action or aggregate amount exceeds the mandate budget. |
| `TIBA_ESCALATION_REQUIRED` | Policy requires human confirmation before proceeding. |
| `TIBA_UNSUPPORTED_CONSTRAINT` | A security-relevant extension or constraint is unknown. |
| `TIBA_RECEIPT_MANDATE_MISMATCH` | Receipt active-mandate identifiers or actor do not match its chain. |
| `TIBA_AUDIT_PERSISTENCE_FAILED` | A completed action's signed receipt could not be durably stored; the middleware MUST return that signed receipt rather than relabel the completed action as failed. |

## 10. MCP and A2A transport bindings

### 10.1 MCP

MCP uses JSON-RPC and permits namespaced metadata in `params._meta`. The
[MCP schema](https://modelcontextprotocol.io/specification/2025-11-25/schema)
reserves `_meta` for this purpose. For `tools/call`, a Tiba-aware client or
proxy uses the provisional reverse-DNS metadata key `org.tiba/mandate`:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "notes.write",
    "arguments": { "path": "today.txt", "text": "hello" },
    "_meta": {
      "org.tiba/mandate": {
        "version": "0.1",
        "mandate_chain": ["<full signed root mandate>"]
      }
    }
  }
}
```

`<full signed root mandate>` above means a JSON Mandate object, not a string in
an actual request; it is quoted only to keep the example short. A deployment
MUST bind the chain to a trusted session or validate the metadata chain before
using it; it MUST NOT trust an LLM-generated action label. A guard MUST
derive `resource`, `tool`, counterparty, and data references from trusted
server configuration and the request, not from an LLM-provided label. It checks
the mandate before forwarding. On a deny it MUST not call the upstream server,
returns a normal MCP tool error (`isError: true`) with the Tiba code, and emits a
signed `denied` receipt. On completion it returns the signed receipt under
`result._meta["org.tiba/receipt"]` and persists it.

The guard is an add-on; it does not change MCP tool schemas, OAuth, or a server's
own input/access-control checks.

### 10.2 A2A

A2A defines extensions through Agent Card capabilities, `A2A-Extensions`, and
namespaced message metadata. Tiba's v0.1 extension URI is:

```text
urn:tiba:extension:mandate:0.1
```

An A2A agent that supports Tiba advertises that URI as an optional Agent Card
extension. A caller opts in through the binding's extension negotiation and
places this value in `message.metadata` under that same URI:

```json
{
  "mandate_chain": ["<full signed root-to-leaf mandate objects>"]
}
```

The receiving agent verifies the chain before accepting a task. If it delegates
work, it creates a narrower child mandate and supplies the full expanded chain
to the child. It attaches its signed receipt under the same metadata URI on the
resulting task status or artifact. This uses the A2A extension mechanism rather
than changing Agent Cards, tasks, or messages.

## 11. Payment integrations

For a direct devnet USDC transfer, a Tiba action commonly uses
`protocol: "payment"`, `action: "transfer"`, `resource: "solana:devnet"`, and
a configured USDC-transfer `tool` selector. The amount, `USDC` currency,
recipient counterparty, and Solana transaction evidence are all receipt data.
The mandate check happens before signing/broadcasting the transfer.

For x402, the HTTP payment request/response remains exactly x402. Tiba may
record an action with `protocol: "x402"` and evidence references to the selected
payment requirement, payment payload, and settlement response using hashes.
The x402 facilitator remains responsible for x402 verification and settlement.
The reference proof limits this to a loopback seller and Solana devnet,
requires an explicit devnet confirmation, and signs the successful settlement
as a normal Tiba receipt.

For AP2, a Tiba payment action may refer to an AP2 `transaction_id`, checkout
mandate hash, or payment receipt hash in `evidence`; it MUST NOT copy payment
credential or checkout JWT contents into a Tiba receipt. For TAP, a receipt may
refer to the covered HTTP request or HTTP-signature hash; TAP's HTTP Message
Signature still verifies separately.

## 12. Privacy and security notes

- Never place private keys, seed phrases, bearer/OAuth tokens, payment cards,
  raw prompts, raw tool arguments/results, PII, or unredacted sensitive data in
  a mandate, receipt, metadata envelope, source-control file, or log.
- Hashes are commitments, not encryption. A hash of a predictable value can be
  guessed offline. For sensitive/predictable data, commit to a random salt plus
  the data and retain the salt/data only in encrypted private evidence storage.
- A receipt's required full mandate chain is intentionally portable proof and
  can reveal counterparties and policy shape. Use narrow mandates, hash data,
  and distribute receipt bundles privately when that metadata is sensitive.
- `did:key` is self-certifying but linkable. It proves control of a key, not a
  person's legal identity, human consent quality, software integrity, or the
  truth of a claimed tool result.
- Verifiers need reliable clocks, HTTPS/protected status-list retrieval, key
  protection, and atomic budget accounting. A signed receipt cannot repair a
  compromised signing key or a malicious executor.
- The receipt proves what its signer attests. Check Solana/AP2/x402/TAP/MCP/A2A
  evidence using the relevant external protocol before relying on settlement or
  service completion.

## 13. Primary references

- [AP2 specification and authorization model](https://github.com/google-agentic-commerce/AP2/tree/main/docs/ap2)
- [Visa Trusted Agent Protocol specifications](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) and [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [A2A Protocol specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [x402 specification](https://github.com/x402-foundation/x402/tree/main/specs)
- [RFC 8785: JCS](https://www.rfc-editor.org/rfc/rfc8785.html) and [RFC 8032: Ed25519](https://www.rfc-editor.org/rfc/rfc8032.html)
