const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

// ponytail: per-instance memory, so each serverless instance counts on its own. The daily cap on
// live workspaces (onboardingRail) is the deployment-wide bound; move this to Postgres if needed.
const store = new Map<string, { count: number; resetAt: number }>();

/**
 * The caller's IP for rate limiting. The first x-forwarded-for value is whatever the client sent,
 * so it is never used. On Vercel, x-real-ip is set by Vercel's edge and client-sent values are
 * overwritten. Elsewhere only the last hop, the one the nearest proxy appended, is trusted.
 */
export function clientIp(headers: Headers, onVercel = Boolean(process.env.VERCEL)): string {
  if (onVercel) {
    const ip = headers.get("x-real-ip")?.trim();
    if (ip) return ip;
  }
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

export function rateLimit(ip: string): { ok: boolean; resetAt: number } {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, resetAt: now + WINDOW_MS };
  }
  if (entry.count < MAX_REQUESTS) {
    entry.count += 1;
    return { ok: true, resetAt: entry.resetAt };
  }
  return { ok: false, resetAt: entry.resetAt };
}

/** Live (treasury-backed) workspaces one signed-in account may create. */
export const LIVE_WORKSPACES_PER_USER = 3;

/**
 * Settlement rail for a new workspace. Anonymous sign-ups get the simulated rail, so nobody
 * unauthenticated can make the shared treasury sign a transfer. A signed-in account gets Solana
 * devnet while it is under LIVE_WORKSPACES_PER_USER and the deployment is under its daily cap.
 * Anything else, including a malformed cap, falls back to simulated.
 */
export function onboardingRail(input: {
  signedIn: boolean;
  userLiveWorkspaces: number;
  liveWorkspacesToday: number;
  dailyCap: number;
}): "solana" | "mock" {
  if (!input.signedIn) return "mock";
  if (input.userLiveWorkspaces >= LIVE_WORKSPACES_PER_USER) return "mock";
  return input.liveWorkspacesToday < input.dailyCap ? "solana" : "mock";
}
