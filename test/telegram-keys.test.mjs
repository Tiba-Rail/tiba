import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { planTelegramLinks } from "../scripts/telegram-keys-preflight.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const agents = [
  { id: "ws-a", apiKeyHash: sha256("agent-a"), ownerTokenHash: sha256("owner-a") },
  { id: "ws-b", apiKeyHash: sha256("agent-b"), ownerTokenHash: sha256("owner-b") }
];

test("a Telegram chat is linked only when both of its keys belong to one workspace", () => {
  const plan = planTelegramLinks(
    [
      { chatId: "1", agentKey: "agent-a", ownerKey: "owner-a" },
      { chatId: "2", agentKey: "agent-a", ownerKey: "owner-b" },
      { chatId: "3", agentKey: "rotated-away", ownerKey: "owner-a" }
    ],
    agents
  );
  assert.deepEqual(plan, [
    { chatId: "1", agentId: "ws-a" },
    { chatId: "2", agentId: null },
    { chatId: "3", agentId: null }
  ]);
});
