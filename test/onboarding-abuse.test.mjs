import assert from "node:assert/strict";
import test from "node:test";
import { clientIp, LIVE_WORKSPACES_PER_USER, onboardingRail } from "../src/lib/rate-limit.ts";

test("a spoofed first x-forwarded-for value is never the rate-limit identity", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), false), "203.0.113.7", "the hop the nearest proxy appended");
  assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6" }), true), "198.51.100.2", "on Vercel, the IP its edge set");
  assert.equal(clientIp(new Headers({ "x-real-ip": "6.6.6.6" }), false), "unknown", "off Vercel, x-real-ip is client-settable");
  assert.equal(clientIp(new Headers(), false), "unknown");
});

test("anonymous onboarding never gets the treasury-backed rail", () => {
  const base = { userLiveWorkspaces: 0, liveWorkspacesToday: 0, dailyCap: 20 };
  assert.equal(onboardingRail({ ...base, signedIn: false }), "mock");
  assert.equal(onboardingRail({ ...base, signedIn: true }), "solana");
  assert.equal(onboardingRail({ ...base, signedIn: true, userLiveWorkspaces: LIVE_WORKSPACES_PER_USER }), "mock", "per-account cap");
  assert.equal(onboardingRail({ ...base, signedIn: true, liveWorkspacesToday: 20 }), "mock", "deployment-wide daily cap");
  assert.equal(onboardingRail({ ...base, signedIn: true, dailyCap: Number("not-a-number") }), "mock", "a malformed cap fails closed");
});
