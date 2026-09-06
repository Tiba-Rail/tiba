import type { NextRequest } from "next/server";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

const store = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
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
