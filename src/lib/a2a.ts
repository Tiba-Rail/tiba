// Google Agent2Agent (A2A) 1.0 adapter — pure mapping only. The route handlers in
// src/app/a2a and src/app/.well-known/agent-card.json call these; nothing here touches
// the database, the verifier, or policy. Shapes follow the 1.0 spec (PascalCase methods,
// no `kind` discriminator on parts, TASK_STATE_* / ROLE_* enums, camelCase fields).

export const A2A_VERSION = "1.0";

export type Part = { text?: unknown; data?: unknown; mediaType?: string; [key: string]: unknown };
export type Message = {
  messageId?: string;
  contextId?: string;
  taskId?: string;
  role?: string;
  parts?: Part[];
  [key: string]: unknown;
};

export type IntentPayload = { recipient_ref: string; artifact: string };

/** Public shape returned by POST /api/v1/intents and GET /api/v1/intents/[id]. */
export type UpstreamIntent = {
  id: string;
  status: string;
  decision_class: string;
  reason_code: string | null;
  digest: string | null;
  explorer_url: string | null;
  public_token: string;
};

/** First DataPart (or TextPart holding JSON) that carries { recipient_ref, artifact }. */
export function payloadFromParts(parts: unknown): IntentPayload | null {
  if (!Array.isArray(parts)) return null;
  for (const part of parts as Part[]) {
    if (!part || typeof part !== "object") continue;
    let candidate: unknown = part.data;
    if (candidate === undefined && typeof part.text === "string") {
      try { candidate = JSON.parse(part.text); } catch { continue; }
    }
    if (!candidate || typeof candidate !== "object") continue;
    const { recipient_ref, artifact } = candidate as Record<string, unknown>;
    if (typeof recipient_ref === "string" && recipient_ref && typeof artifact === "string" && artifact) {
      return { recipient_ref, artifact };
    }
  }
  return null;
}

const STATE: Record<string, string> = {
  PAID: "TASK_STATE_COMPLETED",
  RED: "TASK_STATE_REJECTED",
  AMBER: "TASK_STATE_INPUT_REQUIRED"
};
const DECISION: Record<string, string> = { PAID: "PAID", RED: "REFUSED", AMBER: "HELD" };

export function taskState(intent: Pick<UpstreamIntent, "status" | "decision_class">): string {
  if (intent.status === "processing") return "TASK_STATE_WORKING";
  return STATE[intent.decision_class] ?? "TASK_STATE_UNSPECIFIED";
}

/** Map a Tiba intent onto an A2A Task. `message` is echoed into history when present. */
export function taskFromIntent(intent: UpstreamIntent, origin: string, message?: Message) {
  const contextId = message?.contextId ?? intent.id;
  const history = message
    ? [{ ...message, role: message.role ?? "ROLE_USER", taskId: intent.id, contextId }]
    : [];
  return {
    id: intent.id,
    contextId,
    status: { state: taskState(intent), timestamp: new Date().toISOString() },
    artifacts: [
      {
        artifactId: `decision-${intent.id}`,
        name: "decision",
        parts: [
          {
            data: {
              decision: DECISION[intent.decision_class] ?? intent.decision_class,
              decision_class: intent.decision_class,
              status: intent.status,
              reason_code: intent.reason_code,
              digest: intent.digest,
              explorer_url: intent.explorer_url,
              receipt_url: `${origin}/r/${intent.public_token}`
            },
            mediaType: "application/json"
          }
        ]
      }
    ],
    history
  };
}

export function agentCard(origin: string) {
  return {
    name: "Tiba",
    description:
      "Agent-to-human payout authorization and settlement: two independent verification channels must agree on the work order and amount before a stablecoin payout settles, and Tiba refuses when they disagree.",
    version: "1.0.0",
    supportedInterfaces: [{ url: `${origin}/a2a`, protocolBinding: "JSONRPC", protocolVersion: A2A_VERSION }],
    provider: { organization: "Rizqey Labs", url: origin },
    documentationUrl: "https://github.com/Tiba-Rail/tiba/blob/master/docs/A2A.md",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "Tiba agent API key" } } },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    skills: [
      {
        id: "authorize_and_settle_payout",
        name: "Authorize and settle a work-order payout",
        description:
          "Send a DataPart { recipient_ref, artifact } where artifact is the delivery-note text for an open work order. Tiba runs two isolated verification channels, applies spending policy, and settles on Sui testnet. Outcomes in the `decision` artifact: PAID (settled, with digest and explorer_url), REFUSED (channels disagreed or policy failed; reason_code says why), or HELD (a human must review). Every outcome has a public receipt_url.",
        tags: ["payments", "verification", "stablecoin"],
        examples: [
          "{\"recipient_ref\":\"translator-kl\",\"artifact\":\"DELIVERY NOTE\\nWork order: WO-13\\nDelivered: translation of 4 product documents, reviewed and accepted.\\nAmount due: 5.00 USDC\\nSigned: project lead\"}"
        ],
        inputModes: ["application/json", "text/plain"],
        outputModes: ["application/json"]
      }
    ]
  };
}
