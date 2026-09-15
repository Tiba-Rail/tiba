import { createHash, randomBytes } from "node:crypto";
import type { Agent } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { processPayoutIntent } from "@/lib/payout-intent";

// The Telegram agent used to run as a laptop process polling Telegram. It lives here now,
// so it is up whenever Tiba is up. Every step the user sees is a separate message: this is
// the demo, and the point is that a payment is visibly decided rather than silently sent.

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const DEFAULT_AGENT_KEY = process.env.TIBA_AGENT_KEY ?? "";

const SOLANA_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const PAYMENT_WORDS = /(pay|send|transfer|settle|invoice|wo-?\d+)/i;

// Infrastructure hiccups are worth retrying. A real disagreement never is.
const INFRA_REASONS = new Set([
  "INFERENCE_UNAVAILABLE",
  "MISSING_REQUIRED_CHANNEL",
  "SCHEMA_INVALID",
  "REQUEST_REJECTED"
]);

const ALIASES: Record<string, string> = {
  kltranslator: "translator-kl",
  translator: "translator-kl",
  translatorkl: "translator-kl",
  kl: "translator-kl",
  democreator: "creator-lagos",
  creator: "creator-lagos",
  lagos: "creator-lagos",
  ali: "ali"
};

// The workspace a chat pays from. A connected chat stores only the workspace id: /connect checks
// both keys once and keeps neither. Other chats use the shared demo wallet.
type Wallet = { agent: Agent; own: boolean };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// The regex only finds base58-shaped words; PublicKey confirms it decodes to a 32-byte key.
function solanaAddressIn(text: string): string | null {
  const candidate = text.match(SOLANA_ADDRESS)?.[0];
  if (!candidate) return null;
  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    return null;
  }
}

function usd(micros: unknown): string {
  return (Number(micros ?? 0) / 1e6).toFixed(2);
}

export function baseUrl(): string {
  const explicit = process.env.TIBA_BASE ?? process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "https://tiba-omega.vercel.app";
}

async function telegram(method: string, body: Record<string, unknown>): Promise<boolean> {
  if (!TELEGRAM_TOKEN) return false;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).catch(() => null);
  return Boolean(response?.ok);
}

async function send(chatId: string, text: string): Promise<void> {
  await telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

async function walletFor(chatId: string): Promise<Wallet | null> {
  const row = await prisma.telegramChat.findUnique({ where: { chatId }, include: { agent: true } });
  if (row) return { agent: row.agent, own: true };
  const agent = DEFAULT_AGENT_KEY ? await prisma.agent.findUnique({ where: { apiKeyHash: sha256(DEFAULT_AGENT_KEY) } }) : null;
  return agent ? { agent, own: false } : null;
}

// Owner-side steps run in-process as the chat's workspace, which the chat proved it owns at
// /connect. Nothing needs a stored bearer key to call the owner APIs over HTTP.
async function ensureRecipient(agent: Agent, address: string, name?: string): Promise<string> {
  const known = await prisma.recipient.findFirst({ where: { agentId: agent.id, solanaAddress: address }, select: { ref: true } });
  if (known) return known.ref;
  // Refs are unique across the deployment; another workspace may already use this one.
  const base = `r-${address.slice(0, 10)}`;
  const taken = await prisma.recipient.findUnique({ where: { ref: base }, select: { id: true } });
  const ref = taken ? `${base}-${randomBytes(3).toString("hex")}` : base;
  await prisma.recipient.create({
    data: {
      ref,
      displayName: name || `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`,
      solanaAddress: address,
      active: true,
      agentId: agent.id
    }
  });
  return ref;
}

async function openInvoice(agent: Agent, recipientRef: string, amountUsdc: number, purpose?: string): Promise<string> {
  const recipient = await prisma.recipient.findFirst({ where: { ref: recipientRef, agentId: agent.id }, select: { id: true } });
  const micros = BigInt(Math.round(amountUsdc * 1e6));
  if (!recipient || micros <= 0n) throw new Error("could not open invoice");
  const ref = `INV-${Date.now().toString(36).toUpperCase()}`;
  await prisma.workOrder.create({
    data: {
      ref,
      recipientId: recipient.id,
      ceilingMicros: micros,
      briefText: purpose || "Payment requested by the owner via Telegram",
      payerRecord: { approved_amount_micros: micros.toString(), delivery_status: "verified_complete" },
      requiredChannels: "both",
      expiresAt: new Date(Date.now() + 24 * 3600e3),
      status: "open"
    }
  });
  return ref;
}

type ToolCall = { name: string; args: Record<string, unknown> };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "pay_address",
      description:
        "Pay a Solana wallet address directly. Use this whenever the message contains a wallet address.",
      parameters: {
        type: "object",
        required: ["amount_usdc"],
        properties: {
          solana_address: { type: "string", description: "the base58 Solana address to pay" },
          amount_usdc: { type: "number", description: "amount in USDC" },
          name: { type: "string", description: "who this is, if the user said" },
          purpose: { type: "string", description: "what the payment is for, if the user said" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_payment",
      description:
        "Pay a recipient against an invoice. Call this for ANY request to pay someone. If no amount is given, pass 0 and Tiba reads the invoice.",
      parameters: {
        type: "object",
        required: ["recipient_ref", "work_order_ref", "amount_usdc"],
        properties: {
          recipient_ref: { type: "string", description: "who to pay, e.g. KL Translator" },
          work_order_ref: { type: "string", description: "invoice reference, e.g. WO-13" },
          amount_usdc: { type: "number", description: "amount in USDC; 0 if the user did not say" }
        }
      }
    }
  }
];

const SYSTEM = `You are the user's payment assistant. You hold a wallet with spending limits.
ALWAYS call submit_payment when the user asks to pay someone - never answer in words instead.
If the user gives no amount, pass amount_usdc 0. Never invent a different amount than the user stated.`;

async function think(text: string, force: boolean): Promise<{ call: ToolCall | null; reply: string | null }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text }
      ],
      tools: TOOLS,
      tool_choice: force ? "required" : "auto",
      max_tokens: 300,
      temperature: 0
    })
  });
  const body = (await response.json()) as {
    choices?: { message?: { content?: string; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
  };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error(`model: ${JSON.stringify(body).slice(0, 160)}`);
  const first = message.tool_calls?.[0];
  if (!first) return { call: null, reply: message.content ?? null };
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(first.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  return { call: { name: first.function.name, args }, reply: null };
}

async function pay(chatId: string, agent: Agent, recipientRef: string, workOrderRef: string, amountUsdc: number): Promise<void> {
  const shown = amountUsdc > 0 ? `${amountUsdc.toFixed(2)} USDC` : "the invoice amount";
  await send(chatId, `Understood — pay ${recipientRef} · invoice ${workOrderRef} · ${shown}`);

  const artifact = [
    "DELIVERY NOTE",
    `Work order: ${workOrderRef}`,
    "Delivered: work completed and accepted.",
    `Amount due: ${(amountUsdc > 0 ? amountUsdc : 5).toFixed(2)} USDC`,
    "Signed: site supervisor"
  ].join("\n");

  let result = null as Awaited<ReturnType<typeof processPayoutIntent>> | null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await send(
      chatId,
      attempt === 1
        ? "Two checks running through GonkaRouter. Neither sees the other's answer."
        : `A check did not come back. Running them again (${attempt}/3).`
    );
    result = await processPayoutIntent(agent, {
      idempotency_key: `tg-${Date.now()}-${attempt}`,
      artifact,
      recipient_ref: recipientRef
    });
    if (!(result.status === "held" && INFRA_REASONS.has(String(result.reasonCode)))) break;
  }
  if (!result) return;

  const intent = await prisma.payoutIntent.findUnique({
    where: { id: result.id },
    include: { adjudications: true }
  });

  const describe = (channel: string, label: string): string => {
    const row = intent?.adjudications.find((a) => a.channel === channel);
    if (!row) return `${label}\n   no answer`;
    const tuple = (row.tupleJson ?? {}) as { work_order_id?: string; amount_micros?: string };
    const said = tuple.work_order_id ? `${tuple.work_order_id} · ${usd(tuple.amount_micros)} USDC` : row.ok ? "answered" : "no answer";
    return `${label}\n   ${String(row.model ?? "").split("/").pop()} · ${row.latencyMs ?? "?"}ms\n   ${said}`;
  };
  await send(chatId, describe("artifact", "Check 1 — reads the delivery note"));
  await send(chatId, describe("payer_record", "Check 2 — reads your own records"));

  const receipt = result.publicToken ? `\nReceipt: ${baseUrl()}/r/${result.publicToken}` : "";
  if (result.status === "settled") {
    const paid = intent ? usd(intent.amountMicros.toString()) : amountUsdc.toFixed(2);
    await send(
      chatId,
      `Both agree. Limits passed.\nPaid ${paid} USDC to ${recipientRef}.${result.digest ? `\nSolana: ${result.digest}` : ""}${receipt}`
    );
  } else if (String(result.reasonCode ?? "").startsWith("QUORUM_SPLIT")) {
    await send(chatId, `The two checks disagree. Nothing moved.${receipt}`);
  } else {
    const why = String(result.reasonCode ?? "a check could not run").replace(/_/g, " ").toLowerCase();
    await send(chatId, `Held — ${why}. Nothing moved.${receipt}`);
  }
}

async function connect(chatId: string, parts: string[], messageId?: number): Promise<void> {
  if (parts.length < 2) {
    await send(
      chatId,
      "Usage: /connect <agent key> <owner key>\nBoth are shown once when you create a wallet at " + `${baseUrl()}/start`
    );
    return;
  }
  const [agentKey, ownerKey] = parts;
  // The message holds both keys in plain text; do not leave it in the chat history.
  const removed = messageId !== undefined && await telegram("deleteMessage", { chat_id: chatId, message_id: messageId });
  const cleanup = removed ? " I deleted your /connect message so the keys are not left in this chat." : " Delete your /connect message: it contains both keys.";

  // Both keys must belong to the same workspace. Only that workspace's id is stored.
  const agent = await prisma.agent.findUnique({ where: { apiKeyHash: sha256(agentKey) } });
  if (!agent || agent.ownerTokenHash !== sha256(ownerKey)) {
    const detail = agent ? " The owner key does not belong to that wallet." : " The agent key looks wrong.";
    await send(chatId, `Those keys were not accepted.${detail} Copy them again from ${baseUrl()}/start.${cleanup}`);
    return;
  }
  await prisma.telegramChat.upsert({
    where: { chatId },
    create: { chatId, agentId: agent.id },
    update: { agentId: agent.id }
  });
  await send(chatId, `Connected. This chat now pays from your wallet.${cleanup}`);
}

export async function handleTelegramMessage(chatId: string, text: string, messageId?: number): Promise<void> {
  const trimmed = text.trim();

  if (/^\/connect\b/i.test(trimmed)) {
    await connect(chatId, trimmed.split(/\s+/).slice(1), messageId);
    return;
  }
  if (/^\/whoami\b/i.test(trimmed)) {
    const wallet = await walletFor(chatId);
    await send(
      chatId,
      wallet?.own ? `Your wallet · ${wallet.agent.name} · agent key ${wallet.agent.apiKeyPrefix}…` : "The shared demo wallet. Use /connect to switch to yours."
    );
    return;
  }
  if (/^\/(start|help)\b/i.test(trimmed)) {
    await send(
      chatId,
      [
        "Tell me who to pay.",
        "  pay the KL translator for invoice WO-13",
        "  pay <solana address> 1 USDC",
        "",
        "/connect <agent key> <owner key> to use your own wallet",
        "/whoami to see which wallet is in use"
      ].join("\n")
    );
    return;
  }

  const wallet = await walletFor(chatId);
  if (!wallet) {
    await send(chatId, `No wallet is set up for this chat. Create one at ${baseUrl()}/start, then send /connect.`);
    return;
  }
  const looksLikePayment = PAYMENT_WORDS.test(trimmed) || solanaAddressIn(trimmed) !== null;

  let decided;
  try {
    decided = await think(trimmed, looksLikePayment);
  } catch (error) {
    if (!looksLikePayment) {
      await send(chatId, "I pay people for you. Try: pay the KL translator for invoice WO-13");
      return;
    }
    throw error;
  }

  if (!decided.call) {
    await send(chatId, decided.reply?.slice(0, 300) || "I pay people for you. Try: pay the KL translator for invoice WO-13");
    return;
  }

  if (decided.call.name === "pay_address") {
    const args = decided.call.args;
    const address =
      solanaAddressIn(String(args.solana_address ?? "")) ?? solanaAddressIn(trimmed);
    if (!address) {
      await send(chatId, "I need a full Solana wallet address.");
      return;
    }
    const amount = Number(args.amount_usdc) || 0;
    if (amount <= 0) {
      await send(chatId, "How much should I send? e.g. pay <address> 1 USDC");
      return;
    }
    // The shared demo wallet only pays its own demo invoices. Paying a new address needs the
    // chat's own wallet, or anyone on Telegram could pay themselves from the shared treasury.
    if (!wallet.own) {
      await send(chatId, `Paying a new address needs your own wallet. Create one at ${baseUrl()}/start, then send /connect.`);
      return;
    }
    await send(
      chatId,
      `New recipient ${address.slice(0, 6)}…${address.slice(-4)}. Saving them and opening an invoice for ${amount.toFixed(2)} USDC.`
    );
    try {
      const ref = await ensureRecipient(wallet.agent, address, decided.call.args.name as string | undefined);
      const invoice = await openInvoice(wallet.agent, ref, amount, decided.call.args.purpose as string | undefined);
      await pay(chatId, wallet.agent, ref, invoice, amount);
    } catch (error) {
      await send(chatId, `Could not set that up: ${(error as Error).message.slice(0, 140)}`);
    }
    return;
  }

  const rawRef = String(decided.call.args.recipient_ref ?? "");
  const key = rawRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  await pay(
    chatId,
    wallet.agent,
    ALIASES[key] ?? rawRef,
    String(decided.call.args.work_order_ref ?? ""),
    Number(decided.call.args.amount_usdc) || 0
  );
}
