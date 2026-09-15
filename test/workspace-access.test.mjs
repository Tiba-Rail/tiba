import assert from "node:assert/strict";
import test from "node:test";
import { pickWorkspace } from "../src/lib/workspace-access.ts";

const mine = [{ id: "ws-from-owner-key" }, { id: "ws-from-sign-in" }];
const demo = { id: "ws-demo" };

test("a workspace page shows the viewer's own workspace by default", () => {
  assert.deepEqual(pickWorkspace(mine), { workspace: mine[0], readOnly: false });
  assert.deepEqual(pickWorkspace(mine, null, demo), { workspace: mine[0], readOnly: false }, "an owner sees their own wallet, not the demo");
  assert.equal(pickWorkspace([]), null, "no proof of ownership and no demo wallet means the unlock screen");
});

test("a requested workspace is shown only to its owner", () => {
  assert.deepEqual(pickWorkspace(mine, "ws-from-sign-in"), { workspace: mine[1], readOnly: false });
  assert.equal(pickWorkspace(mine, "someone-elses-workspace"), null, "a guessed ?agent= id reveals nothing");
  assert.equal(pickWorkspace([], "ws-from-owner-key"), null);
  assert.equal(pickWorkspace([], "someone-elses-workspace", demo), null, "the demo wallet is never swapped in for a guessed id");
  assert.equal(pickWorkspace(mine, "someone-elses-workspace", demo), null);
});

test("the shared demo wallet is public, read-only", () => {
  assert.deepEqual(pickWorkspace([], undefined, demo), { workspace: demo, readOnly: true }, "what 'See the demo wallet' opens");
  assert.deepEqual(pickWorkspace(mine, "ws-demo", demo), { workspace: demo, readOnly: true }, "asked for by id");
  assert.deepEqual(pickWorkspace([demo], undefined, demo), { workspace: demo, readOnly: false }, "its owner can still act on it");
});
