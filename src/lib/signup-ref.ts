const RECEIPT_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The receipt a new workspace was opened from. Public receipt tokens are UUIDs.
 * Anything else is dropped so a crafted query string is never stored.
 */
export function signupRefFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!RECEIPT_TOKEN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
