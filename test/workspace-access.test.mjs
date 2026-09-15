import assert from "node:assert/strict";
import test from "node:test";
import { pickWorkspace } from "../src/lib/workspace-access.ts";

const mine = [{ id: "ws-from-owner-key" }, { id: "ws-from-sign-in" }];

test("a workspace page shows the viewer's own workspace by default", () => {
  assert.equal(pickWorkspace(mine)?.id, "ws-from-owner-key");
  assert.equal(pickWorkspace([]), null, "no proof of ownership means the unlock screen");
});

test("a requested workspace is shown only to its owner", () => {
  assert.equal(pickWorkspace(mine, "ws-from-sign-in")?.id, "ws-from-sign-in");
  assert.equal(pickWorkspace(mine, "someone-elses-workspace"), null, "a guessed ?agent= id reveals nothing");
  assert.equal(pickWorkspace([], "ws-from-owner-key"), null);
});
