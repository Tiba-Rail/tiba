export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

export type Signature = {
  alg: "Ed25519";
  kid: string;
  value: string;
};

export type ScopeAction = {
  protocol: string;
  action: string;
  resource: string;
  tool: string;
};

export type DataAccess = {
  read: string[];
  write: string[];
};

export type Action = ScopeAction & {
  counterparty: string;
  data_access: DataAccess;
  amount?: string;
  currency?: string;
};

export type Mandate = {
  type: "tiba.mandate";
  version: "0.1";
  id: string;
  issuer: string;
  subject: string;
  issued_at: string;
  not_before?: string;
  expires_at: string;
  scope: { actions: ScopeAction[]; counterparties: string[]; data: DataAccess };
  budget?: { amount: string; currency: string; per_action_max?: string };
  delegation: { max_depth: number; parent?: { id: string; hash: string } };
  revocation: { url: string; list_id: string; authority: string };
  escalation: { mode: "deny" | "require_confirmation" | "notify"; url?: string };
  extensions?: Record<string, Json>;
  signature: Signature;
};

export type Receipt = {
  type: "tiba.receipt";
  version: "0.1";
  id: string;
  mandate_id: string;
  mandate_hash: string;
  mandate_chain: Mandate[];
  action: Action;
  input_hash: string;
  output_hash: string;
  result: "success" | "failure" | "denied";
  reason?: string;
  executed_at: string;
  actor: string;
  evidence?: Array<{ type: string; reference: string; network?: string; url?: string; hash?: string }>;
  extensions?: Record<string, Json>;
  signature: Signature;
};

export type RevocationList = {
  type: "tiba.revocation_list";
  version: "0.1";
  id: string;
  issuer: string;
  list_id: string;
  issued_at: string;
  next_update?: string;
  revoked: Array<{ mandate_id: string; revoked_at: string; reason?: string }>;
  signature: Signature;
};

export type TibaErrorCode =
  | "TIBA_SCHEMA_INVALID"
  | "TIBA_CANONICALIZATION_FAILED"
  | "TIBA_DID_KEY_INVALID"
  | "TIBA_SIGNATURE_INVALID"
  | "TIBA_HASH_MISMATCH"
  | "TIBA_CHAIN_INVALID"
  | "TIBA_DELEGATION_WIDENED"
  | "TIBA_NOT_YET_VALID"
  | "TIBA_EXPIRED"
  | "TIBA_REVOKED"
  | "TIBA_REVOCATION_UNAVAILABLE"
  | "TIBA_REVOCATION_INVALID"
  | "TIBA_REVOCATION_STALE"
  | "TIBA_SCOPE_DENIED"
  | "TIBA_COUNTERPARTY_DENIED"
  | "TIBA_DATA_DENIED"
  | "TIBA_CURRENCY_MISMATCH"
  | "TIBA_BUDGET_EXCEEDED"
  | "TIBA_ESCALATION_REQUIRED"
  | "TIBA_UNSUPPORTED_CONSTRAINT"
  | "TIBA_RECEIPT_MANDATE_MISMATCH"
  | "TIBA_AUDIT_PERSISTENCE_FAILED";

export type Check = { ok: true } | { ok: false; code: TibaErrorCode; message: string };

export type PermissionDraft = {
  scope: Mandate["scope"];
  budget: Mandate["budget"] | null;
  delegation: Mandate["delegation"];
  revocation: Omit<Mandate["revocation"], "authority">;
  escalation: Mandate["escalation"];
  explanation: string;
};

export type LocalPermissionSlip = {
  mandate: Mandate;
  instruction: string;
  revoked_at?: string;
};
