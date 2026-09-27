import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent } from "undici";

export const X402_URL_NOT_ALLOWED = "X402_URL_NOT_ALLOWED";
/** Sellers that do not answer in this long are treated as unreachable. */
export const X402_FETCH_TIMEOUT_MS = 20_000;

export type ResolvedAddress = { address: string; family: number };
export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

// Loopback, private, link-local (cloud metadata lives at 169.254.169.254), CGNAT, multicast,
// "this network", reserved, and their IPv6 counterparts. BlockList checks IPv4-mapped IPv6
// (::ffff:a.b.c.d) against the IPv4 rules itself, so those need no rule of their own.
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export function addressIsBlocked(entry: ResolvedAddress): boolean {
  const family = entry.family === 6 ? "ipv6" : "ipv4";
  // Anything BlockList cannot parse is refused rather than trusted.
  try {
    return blocked.check(entry.address, family);
  } catch {
    return true;
  }
}

export type AllowedX402Target = { url: URL; addresses: ResolvedAddress[] };

/**
 * The only addresses the x402 buyer may fetch: https, to a public host. Resolves the host and
 * refuses when any answer is a private, loopback, link-local or otherwise non-public address.
 * Returns the exact addresses that were checked, so a caller that connects with them (rather
 * than re-resolving) never re-opens the gap between this check and the real connection.
 */
export async function resolveX402UrlIfAllowed(url: string | URL, lookup: AddressLookup = defaultLookup): Promise<AllowedX402Target> {
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error(X402_URL_NOT_ALLOWED);
  }
  if (parsed.protocol !== "https:") throw new Error(X402_URL_NOT_ALLOWED);
  if (parsed.username || parsed.password) throw new Error(X402_URL_NOT_ALLOWED);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new Error(X402_URL_NOT_ALLOWED);

  let addresses: ResolvedAddress[];
  const literal = isIP(host);
  if (literal) {
    addresses = [{ address: host, family: literal }];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new Error(X402_URL_NOT_ALLOWED);
    }
  }
  if (addresses.length === 0 || addresses.some(addressIsBlocked)) throw new Error(X402_URL_NOT_ALLOWED);
  return { url: parsed, addresses };
}

/** Same check, for a caller that only needs the URL back (kept for callers that don't connect themselves). */
export async function assertX402UrlAllowed(url: string | URL, lookup: AddressLookup = defaultLookup): Promise<URL> {
  return (await resolveX402UrlIfAllowed(url, lookup)).url;
}

/**
 * fetch for seller addresses the caller names. Redirects are not followed (a public host could
 * otherwise bounce the request to an internal one), and every request has a timeout.
 *
 * The connection is pinned to exactly the addresses resolveX402UrlIfAllowed already checked,
 * via an undici Agent whose connect.lookup hands those straight to the TCP connect instead of
 * letting Node re-resolve the hostname: resolve-then-fetch otherwise leaves a DNS-rebinding gap
 * where a seller's DNS answers a public address for the check and a private one moments later
 * for the real connection.
 */
export function guardedX402Fetch(fetchImpl: typeof fetch = fetch, lookup: AddressLookup = defaultLookup): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = input instanceof Request ? input.url : input;
    const { url, addresses } = await resolveX402UrlIfAllowed(target, lookup);
    const pinned = new Agent({
      connect: {
        lookup: (_hostname: string, _options: unknown, callback: (err: Error | null, addresses: ResolvedAddress[]) => void) =>
          callback(null, addresses)
      }
    });
    try {
      return await fetchImpl(url, {
        ...init,
        redirect: "manual",
        // @ts-expect-error dispatcher is undici's, not in the standard fetch types
        dispatcher: pinned,
        signal: init?.signal ?? AbortSignal.timeout(X402_FETCH_TIMEOUT_MS)
      });
    } finally {
      // Fire-and-forget: closing is cleanup, not part of the guard, and must never block or
      // fail the response the caller is waiting on.
      void pinned.close().catch(() => {});
    }
  }) as typeof fetch;
}
