import assert from "node:assert/strict";
import test from "node:test";
import { signupRefFrom } from "../src/lib/signup-ref.ts";

// Not a secret: the nil UUID, an obviously-fake placeholder (all zeros), not a real receipt
// token. A prior value here (RFC 4122's own example UUID) tripped GitGuardian's high-entropy
// secret scanner as a false positive -- this file never held credentials, only a shape check.
const TOKEN = "00000000-0000-0000-0000-000000000000";

test("ref captured on signup", () => {
  assert.equal(signupRefFrom(TOKEN), TOKEN, "a receipt token is kept");
  assert.equal(signupRefFrom(`  ${TOKEN.toUpperCase()}  `), TOKEN, "the stored value is the token, trimmed");
  assert.equal(signupRefFrom(undefined), null, "a workspace opened with no ref stores nothing");
  assert.equal(signupRefFrom(""), null);
  assert.equal(signupRefFrom("not-a-receipt"), null, "a crafted ref is not stored");
  assert.equal(signupRefFrom("javascript:alert(1)"), null);
});
