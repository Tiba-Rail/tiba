// Read-only preview of migration 20260915010000_telegram_chats_store_workspace_not_keys (#6).
// It hashes each stored Telegram key pair with the app's own sha256 and reports which chats the
// migration will link to a workspace and which it will drop. Prints counts and the last four
// digits of dropped chat ids, never a key. Writes nothing.
//
//   node scripts/telegram-keys-preflight.mjs      (needs DATABASE_URL; run BEFORE the migration)
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** The migration's rule: a chat is linked only when both of its keys belong to one workspace. */
export function planTelegramLinks(chats, agents) {
  const byApiKeyHash = new Map(agents.map((agent) => [agent.apiKeyHash, agent]));
  return chats.map((chat) => {
    const agent = byApiKeyHash.get(sha256(chat.agentKey));
    const linked = Boolean(agent) && agent.ownerTokenHash === sha256(chat.ownerKey);
    return { chatId: chat.chatId, agentId: linked ? agent.id : null };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const { prisma } = await import("../src/lib/db.ts");
  const chats = await prisma.$queryRaw`SELECT "chat_id" AS "chatId", "agent_key" AS "agentKey", "owner_key" AS "ownerKey" FROM "telegram_chats"`;
  const agents = await prisma.agent.findMany({ select: { id: true, apiKeyHash: true, ownerTokenHash: true } });
  const plan = planTelegramLinks(chats, agents);
  const dropped = plan.filter((row) => !row.agentId);
  console.log(`${plan.length} connected Telegram chats: ${plan.length - dropped.length} will be linked to their workspace, ${dropped.length} will be dropped (they must /connect again).`);
  for (const row of dropped) console.log(`  drop chat ...${String(row.chatId).slice(-4)}`);
  await prisma.$disconnect();
}
