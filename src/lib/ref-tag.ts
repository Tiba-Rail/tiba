// Content tracking tag (PRD_ContentManager.md 8.1, shared with Growth Lead question 9).
// First landing with ?ref= wins; later landings never overwrite it. A random browser id
// is stored alongside so a wallet made without an account counts once per browser.
export const REF_KEY = "tiba_ref";
const REF_RE = /^(x|li|stmy|alta|kl)[a-z0-9]{1,16}$/;
const BID_RE = /^[a-f0-9]{32}$/;

export type StoredRef = { ref: string | null; at: string; bid: string };

export function normalizeRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ref = value.trim().toLowerCase();
  return REF_RE.test(ref) ? ref : null;
}

export function validBrowserId(value: unknown): string | null {
  return typeof value === "string" && BID_RE.test(value) ? value : null;
}

export function parseStored(raw: string | null | undefined): StoredRef | null {
  if (!raw) return null;
  for (const text of [raw, safeDecode(raw)]) {
    try {
      const o = JSON.parse(text) as Partial<StoredRef>;
      const bid = validBrowserId(o.bid);
      if (bid) return { ref: normalizeRef(o.ref), at: String(o.at ?? ""), bid };
    } catch { /* try the next form */ }
  }
  return null;
}

function safeDecode(raw: string) {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/** First touch wins: an existing ref is never replaced; a ref-less record gains its first ref. */
export function firstTouch(existing: StoredRef | null, incoming: unknown, now: Date, bid: string): StoredRef {
  if (existing?.ref) return existing;
  const ref = normalizeRef(incoming);
  if (existing) return ref ? { ref, at: now.toISOString(), bid: existing.bid } : existing;
  return { ref, at: now.toISOString(), bid };
}

/** What the wallet row gets: body first (from the browser store), cookie as backup. */
export function refForWallet(body: Record<string, unknown>, cookieRaw: string | null | undefined) {
  const cookie = parseStored(cookieRaw);
  return {
    contentRef: normalizeRef(body.ref) ?? cookie?.ref ?? null,
    refBrowserId: validBrowserId(body.ref_browser) ?? cookie?.bid ?? null
  };
}
