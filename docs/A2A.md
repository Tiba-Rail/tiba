# Tiba × Agent2Agent (A2A)

A thin adapter that lets any A2A 1.0 agent call Tiba's payout pipeline. It is a
translation layer only: every call is forwarded to the existing `POST /api/v1/intents`
route with the caller's bearer passed through unchanged, so verification, policy, the
kill switch, idempotency and settlement run exactly as they do for the REST API. The
adapter cannot bypass any of them.

- Agent Card: `GET https://tiba-omega.vercel.app/.well-known/agent-card.json`
- JSON-RPC endpoint: `POST https://tiba-omega.vercel.app/a2a` (`Content-Type: application/json`, `A2A-Version: 1.0`)
- Code: `src/lib/a2a.ts` (pure mapping, tested in `test/a2a.test.mjs`),
  `src/app/.well-known/agent-card.json/route.ts`, `src/app/a2a/route.ts`
- Proof script: `A2A_WORK_ORDER=<ref> npm run a2a:proof -- [BASE_URL]` (reads `A2A_AGENT_KEY`,
  else the seed default). `A2A_WORK_ORDER` is required: a clean run settles and discharges
  that order, so never use `WO-13` (the `/console` demo's order). Register a throwaway first
  with `node scripts/register-demo-order.mjs WO-A2A-1`.

## Security

The bearer is a **Tiba agent API key**, the same key `/api/v1/intents` accepts. The card
declares it as `securitySchemes.bearer` (HTTP `Bearer`) and requires it in
`securityRequirements`. A missing or wrong key is HTTP `401` with `WWW-Authenticate: Bearer`
and a JSON-RPC `-32000` error whose `data` carries the upstream body (`403` passes through
the same way). Tasks are scoped to the agent that created them, because
`GET /api/v1/intents/[id]` is.

## Skill

`authorize_and_settle_payout` — send a DataPart `{ recipient_ref, artifact }` where
`artifact` is the delivery-note text for an open work order. A TextPart whose `text` is
that JSON also works. `message.messageId` becomes the idempotency key: resend the same
`messageId` and you get the same task back without a second verification run.

## Methods

Canonical 1.0 names; the 0.3 names `message/send` and `tasks/get` are accepted as aliases.

### `SendMessage`

Blocking: the response is the finished task (the pipeline is synchronous, ~7–16 s).

Request:

```json
{
  "jsonrpc": "2.0", "id": 1, "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "msg-1",
      "role": "ROLE_USER",
      "parts": [
        { "text": "Authorize and settle the payout for this delivery note." },
        { "data": { "recipient_ref": "translator-kl", "artifact": "DELIVERY NOTE\nWork order: WO-13\nAmount due: 5.00 USDC\nSigned: project lead" },
          "mediaType": "application/json" }
      ]
    },
    "configuration": { "acceptedOutputModes": ["application/json"] }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "task": {
      "id": "6903930e-85b5-48fb-925b-11bdd7d88d5d",
      "contextId": "6903930e-85b5-48fb-925b-11bdd7d88d5d",
      "status": { "state": "TASK_STATE_COMPLETED", "timestamp": "2026-09-01T00:00:00.000Z" },
      "artifacts": [
        {
          "artifactId": "decision-6903930e-85b5-48fb-925b-11bdd7d88d5d",
          "name": "decision",
          "parts": [
            {
              "data": {
                "decision": "PAID",
                "decision_class": "PAID",
                "status": "settled",
                "reason_code": null,
                "digest": "4EZgiwH4a6eU1KyawxX7tNbJC4K2SX5g9yfYV9AZvHVG",
                "explorer_url": "https://suiscan.xyz/testnet/tx/4EZgiwH4a6eU1KyawxX7tNbJC4K2SX5g9yfYV9AZvHVG",
                "receipt_url": "https://tiba-omega.vercel.app/r/ff034750-2d1f-4a69-80fd-05ff3d60c6db"
              },
              "mediaType": "application/json"
            }
          ]
        }
      ],
      "history": [
        { "messageId": "msg-1", "role": "ROLE_USER", "taskId": "6903930e-…", "contextId": "6903930e-…", "parts": [ "…" ] }
      ]
    }
  }
}
```

`task.id` is the Tiba intent id. `contextId` echoes `message.contextId` when given, else
the intent id. A `message.taskId` is refused: `-32001` if no such task, else `-32004`
because a Tiba task is resolved in one message.

### `GetTask`

```json
{ "jsonrpc": "2.0", "id": 2, "method": "GetTask", "params": { "id": "6903930e-85b5-48fb-925b-11bdd7d88d5d" } }
```

Returns the same Task shape (no wrapper). Unknown id, or an id owned by another agent,
is `-32001 TaskNotFoundError`.

## State mapping

| Tiba `decision_class` / `status` | A2A `status.state` | `decision` in artifact |
|---|---|---|
| `PAID` / `settled` | `TASK_STATE_COMPLETED` | `PAID` |
| `RED` / `refused` | `TASK_STATE_REJECTED` | `REFUSED` (see `reason_code`) |
| `AMBER` / `held` | `TASK_STATE_INPUT_REQUIRED` | `HELD` (an operator must review) |
| any / `processing` | `TASK_STATE_WORKING` | — |

`reason_code` values are Tiba's own (`QUORUM_SPLIT:amount_micros`, `DAY_AMOUNT_CAP`,
`KILL_SWITCH`, …); see `docs/GLOSSARY.md`.

## Errors

Standard JSON-RPC envelope. HTTP status is 200 except 405 for non-POST and the upstream
`401` / `403` passed through for auth failures (A2A §3.3.2; `401` carries
`WWW-Authenticate: Bearer`). `error.data`, when present, is
`[ { "@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason", "domain", "metadata" } ]`.

| Code | When |
|---|---|
| `-32700` | body is not JSON |
| `-32600` | not a JSON-RPC 2.0 request (incl. a JSON `null` or non-object body) |
| `-32601` | unknown method |
| `-32602` | no `message`, no `{recipient_ref, artifact}` part, no `id`, or upstream `400` |
| `-32000` | upstream `401` / `403` (missing or wrong agent key); response carries the same HTTP status |
| `-32603` | upstream `5xx`; `metadata.status` / `metadata.body` carry it |
| `-32001` | task not found |
| `-32003` | any push-notification-config method (`capabilities.pushNotifications` is false) |
| `-32004` | streaming, subscribe, cancel, list, extended card (not supported) |
| `-32009` | `A2A-Version` header present and not `1.0` |

## Not built

Streaming, push notifications, `ListTasks`, `CancelTask` (every task is terminal or
human-held by the time the response returns), and a 0.3-shaped response layer. Add the
last only if a real 0.3 client needs it.
