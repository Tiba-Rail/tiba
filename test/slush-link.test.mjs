import assert from "node:assert/strict";
import test from "node:test";
import { slushBrowseUrl, isIosUserAgent } from "../src/lib/slush-link.ts";

test("the browse link is a raw path segment and carries no query or hash", () => {
  assert.equal(
    slushBrowseUrl("https://tiba-omega.vercel.app/fund?agent=abc#top"),
    "https://my.slush.app/browse/https://tiba-omega.vercel.app/fund"
  );
  assert.equal(
    slushBrowseUrl("https://tiba-omega.vercel.app/signin"),
    "https://my.slush.app/browse/https://tiba-omega.vercel.app/signin"
  );
});

test("only iPhones and iPads get the link", () => {
  assert.equal(isIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true);
  assert.equal(isIosUserAgent("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"), true);
  assert.equal(isIosUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(isIosUserAgent("Mozilla/5.0 (Linux; Android 14)"), false);
});
