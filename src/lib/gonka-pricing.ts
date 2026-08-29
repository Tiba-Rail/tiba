export interface GnkUsdRate {
  value: string;
  updatedAt: Date | null;
}

let cached: { expiresAt: number; rate: GnkUsdRate | null } = { expiresAt: 0, rate: null };

export async function getGnkUsdRate(fetcher: typeof fetch = fetch): Promise<GnkUsdRate | null> {
  const now = Date.now();
  if (cached.expiresAt > now) return cached.rate;
  try {
    const response = await fetcher("https://api.gonkarouter.io/api/pricing", {
      next: { revalidate: 60 }
    });
    if (!response.ok) throw new Error("pricing unavailable");
    const body = await response.json() as { gnk_usd?: unknown; updated_at?: unknown };
    if (typeof body.gnk_usd !== "string" || !/^\d+(\.\d+)?$/.test(body.gnk_usd)) {
      throw new Error("pricing missing gnk_usd");
    }
    const updatedAt = typeof body.updated_at === "string" ? new Date(body.updated_at) : null;
    const rate = {
      value: body.gnk_usd,
      updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null
    };
    cached = { expiresAt: now + 60_000, rate };
    return rate;
  } catch {
    cached = { expiresAt: now + 60_000, rate: null };
    return null;
  }
}
