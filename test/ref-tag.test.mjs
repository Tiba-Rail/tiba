import assert from "node:assert/strict";
import test from "node:test";
import { firstTouch, normalizeRef, parseStored, refForWallet } from "../src/lib/ref-tag.ts";

const bid = "0123456789abcdef0123456789abcdef";
const t1 = new Date("2026-09-18T01:30:00.000Z");
const t2 = new Date("2026-09-19T01:30:00.000Z");

test("only content refs are accepted", () => {
  assert.equal(normalizeRef("x0918a"), "x0918a");
  assert.equal(normalizeRef(" LI0919A "), "li0919a");
  assert.equal(normalizeRef("stmy1"), "stmy1");
  assert.equal(normalizeRef("evil<script>"), null);
  assert.equal(normalizeRef("google"), null);
  assert.equal(normalizeRef(undefined), null);
});

test("first landing wins and a later ref never overwrites it", () => {
  const first = firstTouch(null, "x0918a", t1, bid);
  assert.equal(first.ref, "x0918a");
  const second = firstTouch(first, "li0919a", t2, "f".repeat(32));
  assert.deepEqual(second, first, "a second visit with ?ref=li0919a does not overwrite");
});

test("a ref-less landing keeps the browser id and gains its first ref later", () => {
  const plain = firstTouch(null, null, t1, bid);
  assert.equal(plain.ref, null);
  const tagged = firstTouch(plain, "x0918a", t2, "f".repeat(32));
  assert.equal(tagged.ref, "x0918a");
  assert.equal(tagged.bid, bid);
});

test("browse to /start without the ref: the wallet still carries the stored ref", () => {
  const stored = JSON.stringify(firstTouch(null, "x0918a", t1, bid));
  // body from localStorage
  assert.deepEqual(refForWallet({ ref: "x0918a", ref_browser: bid }, null), { contentRef: "x0918a", refBrowserId: bid });
  // localStorage blocked: cookie backup, URL-encoded as the browser writes it
  assert.deepEqual(refForWallet({}, encodeURIComponent(stored)), { contentRef: "x0918a", refBrowserId: bid });
  // nothing stored: unattributed
  assert.deepEqual(refForWallet({}, null), { contentRef: null, refBrowserId: null });
  // junk is never written onto the row
  assert.deepEqual(refForWallet({ ref: "drop table", ref_browser: "x" }, "garbage"), { contentRef: null, refBrowserId: null });
  assert.equal(parseStored("not json"), null);
});
