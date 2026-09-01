import assert from "node:assert/strict";
import test from "node:test";
import { agentCard, payloadFromParts, taskFromIntent, taskState } from "../src/lib/a2a.ts";

test("payload is read from a DataPart or a JSON TextPart, else null", () => {
  const want = { recipient_ref: "translator-kl", artifact: "note" };
  assert.deepEqual(payloadFromParts([{ text: "Pay this" }, { data: want, mediaType: "application/json" }]), want);
  assert.deepEqual(payloadFromParts([{ text: JSON.stringify(want) }]), want);
  assert.equal(payloadFromParts([{ text: "not json" }, { data: { recipient_ref: "x" } }]), null);
  assert.equal(payloadFromParts("nope"), null);
});

test("decision classes map to 1.0 task states", () => {
  assert.equal(taskState({ status: "settled", decision_class: "PAID" }), "TASK_STATE_COMPLETED");
  assert.equal(taskState({ status: "refused", decision_class: "RED" }), "TASK_STATE_REJECTED");
  assert.equal(taskState({ status: "held", decision_class: "AMBER" }), "TASK_STATE_INPUT_REQUIRED");
  assert.equal(taskState({ status: "processing", decision_class: "AMBER" }), "TASK_STATE_WORKING");
});

test("task carries the decision artifact and echoes the message into history", () => {
  const intent = {
    id: "intent-1", status: "refused", decision_class: "RED", reason_code: "QUORUM_SPLIT:amount_micros",
    digest: null, explorer_url: null, public_token: "tok"
  };
  const task = taskFromIntent(intent, "https://x.test", { messageId: "m1", parts: [{ text: "hi" }] });
  assert.equal(task.id, "intent-1");
  assert.equal(task.contextId, "intent-1");
  assert.equal(task.status.state, "TASK_STATE_REJECTED");
  assert.deepEqual(task.artifacts[0].parts[0].data, {
    decision: "REFUSED", decision_class: "RED", status: "refused", reason_code: "QUORUM_SPLIT:amount_micros",
    digest: null, explorer_url: null, receipt_url: "https://x.test/r/tok"
  });
  assert.deepEqual(task.history, [{ messageId: "m1", parts: [{ text: "hi" }], role: "ROLE_USER", taskId: "intent-1", contextId: "intent-1" }]);
  assert.equal(taskFromIntent(intent, "https://x.test").history.length, 0);
});

test("agent card has the 1.0 required fields and points at /a2a", () => {
  const card = agentCard("https://x.test");
  for (const key of ["name", "description", "version", "supportedInterfaces", "capabilities", "defaultInputModes", "defaultOutputModes", "skills"]) {
    assert.ok(key in card, key);
  }
  assert.equal(card.supportedInterfaces[0].url, "https://x.test/a2a");
  assert.equal(card.skills[0].id, "authorize_and_settle_payout");
});
