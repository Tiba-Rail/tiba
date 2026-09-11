import { createHash } from "node:crypto";
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
const DEFAULT_OWNER_KEY = process.env.OPERATOR_TOKEN ?? "";

const SUI_ADDRESS = /0x[0-9a-fA-F]{64}/;
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
  ali: "ali-sui",
  alisui: "ali-sui"
};

type Keys = { agentKey: string; ownerKey: string; own: boolean };

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

async function send(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  }).catch(() => undefined);
}

async function keysFor(chatId: string): Promise<Keys> {
  const row = await prisma.telegramChat.findUnique({ where: { chatId } });
  if (row) return { agentKey: row.agentKey, ownerKey: row.ownerKey, own: true };
  return { agentKey: DEFAULT_AGENT_KEY, ownerKey: DEFAULT_OWNER_KEY, own: false };
}

// Owner-side calls go over HTTP so they reuse the operator checks in those routes. They are
// fast. The slow part, the payment itself, runs in-process instead of calling ourselves.
async function ownerPost(keys: Keys, path: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${keys.ownerKey}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, json };
}

async function ensureRecipient(keys: Keys, address: string, name?: string): Promise<string> {
  const isSui = address.startsWith("0x");
  // Base58 is case-sensitive, so a Solana ref keeps its case.
  const ref = isSui ? `r-${address.slice(2, 10).toLowerCase()}` : `r-${address.slice(0, 10)}`;
  const { ok, json } = await ownerPost(keys, "/api/v1/recipients", {
    ref,
    display_name: name || `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`,
    [isSui ? "sui_address" : "solana_address"]: address
  });
  if (ok || /exists|unique|P2002/i.test(JSON.stringify(json))) return ref;
  throw new Error(`could not save recipient: ${JSON.stringify(json).slice(0, 120)}`);
}

async function openInvoice(keys: Keys, recipientRef: string, amountUsdc: number, purpose?: string): Promise<string> {
  const ref = `INV-${Date.now().toString(36).toUpperCase()}`;
  const micros = Math.round(amountUsdc * 1e6);
  const { ok, json } = await ownerPost(keys, "/api/v1/work-orders", {
    ref,
    recipient_ref: recipientRef,
    brief_text: purpose || "Payment requested by the owner via Telegram",
    ceiling_usdc: String(amountUsdc),
    expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
    required_channels: "both",
    payer_record: JSON.stringify({ approved_amount_micros: String(micros), delivery_status: "verified_complete" })
  });
  if (!ok) throw new Error(`could not open invoice: ${JSON.stringify(json).slice(0, 120)}`);
  return ref;
}

type ToolCall = { name: string; args: Record<string, unknown> };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "pay_address",
      description:
        "Pay a wallet address directly (a Solana address or a 0x... Sui address the user pasted). Use this whenever the message contains a wallet address. Pass exactly one of solana_address or sui_address.",
      parameters: {
        type: "object",
        required: ["amount_usdc"],
        properties: {
          solana_address: { type: "string", description: "the base58 Solana address to pay" },
          sui_address: { type: "string", description: "the 0x... Sui address to pay" },
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

async function pay(chatId: string, keys: Keys, recipientRef: string, workOrderRef: string, amountUsdc: number): Promise<void> {
  const shown = amountUsdc > 0 ? `${amountUsdc.toFixed(2)} USDC` : "the invoice amount";
  await send(chatId, `Understood — pay ${recipientRef} · invoice ${workOrderRef} · ${shown}`);

  const agent = await prisma.agent.findUnique({ where: { apiKeyHash: sha256(keys.agentKey) } });
  if (!agent) {
    await send(chatId, "That wallet key is not recognised. Send /connect with the two keys from your wallet.");
    return;
  }

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
    // Old intents have no stored chain and settled on Sui.
    const chain = intent?.chain === "solana" ? "Solana" : "Sui";
    await send(
      chatId,
      `Both agree. Limits passed.\nPaid ${paid} USDC to ${recipientRef}.${result.digest ? `\n${chain}: ${result.digest}` : ""}${receipt}`
    );
  } else if (String(result.reasonCode ?? "").startsWith("QUORUM_SPLIT")) {
    await send(chatId, `The two checks disagree. Nothing moved.${receipt}`);
  } else {
    const why = String(result.reasonCode ?? "a check could not run").replace(/_/g, " ").toLowerCase();
    await send(chatId, `Held — ${why}. Nothing moved.${receipt}`);
  }
}

async function connect(chatId: string, parts: string[]): Promise<void> {
  if (parts.length < 2) {
    await send(
      chatId,
      "Usage: /connect <agent key> <owner key>\nBoth are shown once when you create a wallet at " + `${baseUrl()}/start`
    );
    return;
  }
  const [agentKey, ownerKey] = parts;
  // The two keys are recognised in different places: the owner key opens invoices, the agent
  // key is only known to the payments table. Check each where it actually works.
  const agentOk = Boolean(await prisma.agent.findUnique({ where: { apiKeyHash: sha256(agentKey) } }));
  const ownerOk = Boolean(await prisma.agent.findFirst({ where: { ownerTokenHash: sha256(ownerKey) } }));
  if (!agentOk || !ownerOk) {
    const detail = `${ownerOk ? "" : " The owner key looks wrong."}${agentOk ? "" : " The agent key looks wrong."}`;
    await send(chatId, `Those keys were not accepted.${detail} Copy them again from ${baseUrl()}/start`);
    return;
  }
  await prisma.telegramChat.upsert({
    where: { chatId },
    create: { chatId, agentKey, ownerKey },
    update: { agentKey, ownerKey }
  });
  await send(chatId, "Connected. This chat now pays from your wallet.");
}

export async function handleTelegramMessage(chatId: string, text: string): Promise<void> {
  const trimmed = text.trim();

  if (/^\/connect\b/i.test(trimmed)) {
    await connect(chatId, trimmed.split(/\s+/).slice(1));
    return;
  }
  if (/^\/whoami\b/i.test(trimmed)) {
    const keys = await keysFor(chatId);
    await send(
      chatId,
      keys.own ? `Your wallet · agent key ${keys.agentKey.slice(0, 12)}…` : "The shared demo wallet. Use /connect to switch to yours."
    );
    return;
  }
  if (/^\/(start|help)\b/i.test(trimmed)) {
    await send(
      chatId,
      [
        "Tell me who to pay.",
        "  pay the KL translator for invoice WO-13",
        "  pay <solana address> 1 USDC   (a 0x Sui address also works)",
        "",
        "/connect <agent key> <owner key> to use your own wallet",
        "/whoami to see which wallet is in use"
      ].join("\n")
    );
    return;
  }

  const keys = await keysFor(chatId);
  const looksLikePayment = PAYMENT_WORDS.test(trimmed) || SUI_ADDRESS.test(trimmed) || solanaAddressIn(trimmed) !== null;

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
      solanaAddressIn(String(args.solana_address ?? "")) ??
      String(args.sui_address ?? "").match(SUI_ADDRESS)?.[0] ??
      solanaAddressIn(trimmed) ??
      trimmed.match(SUI_ADDRESS)?.[0];
    if (!address) {
      await send(chatId, "I need a full wallet address: a Solana address, or a Sui address (0x followed by 64 characters).");
      return;
    }
    const amount = Number(args.amount_usdc) || 0;
    if (amount <= 0) {
      await send(chatId, "How much should I send? e.g. pay <address> 1 USDC");
      return;
    }
    await send(
      chatId,
      `New recipient ${address.slice(0, 6)}…${address.slice(-4)}. Saving them and opening an invoice for ${amount.toFixed(2)} USDC.`
    );
    try {
      const ref = await ensureRecipient(keys, address, decided.call.args.name as string | undefined);
      const invoice = await openInvoice(keys, ref, amount, decided.call.args.purpose as string | undefined);
      await pay(chatId, keys, ref, invoice, amount);
    } catch (error) {
      await send(chatId, `Could not set that up: ${(error as Error).message.slice(0, 140)}`);
    }
    return;
  }

  const rawRef = String(decided.call.args.recipient_ref ?? "");
  const key = rawRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  await pay(
    chatId,
    keys,
    ALIASES[key] ?? rawRef,
    String(decided.call.args.work_order_ref ?? ""),
    Number(decided.call.args.amount_usdc) || 0
  );
}
