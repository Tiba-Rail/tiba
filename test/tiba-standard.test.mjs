import assert from "node:assert/strict";
import test from "node:test";
import { conservativeOfflineDraft } from "../src/lib/tiba-standard/offline-policy.ts";

test("a generic payment draft fails closed on an unnamed counterparty", () => {
  const draft = conservativeOfflineDraft("Pay up to 2 USDC for a supplier invoice.");

  assert.equal(draft.budget?.amount, "2");
  assert.deepEqual(draft.scope.counterparties, ["UNSPECIFIED_COUNTERPARTY"]);
  assert.match(draft.explanation, /Name the payment recipient/);
});

test("a quoted payment recipient is carried into the signed scope", () => {
  const draft = conservativeOfflineDraft('Pay up to 2 USDC to "Acme-42" for a supplier invoice.');

  assert.equal(draft.budget?.currency, "USDC");
  assert.deepEqual(draft.scope.counterparties, ["Acme-42"]);
  assert.doesNotMatch(draft.explanation, /Name the payment recipient/);
});
