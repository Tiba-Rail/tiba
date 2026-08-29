import { createHash } from "node:crypto";
import "dotenv/config";

const { prisma } = await import("../src/lib/db.ts");

const apiKey = process.env.SEED_AGENT_KEY ?? "tiba_testnet_demo_key";
const apiKeySource = process.env.SEED_AGENT_KEY ? "SEED_AGENT_KEY" : "default_demo_key";
const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");
const seededAt = new Date("2026-08-29T00:00:00.000Z");
const expiresAt = new Date("2026-09-30T00:00:00.000Z");
const defaultRecipientAddress = "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef";
const demoRecipientAddress = process.env.SEED_RECIPIENT_SUI_ADDRESS ?? process.env.SUI_ADDRESS ?? defaultRecipientAddress;

await prisma.adjudication.deleteMany();
await prisma.artifact.deleteMany();
await prisma.payoutIntent.deleteMany();
await prisma.workOrder.deleteMany();
await prisma.recipient.deleteMany();
await prisma.agent.deleteMany();

const agent = await prisma.agent.create({
  data: {
    id: "agent-demo-day1",
    name: "Demo agent",
    apiKeyHash,
    apiKeyPrefix: apiKey.slice(0, 12),
    ceilingMicros: 400_000_000n,
    hourCapMicros: 500_000_000n,
    dayCapMicros: 1_000_000_000n,
    hourCountCap: 5,
    dayCountCap: 20,
    rail: "sui",
    windowStartedAt: seededAt,
    dayStartedAt: seededAt,
    createdAt: seededAt,
    updatedAt: seededAt
  }
});

const creator = await prisma.recipient.create({
  data: {
    id: "recipient-creator-lagos",
    ref: "creator-lagos",
    displayName: "Demo Creator",
    suiAddress: demoRecipientAddress,
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt
  }
});

const translator = await prisma.recipient.create({
  data: {
    id: "recipient-translator-kl",
    ref: "translator-kl",
    displayName: "KL Translator",
    suiAddress: demoRecipientAddress,
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt
  }
});

await prisma.workOrder.createMany({
  data: [
    {
      id: "work-order-wo-3",
      recipientId: creator.id,
      ref: "WO-3",
      ceilingMicros: 180_000_000n,
      briefText: "Approved creator delivery: publish one short-form video and submit the public link.",
      payerRecord: {
        approved_amount_micros: "180000000",
        delivery_timestamp: "2026-08-29T05:00:00.000Z",
        delivery_status: "verified_complete",
        public_link: "https://example.com/deliveries/wo-3"
      },
      requiredChannels: "both",
      expiresAt,
      createdAt: seededAt,
      updatedAt: seededAt
    },
    {
      id: "work-order-wo-7",
      recipientId: creator.id,
      ref: "WO-7",
      ceilingMicros: 400_000_000n,
      briefText: "Future creator package. Not delivered yet; do not pay from current delivery records.",
      payerRecord: {
        approved_amount_micros: "400000000",
        delivery_status: "awaiting_delivery",
        note: "Open obligation exists but has no payer-side completion event."
      },
      requiredChannels: "human",
      expiresAt,
      createdAt: seededAt,
      updatedAt: seededAt
    },
    {
      id: "work-order-wo-11",
      recipientId: translator.id,
      ref: "WO-11",
      ceilingMicros: 40_000_000n,
      briefText: "Translate the landing page hero copy.",
      payerRecord: {
        approved_amount_micros: "40000000",
        delivery_timestamp: "2026-08-29T06:00:00.000Z",
        delivery_status: "verified_complete",
        source: "operator-upload"
      },
      requiredChannels: "payer_record",
      expiresAt,
      createdAt: seededAt,
      updatedAt: seededAt
    }
  ]
});

console.log(JSON.stringify({
  agent_id: agent.id,
  agent_key_source: apiKeySource,
  recipients: [creator.ref, translator.ref],
  open_work_orders: ["WO-3", "WO-7", "WO-11"]
}, null, 2));

await prisma.$disconnect();
