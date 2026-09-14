import {
  base58Decode,
  base64urlToBytes,
  bytesToBase64url,
  canonicalize,
  withoutSignature
} from "./browser-crypto";
import type {
  Action,
  Check,
  Mandate,
  Receipt,
  RevocationList,
  TibaErrorCode
} from "./types";

type Failure = Extract<Check, { ok: false }>;
type ChainCheck =
  | { ok: true; leaf: Mandate; root: Mandate }
  | Failure;
type Authorization =
  | { ok: true; leaf: Mandate; root: Mandate; spent?: string }
  | Failure;

export type VerifyReceiptOptions = {
  revocation_list?: RevocationList;
  prior_receipts?: Receipt[];
  require_revocation?: boolean;
};

const ID = /^[A-Za-z0-9._:-]+$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/;
const CURRENCY = /^[A-Z][A-Z0-9._-]{1,15}$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const ESCALATION_RANK = { notify: 0, require_confirmation: 1, deny: 2 } as const;

function failure(code: TibaErrorCode, message: string): Failure {
  return { ok: false, code, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyKnownKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && ID.test(value);
}

function validDecimal(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function validSelector(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes(" ") && (value === "*" || !value.includes("*"));
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, millisecond] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second
    && date.getUTCMilliseconds() === millisecond;
}

function uniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^sha256-[A-Za-z0-9_-]{43}$/.test(value);
}

function hasKnownExtensions(value: unknown): boolean {
  return !value || (isObject(value) && Object.keys(value).length === 0);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function hashBytes(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes)));
  return `sha256-${bytesToBase64url(digest)}`;
}

export async function hashObject(value: unknown): Promise<string> {
  return hashBytes(canonicalize(value));
}

async function publicKeyFromDid(did: string): Promise<CryptoKey> {
  if (!did.startsWith("did:key:z")) throw new Error("Tiba requires a did:key Ed25519 identifier.");
  const decoded = base58Decode(did.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("did:key is not the Ed25519 multicodec.");
  }
  try {
    return await crypto.subtle.importKey("raw", ownedArrayBuffer(decoded.slice(2)), { name: "Ed25519" }, false, ["verify"]);
  } catch {
    throw new Error("did:key could not be decoded as Ed25519.");
  }
}

export async function verifyObjectSignature(value: Record<string, unknown>, expectedDid?: string): Promise<Check> {
  const signature = value.signature;
  if (
    !isObject(signature)
    || !onlyKnownKeys(signature, ["alg", "kid", "value"])
    || signature.alg !== "Ed25519"
    || typeof signature.kid !== "string"
    || typeof signature.value !== "string"
    || !/^[A-Za-z0-9_-]{86}$/.test(signature.value)
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Object is missing a valid Ed25519 signature object.");
  }
  if (expectedDid && signature.kid !== expectedDid) {
    return failure("TIBA_SIGNATURE_INVALID", "Signature kid does not match object identity.");
  }
  try {
    const signedBytes = new TextEncoder().encode(canonicalize(withoutSignature(value)));
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      await publicKeyFromDid(signature.kid),
      ownedArrayBuffer(base64urlToBytes(signature.value)),
      ownedArrayBuffer(signedBytes)
    );
    return valid ? { ok: true } : failure("TIBA_SIGNATURE_INVALID", "Ed25519 signature verification failed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ed25519 signature verification failed.";
    return failure(
      /did:key|base58|Ed25519/.test(message) ? "TIBA_DID_KEY_INVALID" : "TIBA_SIGNATURE_INVALID",
      message
    );
  }
}

function validateDataAccess(value: unknown, exact = false): Check {
  if (!isObject(value) || !onlyKnownKeys(value, ["read", "write"]) || !Array.isArray(value.read) || !Array.isArray(value.write)) {
    return failure("TIBA_SCHEMA_INVALID", "Data access must contain only read and write arrays.");
  }
  for (const direction of ["read", "write"] as const) {
    const entries = value[direction] as unknown[];
    if (
      !entries.every((entry) => validSelector(entry) && (!exact || entry !== "*"))
      || !uniqueStrings(entries as string[])
    ) {
      return failure("TIBA_SCHEMA_INVALID", `Invalid data_access.${direction} selector.`);
    }
  }
  return { ok: true };
}

function validateScope(scope: unknown): Check {
  if (
    !isObject(scope)
    || !onlyKnownKeys(scope, ["actions", "counterparties", "data"])
    || !Array.isArray(scope.actions)
    || scope.actions.length === 0
    || !Array.isArray(scope.counterparties)
    || scope.counterparties.length === 0
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Mandate scope must include non-empty actions/counterparties and data rules.");
  }
  for (const entry of scope.actions) {
    if (
      !isObject(entry)
      || !onlyKnownKeys(entry, ["protocol", "action", "resource", "tool"])
      || ![entry.protocol, entry.action, entry.resource, entry.tool].every(validSelector)
    ) {
      return failure("TIBA_SCHEMA_INVALID", "Every scope action needs valid protocol/action/resource/tool selectors.");
    }
  }
  if (!scope.counterparties.every(validSelector) || !uniqueStrings(scope.counterparties as string[])) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid counterparty selector.");
  }
  return validateDataAccess(scope.data);
}

function validateAction(action: unknown): Check {
  if (
    !isObject(action)
    || !onlyKnownKeys(action, ["protocol", "action", "resource", "tool", "counterparty", "data_access", "amount", "currency"])
    || ![action.protocol, action.action, action.resource, action.tool, action.counterparty].every(validSelector)
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Receipt action requires exact protocol/action/resource/tool/counterparty/data_access fields.");
  }
  if ([action.protocol, action.action, action.resource, action.tool, action.counterparty].some((item) => item === "*")) {
    return failure("TIBA_SCHEMA_INVALID", "Receipt action selectors must be exact, not wildcards.");
  }
  const dataAccess = validateDataAccess(action.data_access, true);
  if (!dataAccess.ok) return dataAccess;
  if ((action.amount === undefined) !== (action.currency === undefined)) {
    return failure("TIBA_SCHEMA_INVALID", "Receipt amount and currency must appear together.");
  }
  if (
    action.amount !== undefined
    && (!validDecimal(action.amount) || !CURRENCY.test(String(action.currency)))
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid receipt amount or currency.");
  }
  return { ok: true };
}

function validateEvidence(evidence: unknown): Check {
  if (evidence === undefined) return { ok: true };
  if (!Array.isArray(evidence)) return failure("TIBA_SCHEMA_INVALID", "Receipt evidence must be an array.");
  for (const item of evidence) {
    if (
      !isObject(item)
      || !onlyKnownKeys(item, ["type", "reference", "network", "url", "hash"])
      || typeof item.type !== "string"
      || item.type.length === 0
      || item.type.length > 100
      || typeof item.reference !== "string"
      || item.reference.length === 0
      || item.reference.length > 2048
      || (item.network !== undefined && (typeof item.network !== "string" || item.network.length === 0 || item.network.length > 100))
      || (item.url !== undefined && !validUrl(item.url))
      || (item.hash !== undefined && !isHash(item.hash))
    ) {
      return failure("TIBA_SCHEMA_INVALID", "Receipt evidence item is invalid.");
    }
  }
  return { ok: true };
}

function hasRequiredSolanaEvidence(receipt: Record<string, unknown>): boolean {
  const action = receipt.action as Record<string, unknown>;
  if (
    receipt.result !== "success"
    || action.protocol !== "payment"
    || action.action !== "transfer"
    || action.resource !== "solana:devnet"
    || action.tool !== "transfer_checked"
  ) {
    return true;
  }
  return Array.isArray(receipt.evidence) && receipt.evidence.some((item) =>
    isObject(item)
    && item.type === "solana_transaction"
    && item.network === "solana-devnet"
    && typeof item.reference === "string"
    && item.url === `https://explorer.solana.com/tx/${item.reference}?cluster=devnet`
  );
}

export async function verifyMandate(mandate: unknown): Promise<Check> {
  if (
    !isObject(mandate)
    || mandate.type !== "tiba.mandate"
    || mandate.version !== "0.1"
    || !validId(mandate.id)
    || typeof mandate.issuer !== "string"
    || typeof mandate.subject !== "string"
    || !validTimestamp(mandate.issued_at)
    || !validTimestamp(mandate.expires_at)
    || !isObject(mandate.delegation)
    || !isObject(mandate.revocation)
    || !isObject(mandate.escalation)
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Not a complete Tiba v0.1 Mandate.");
  }
  if (
    !onlyKnownKeys(mandate, [
      "type",
      "version",
      "id",
      "issuer",
      "subject",
      "issued_at",
      "not_before",
      "expires_at",
      "scope",
      "budget",
      "delegation",
      "revocation",
      "escalation",
      "extensions",
      "signature"
    ])
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Mandate has unknown top-level fields.");
  }
  try {
    await publicKeyFromDid(mandate.issuer);
    await publicKeyFromDid(mandate.subject);
    await publicKeyFromDid(String(mandate.revocation.authority));
  } catch (error) {
    return failure("TIBA_DID_KEY_INVALID", error instanceof Error ? error.message : "Invalid did:key.");
  }
  if (
    Date.parse(mandate.expires_at) <= Date.parse(mandate.issued_at)
    || (mandate.not_before && (!validTimestamp(mandate.not_before) || Date.parse(mandate.not_before) > Date.parse(mandate.expires_at)))
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Mandate time window is invalid.");
  }
  const scope = validateScope(mandate.scope);
  if (!scope.ok) return scope;
  const delegationDepth = mandate.delegation.max_depth;
  if (
    !onlyKnownKeys(mandate.delegation, ["max_depth", "parent"])
    || typeof delegationDepth !== "number"
    || !Number.isInteger(delegationDepth)
    || delegationDepth < 0
    || delegationDepth > 8
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid delegation max_depth.");
  }
  if (
    mandate.delegation.parent
    && (
      !isObject(mandate.delegation.parent)
      || !onlyKnownKeys(mandate.delegation.parent, ["id", "hash"])
      || !validId(mandate.delegation.parent.id)
      || !isHash(mandate.delegation.parent.hash)
    )
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid delegation parent reference.");
  }
  if (
    !onlyKnownKeys(mandate.revocation, ["url", "list_id", "authority"])
    || !validUrl(mandate.revocation.url)
    || !validId(mandate.revocation.list_id)
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid revocation configuration.");
  }
  const escalationMode = mandate.escalation.mode;
  const escalationUrl = mandate.escalation.url;
  if (
    !onlyKnownKeys(mandate.escalation, ["mode", "url"])
    || typeof escalationMode !== "string"
    || !Object.prototype.hasOwnProperty.call(ESCALATION_RANK, escalationMode)
    || (escalationUrl !== undefined && !validUrl(escalationUrl))
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Invalid escalation mode.");
  }
  if (mandate.budget !== undefined) {
    if (
      !isObject(mandate.budget)
      || !onlyKnownKeys(mandate.budget, ["amount", "currency", "per_action_max"])
      || !validDecimal(mandate.budget.amount)
      || !CURRENCY.test(String(mandate.budget.currency))
      || (mandate.budget.per_action_max !== undefined && !validDecimal(mandate.budget.per_action_max))
    ) {
      return failure("TIBA_SCHEMA_INVALID", "Invalid mandate budget.");
    }
  }
  if (!hasKnownExtensions(mandate.extensions)) {
    return failure("TIBA_UNSUPPORTED_CONSTRAINT", "This verifier does not understand a mandate extension.");
  }
  return verifyObjectSignature(mandate, mandate.issuer);
}

function selectorAllows(parent: string, child: string): boolean {
  return parent === "*" || parent === child;
}

function actionAllows(
  rule: { protocol: string; action: string; resource: string; tool: string },
  action: { protocol: string; action: string; resource: string; tool: string }
): boolean {
  return selectorAllows(rule.protocol, action.protocol)
    && selectorAllows(rule.action, action.action)
    && selectorAllows(rule.resource, action.resource)
    && selectorAllows(rule.tool, action.tool);
}

function everyAllowed(child: string[], parent: string[]): boolean {
  return child.every((value) => parent.some((allowed) => selectorAllows(allowed, value)));
}

function decimalParts(value: string): [bigint, number] {
  const [integer, fraction = ""] = value.split(".");
  return [BigInt(`${integer}${fraction}`), fraction.length];
}

function decimalCompare(left: string, right: string): number {
  const [leftInteger, leftPlaces] = decimalParts(left);
  const [rightInteger, rightPlaces] = decimalParts(right);
  const places = Math.max(leftPlaces, rightPlaces);
  const adjustedLeft = leftInteger * 10n ** BigInt(places - leftPlaces);
  const adjustedRight = rightInteger * 10n ** BigInt(places - rightPlaces);
  return adjustedLeft < adjustedRight ? -1 : adjustedLeft > adjustedRight ? 1 : 0;
}

function decimalAdd(values: string[]): string {
  const parts = values.map(decimalParts);
  const places = Math.max(0, ...parts.map(([, value]) => value));
  const amount = parts
    .reduce((total, [value, position]) => total + value * 10n ** BigInt(places - position), 0n)
    .toString()
    .padStart(places + 1, "0");
  if (places === 0) return amount;
  const whole = amount.slice(0, -places) || "0";
  const decimal = amount.slice(-places).replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : whole;
}

async function verifyNarrower(parent: Mandate, child: Mandate): Promise<Check> {
  if (
    !child.delegation.parent
    || child.delegation.parent.id !== parent.id
    || child.delegation.parent.hash !== await hashObject(parent)
  ) {
    return failure("TIBA_CHAIN_INVALID", "Child parent reference does not bind the preceding signed mandate.");
  }
  if (child.issuer !== parent.subject) return failure("TIBA_CHAIN_INVALID", "Child issuer must be the parent subject.");
  if (child.delegation.max_depth > parent.delegation.max_depth - 1) {
    return failure("TIBA_DELEGATION_WIDENED", "Child delegation depth exceeds its parent remainder.");
  }
  if (
    Date.parse(child.issued_at) < Date.parse(parent.issued_at)
    || Date.parse(child.not_before ?? child.issued_at) < Date.parse(parent.not_before ?? parent.issued_at)
    || Date.parse(child.expires_at) > Date.parse(parent.expires_at)
  ) {
    return failure("TIBA_DELEGATION_WIDENED", "Child lifetime widens parent authority.");
  }
  if (
    !child.scope.actions.every((rule) => parent.scope.actions.some((candidate) => actionAllows(candidate, rule)))
    || !everyAllowed(child.scope.counterparties, parent.scope.counterparties)
    || !everyAllowed(child.scope.data.read, parent.scope.data.read)
    || !everyAllowed(child.scope.data.write, parent.scope.data.write)
  ) {
    return failure("TIBA_DELEGATION_WIDENED", "Child scope is not a subset of its parent scope.");
  }
  if (parent.budget === undefined && child.budget !== undefined) {
    return failure("TIBA_DELEGATION_WIDENED", "A child cannot introduce a monetary budget.");
  }
  if (parent.budget && child.budget) {
    if (
      child.budget.currency !== parent.budget.currency
      || decimalCompare(child.budget.amount, parent.budget.amount) > 0
      || (
        parent.budget.per_action_max
        && (
          !child.budget.per_action_max
          || decimalCompare(child.budget.per_action_max, parent.budget.per_action_max) > 0
        )
      )
    ) {
      return failure("TIBA_DELEGATION_WIDENED", "Child budget widens parent budget.");
    }
  }
  if (
    parent.revocation.authority !== child.revocation.authority
    || parent.revocation.list_id !== child.revocation.list_id
    || parent.revocation.url !== child.revocation.url
  ) {
    return failure("TIBA_DELEGATION_WIDENED", "Child changed revocation control.");
  }
  if (
    ESCALATION_RANK[child.escalation.mode] < ESCALATION_RANK[parent.escalation.mode]
    || (
      child.escalation.url !== parent.escalation.url
      && ESCALATION_RANK[child.escalation.mode] === ESCALATION_RANK[parent.escalation.mode]
    )
  ) {
    return failure("TIBA_DELEGATION_WIDENED", "Child weakened escalation.");
  }
  if (!hasKnownExtensions(child.extensions)) {
    return failure("TIBA_UNSUPPORTED_CONSTRAINT", "This verifier does not understand a child extension.");
  }
  return { ok: true };
}

export async function verifyMandateChain(chain: unknown): Promise<ChainCheck> {
  if (!Array.isArray(chain) || chain.length === 0 || chain.length > 9) {
    return failure("TIBA_CHAIN_INVALID", "Mandate chain must contain 1 to 9 signed mandates.");
  }
  const mandates = chain as Mandate[];
  for (const mandate of mandates) {
    const check = await verifyMandate(mandate);
    if (!check.ok) return check;
  }
  if (mandates[0].delegation.parent) return failure("TIBA_CHAIN_INVALID", "Root mandate may not have a parent.");
  if (mandates.length - 1 > mandates[0].delegation.max_depth) {
    return failure("TIBA_CHAIN_INVALID", "Chain exceeds root max_depth.");
  }
  for (let index = 1; index < mandates.length; index += 1) {
    const check = await verifyNarrower(mandates[index - 1], mandates[index]);
    if (!check.ok) return check;
  }
  return { ok: true, root: mandates[0], leaf: mandates.at(-1)! };
}

export async function verifyRevocationList(
  list: unknown,
  mandate: Mandate,
  at = new Date()
): Promise<Check> {
  if (
    !isObject(list)
    || list.type !== "tiba.revocation_list"
    || list.version !== "0.1"
    || !validId(list.id)
    || list.issuer !== mandate.revocation.authority
    || list.list_id !== mandate.revocation.list_id
    || !validTimestamp(list.issued_at)
    || !Array.isArray(list.revoked)
  ) {
    return failure("TIBA_REVOCATION_INVALID", "Invalid revocation list for this mandate.");
  }
  if (!onlyKnownKeys(list, ["type", "version", "id", "issuer", "list_id", "issued_at", "next_update", "revoked", "signature"])) {
    return failure("TIBA_REVOCATION_INVALID", "Revocation list has unknown top-level fields.");
  }
  if (
    (list.next_update !== undefined && !validTimestamp(list.next_update))
    || !list.revoked.every((entry) =>
      isObject(entry)
      && validId(entry.mandate_id)
      && validTimestamp(entry.revoked_at)
      && (entry.reason === undefined || typeof entry.reason === "string")
      && onlyKnownKeys(entry, ["mandate_id", "revoked_at", "reason"])
    )
    || new Set(list.revoked.map((entry) => isObject(entry) ? entry.mandate_id : "")).size !== list.revoked.length
  ) {
    return failure("TIBA_REVOCATION_INVALID", "Revocation list contains an invalid entry.");
  }
  const signature = await verifyObjectSignature(list, mandate.revocation.authority);
  if (!signature.ok) return failure("TIBA_REVOCATION_INVALID", signature.message);
  if (list.next_update !== undefined && Date.parse(list.next_update) < at.getTime()) {
    return failure("TIBA_REVOCATION_STALE", "Revocation list is stale.");
  }
  return { ok: true };
}

async function isRevoked(chain: Mandate[], list: RevocationList | undefined, at: Date): Promise<Check> {
  if (!list) return { ok: true };
  const check = await verifyRevocationList(list, chain.at(-1)!, at);
  if (!check.ok) return check;
  const revoked = new Map(list.revoked.map((entry) => [entry.mandate_id, entry.revoked_at]));
  for (const mandate of chain) {
    const when = revoked.get(mandate.id);
    if (when && Date.parse(when) <= at.getTime()) {
      return failure("TIBA_REVOKED", `Mandate ${mandate.id} was revoked.`);
    }
  }
  return { ok: true };
}

function consumedBudget(receipts: Receipt[], chain: Mandate[]): string[] {
  const rootId = chain[0]?.id;
  return receipts
    .filter(
      (receipt) =>
        receipt.result === "success"
        && receipt.action.amount
        && receipt.action.currency
        && receipt.mandate_chain?.[0]?.id === rootId
    )
    .map((receipt) => receipt.action.amount!);
}

export async function authorizeAction(options: {
  mandate_chain: Mandate[];
  action: Action;
  at?: Date | string;
  revocation_list?: RevocationList;
  require_revocation?: boolean;
  prior_receipts?: Receipt[];
}): Promise<Authorization> {
  const chainCheck = await verifyMandateChain(options.mandate_chain);
  if (!chainCheck.ok) return chainCheck;
  const actionCheck = validateAction(options.action);
  if (!actionCheck.ok) return actionCheck;
  const at = typeof options.at === "string" ? new Date(options.at) : options.at ?? new Date();
  if (Number.isNaN(at.getTime())) return failure("TIBA_SCHEMA_INVALID", "Invalid action time.");
  const leaf = chainCheck.leaf;
  if (Date.parse(leaf.not_before ?? leaf.issued_at) > at.getTime()) {
    return failure("TIBA_NOT_YET_VALID", "Mandate is not effective yet.");
  }
  if (Date.parse(leaf.expires_at) <= at.getTime()) {
    return failure("TIBA_EXPIRED", "Mandate has expired.");
  }
  if (options.require_revocation && !options.revocation_list) {
    return failure("TIBA_REVOCATION_UNAVAILABLE", "No revocation list was supplied.");
  }
  const revoked = await isRevoked(options.mandate_chain, options.revocation_list, at);
  if (!revoked.ok) return revoked;
  if (!leaf.scope.actions.some((rule) => actionAllows(rule, options.action))) {
    return failure("TIBA_SCOPE_DENIED", "Action tuple is not in mandate scope.");
  }
  if (!everyAllowed([options.action.counterparty], leaf.scope.counterparties)) {
    return failure("TIBA_COUNTERPARTY_DENIED", "Counterparty is not in mandate scope.");
  }
  if (
    !everyAllowed(options.action.data_access.read, leaf.scope.data.read)
    || !everyAllowed(options.action.data_access.write, leaf.scope.data.write)
  ) {
    return failure("TIBA_DATA_DENIED", "Requested data access is not in mandate scope.");
  }
  if (options.action.amount) {
    for (const mandate of options.mandate_chain) {
      if (!mandate.budget) return failure("TIBA_BUDGET_EXCEEDED", "Mandate does not authorize monetary actions.");
      if (options.action.currency !== mandate.budget.currency) {
        return failure("TIBA_CURRENCY_MISMATCH", "Action currency does not match mandate budget.");
      }
      if (
        mandate.budget.per_action_max
        && decimalCompare(options.action.amount, mandate.budget.per_action_max) > 0
      ) {
        return failure("TIBA_BUDGET_EXCEEDED", "Action exceeds per-action budget.");
      }
    }
    const spent = decimalAdd([
      ...consumedBudget(options.prior_receipts ?? [], options.mandate_chain),
      options.action.amount
    ]);
    if (options.mandate_chain.some((mandate) => decimalCompare(spent, mandate.budget!.amount) > 0)) {
      return failure("TIBA_BUDGET_EXCEEDED", "Action exceeds remaining mandate budget.");
    }
    if (leaf.escalation.mode === "require_confirmation") {
      return failure("TIBA_ESCALATION_REQUIRED", "Mandate requires a fresh human confirmation.");
    }
    return { ok: true, leaf, root: chainCheck.root, spent };
  }
  if (leaf.escalation.mode === "require_confirmation") {
    return failure("TIBA_ESCALATION_REQUIRED", "Mandate requires a fresh human confirmation.");
  }
  return { ok: true, leaf, root: chainCheck.root };
}

export async function verifyReceipt(
  receipt: unknown,
  options: VerifyReceiptOptions = {}
): Promise<Check> {
  if (
    !isObject(receipt)
    || receipt.type !== "tiba.receipt"
    || receipt.version !== "0.1"
    || !validId(receipt.id)
    || !validId(receipt.mandate_id)
    || !isHash(receipt.mandate_hash)
    || !Array.isArray(receipt.mandate_chain)
    || !validTimestamp(receipt.executed_at)
    || typeof receipt.actor !== "string"
    || !isHash(receipt.input_hash)
    || !isHash(receipt.output_hash)
    || !["success", "failure", "denied"].includes(String(receipt.result))
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Not a complete Tiba v0.1 Receipt.");
  }
  if (
    !onlyKnownKeys(receipt, [
      "type",
      "version",
      "id",
      "mandate_id",
      "mandate_hash",
      "mandate_chain",
      "action",
      "input_hash",
      "output_hash",
      "result",
      "reason",
      "executed_at",
      "actor",
      "evidence",
      "extensions",
      "signature"
    ])
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Receipt has unknown top-level fields.");
  }
  const action = validateAction(receipt.action);
  if (!action.ok) return action;
  const evidence = validateEvidence(receipt.evidence);
  if (!evidence.ok) return evidence;
  if (!hasRequiredSolanaEvidence(receipt)) {
    return failure("TIBA_SCHEMA_INVALID", "A successful Solana devnet payment receipt needs canonical solana_transaction evidence.");
  }
  if (
    receipt.result === "denied"
    && (typeof receipt.reason !== "string" || !/^TIBA_[A-Z0-9_]+$/.test(receipt.reason))
  ) {
    return failure("TIBA_SCHEMA_INVALID", "Denied receipts need a Tiba error reason.");
  }
  if (!hasKnownExtensions(receipt.extensions)) {
    return failure("TIBA_UNSUPPORTED_CONSTRAINT", "This verifier does not understand a receipt extension.");
  }
  const chainCheck = await verifyMandateChain(receipt.mandate_chain);
  if (!chainCheck.ok) return chainCheck;
  const leaf = chainCheck.leaf;
  if (
    receipt.mandate_id !== leaf.id
    || receipt.mandate_hash !== await hashObject(leaf)
    || receipt.actor !== leaf.subject
  ) {
    return failure("TIBA_RECEIPT_MANDATE_MISMATCH", "Receipt does not bind the active mandate and actor.");
  }
  const signature = await verifyObjectSignature(receipt, receipt.actor);
  if (!signature.ok) return signature;
  if (receipt.result === "denied") return { ok: true };
  const authorization = await authorizeAction({
    mandate_chain: receipt.mandate_chain as Mandate[],
    action: receipt.action as Action,
    at: receipt.executed_at,
    revocation_list: options.revocation_list,
    prior_receipts: options.prior_receipts,
    require_revocation: options.require_revocation
  });
  return authorization.ok ? { ok: true } : authorization;
}
