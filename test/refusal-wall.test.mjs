import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildRefusalWall, visibleWallText } from "../src/lib/refusal-wall.ts";

const SECRET = "PRIVATE_OWNER_TOKEN_solanaAddress_payerRecord_rawText_kycCheckId_t3nDid_apiKeyHash";

function receipt(overrides) {
  return {
    publicToken: "11111111-1111-4111-8111-111111111111",
    decisionClass: "PAID",
    reasonCode: null,
    amountMicros: "1000000",
    chain: "solana",
    createdAt: "2026-09-26T10:00:00.000Z",
    apiKeyHash: SECRET,
    apiKeyPrefix: SECRET,
    ownerTokenHash: SECRET,
    ownerTokenPrefix: SECRET,
    solanaAddress: SECRET,
    legacyAddress: SECRET,
    payerRecord: { approved_amount_micros: SECRET, note: SECRET },
    briefText: SECRET,
    rawText: SECRET,
    kycCheckId: SECRET,
    t3nDid: SECRET,
    email: "secret-user@example.com",
    access_token: SECRET,
    chatId: SECRET,
    ...overrides
  };
}

test("totals match the rows, newest first, and a private field never appears", () => {
  const wall = buildRefusalWall([
    receipt({
      publicToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      decisionClass: "PAID",
      amountMicros: "1000000",
      createdAt: "2026-09-26T10:00:00.000Z"
    }),
    receipt({
      publicToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      decisionClass: "RED",
      reasonCode: "QUORUM_SPLIT:amount_micros",
      amountMicros: "2500000",
      chain: "tempo",
      createdAt: "2026-09-26T12:00:00.000Z",
      adjudications: [
        {
          channel: "artifact",
          tupleJson: {
            work_order_id: "WO-9",
            amount_micros: "9000000",
            delivery_timestamp: "2026-09-01T00:00:00.000Z",
            evidence: SECRET
          },
          model: SECRET,
          requestId: SECRET
        },
        {
          channel: "payer_record",
          tupleJson: {
            work_order_id: "WO-9",
            amount_micros: "2500000",
            delivery_timestamp: "2026-09-01T00:00:00.000Z",
            record_basis: SECRET
          }
        }
      ]
    }),
    receipt({
      publicToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      decisionClass: "AMBER",
      reasonCode: "HUMAN_REVIEW_REQUIRED",
      amountMicros: "5000000",
      createdAt: "2026-09-26T11:00:00.000Z"
    }),
    receipt({
      publicToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      decisionClass: "RED",
      reasonCode: "QUORUM_SPLIT:work_order_id",
      amountMicros: "500000",
      chain: "zcash",
      createdAt: "2026-09-26T09:00:00.000Z",
      adjudications: [
        {
          channel: "artifact",
          tupleJson: {
            work_order_id: "WO-BILL",
            amount_micros: SECRET,
            delivery_timestamp: "2026-09-01T00:00:00.000Z",
            evidence: SECRET
          }
        },
        {
          channel: "payer_record",
          tupleJson: {
            work_order_id: "WO-RECORD",
            amount_micros: SECRET,
            delivery_timestamp: "2026-09-02T00:00:00.000Z",
            record_basis: SECRET
          }
        }
      ]
    }),
    // Not public by a link we can publish.
    receipt({ publicToken: "", createdAt: "2026-09-26T13:00:00.000Z", amountMicros: "999000000" }),
    receipt({ publicToken: "has a space", createdAt: "2026-09-26T13:00:00.000Z", amountMicros: "999000000" }),
    { decisionClass: "RED", amountMicros: "999000000", createdAt: "2026-09-26T13:00:00.000Z" }
  ]);

  assert.deepEqual(
    wall.rows.map((row) => row.href),
    [
      "/r/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "/r/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "/r/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "/r/dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    ]
  );
  assert.equal(wall.checksRun, wall.rows.length);
  assert.equal(wall.paid, wall.rows.filter((row) => row.outcome === "PAID").length);
  assert.equal(wall.refused, wall.rows.filter((row) => row.outcome === "REFUSED").length);
  assert.equal(wall.checksRun, 4);
  assert.equal(wall.paid, 1);
  assert.equal(wall.simulatedPaid, 0);
  assert.equal(wall.refused, 2);
  assert.equal(wall.refusedAmount, "3.00 USDC");

  const amountSplit = wall.rows[0];
  assert.equal(amountSplit.outcome, "REFUSED");
  assert.equal(amountSplit.amount, "2.5 USDC");
  assert.equal(amountSplit.chain, "Tempo testnet");
  assert.equal(amountSplit.mismatch.field, "Amount");
  assert.equal(amountSplit.mismatch.bill, "9.00 USDC");
  assert.equal(amountSplit.mismatch.record, "2.5 USDC");
  assert.equal(amountSplit.reason, null);

  const invoiceSplit = wall.rows[3];
  assert.equal(invoiceSplit.mismatch.field, "Invoice");
  assert.equal(invoiceSplit.mismatch.bill, "WO-BILL");
  assert.equal(invoiceSplit.mismatch.record, "WO-RECORD");

  const held = wall.rows[1];
  assert.equal(held.outcome, "HELD");
  assert.equal(held.outcomeLabel, "Needs approval");
  assert.equal(held.mismatch, null);

  const visible = visibleWallText(wall);
  assert.equal(visible.includes(SECRET), false);
  assert.equal(visible.includes("secret-user@example.com"), false);
  assert.equal(visible.includes("999"), false);
  assert.match(visible, /test money/);
  assert.match(amountSplit.time, /UTC/);
});

test("a refusal that is not a field mismatch shows the public reason, not a made-up pair", () => {
  const wall = buildRefusalWall([
    receipt({
      decisionClass: "RED",
      reasonCode: "KILL_SWITCH",
      amountMicros: "10000",
      createdAt: "2026-09-26T08:00:00.000Z"
    })
  ]);
  assert.equal(wall.rows.length, 1);
  assert.equal(wall.refused, 1);
  assert.equal(wall.refusedAmount, "0.01 USDC");
  assert.equal(wall.rows[0].mismatch, null);
  assert.equal(wall.rows[0].reason, "Payments are frozen.");
  assert.equal(visibleWallText(wall).includes(SECRET), false);
});

test("a delivery-date refusal shows both times and no other tuple field", () => {
  const wall = buildRefusalWall([
    receipt({
      decisionClass: "RED",
      reasonCode: "QUORUM_SPLIT:delivery_timestamp",
      amountMicros: "0",
      adjudications: [
        {
          channel: "artifact",
          tupleJson: {
            work_order_id: SECRET,
            amount_micros: "4000000",
            delivery_timestamp: "2026-09-01T00:00:00.000Z"
          }
        },
        {
          channel: "payer_record",
          tupleJson: {
            work_order_id: "WO-OK",
            amount_micros: "4000000",
            delivery_timestamp: "2026-09-03T15:04:05.000Z"
          }
        }
      ]
    })
  ]);
  const row = wall.rows[0];
  assert.equal(row.mismatch.field, "Delivery date");
  assert.match(row.mismatch.bill, /Sep 01, 2026, 00:00:00 UTC/);
  assert.match(row.mismatch.record, /Sep 03, 2026, 15:04:05 UTC/);
  const visible = visibleWallText(wall);
  assert.equal(row.amount, "4.00 USDC");
  assert.equal(wall.refusedAmount, "4.00 USDC");
  assert.equal(visible.includes(SECRET), false);
  assert.equal(visible.includes("WO-OK"), false);
  assert.match(row.mismatch.bill, /Sep 01, 2026, 00:00:00 UTC/);
});

test("the wall page and its query do not name private workspace fields", () => {
  const source = [
    "src/app/wall/page.tsx",
    "src/lib/refusal-wall.ts",
    "src/lib/refusal-wall-data.ts",
    "src/components/site-footer.tsx"
  ].map((path) => fs.readFileSync(path, "utf8")).join("\n");

  for (const name of [
    "apiKeyHash",
    "apiKeyPrefix",
    "ownerTokenHash",
    "ownerTokenPrefix",
    "solanaAddress",
    "legacyAddress",
    "payerRecord",
    "briefText",
    "rawText",
    "kycCheckId",
    "t3nDid",
    "access_token",
    "chatId"
  ]) {
    assert.equal(source.includes(name), false, name);
  }
});

test("when every refusal asked for zero, the total is null, not a misleading 0.00", () => {
  const wall = buildRefusalWall([
    receipt({ decisionClass: "RED", reasonCode: "NO_OPEN_OBLIGATION", amountMicros: "0", createdAt: "2026-09-26T08:00:00.000Z" }),
    receipt({ decisionClass: "RED", reasonCode: "RECIPIENT_NOT_FOUND", amountMicros: "0", createdAt: "2026-09-26T08:05:00.000Z" }),
    receipt({ decisionClass: "PAID", amountMicros: "500000", createdAt: "2026-09-26T08:10:00.000Z" })
  ]);
  assert.equal(wall.refused, 2);
  assert.equal(wall.refusedWithAmount, 0);
  assert.equal(wall.refusedAmount, null);
  // The privacy-check text helper still renders without throwing on a null total.
  assert.doesNotThrow(() => visibleWallText(wall));
});

test("a mixed set counts and totals only the refusals that actually asked for money", () => {
  const wall = buildRefusalWall([
    receipt({ decisionClass: "RED", reasonCode: "NO_OPEN_OBLIGATION", amountMicros: "0", createdAt: "2026-09-26T08:00:00.000Z" }),
    receipt({ decisionClass: "RED", reasonCode: "KILL_SWITCH", amountMicros: "2000000", createdAt: "2026-09-26T08:05:00.000Z" }),
    receipt({ decisionClass: "RED", reasonCode: "WORK_ORDER_CEILING", amountMicros: "1000000", createdAt: "2026-09-26T08:10:00.000Z" })
  ]);
  assert.equal(wall.refused, 3);
  assert.equal(wall.refusedWithAmount, 2);
  assert.equal(wall.refusedAmount, "3.00 USDC");
});

test("simulated payments have their own total and are not counted as paid", () => {
  const wall = buildRefusalWall([
    receipt({ chain: "solana", createdAt: "2026-09-26T08:00:00.000Z" }),
    receipt({
      publicToken: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      chain: "mock",
      createdAt: "2026-09-26T08:05:00.000Z"
    }),
    receipt({
      publicToken: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      chain: null,
      createdAt: "2026-09-26T08:10:00.000Z"
    })
  ]);

  assert.equal(wall.checksRun, 3);
  assert.equal(wall.paid, 1);
  assert.equal(wall.simulatedPaid, 2);
});

test("database totals can cover more checks than the 200 displayed rows", () => {
  const wall = buildRefusalWall(
    [receipt({ chain: "solana" })],
    {
      checksRun: 250,
      paid: 90,
      simulatedPaid: 10,
      refused: 120,
      refusedWithAmount: 100,
      refusedAmountMicros: "450000000"
    }
  );

  assert.equal(wall.rows.length, 1);
  assert.equal(wall.checksRun, 250);
  assert.equal(wall.paid, 90);
  assert.equal(wall.simulatedPaid, 10);
  assert.equal(wall.refused, 120);
  assert.equal(wall.refusedAmount, "450.00 USDC");
});

test("the wall query is demo-only, excludes sandbox rows, caps rows, and totals separately", () => {
  const source = fs.readFileSync("src/lib/refusal-wall-data.ts", "utf8");
  assert.match(source, /agentId: \{ not: SANDBOX_AGENT_ID \}/);
  assert.match(source, /EXAMPLE_PAID_INTENT_ID/);
  assert.match(source, /take: 200/);
  assert.match(source, /payoutIntent\.groupBy/);
  assert.match(source, /decisionClass: "RED"/);
  assert.match(source, /amountAskedMicros/);
});

test("the wall is linked from the footer, the homepage, and the signed-out nav", () => {
  const footer = fs.readFileSync("src/components/site-footer.tsx", "utf8");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  const header = fs.readFileSync("src/components/site-nav.tsx", "utf8");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(footer, /href="\/wall"/);
  assert.match(layout, /SiteFooter/);
  assert.match(header, /href="\/wall"/);
  assert.match(home, /href="\/wall"/);
});

test("a refusal stored as 0 shows the amount the bill asked for, not 0.00", () => {
  const wall = buildRefusalWall([
    receipt({
      decisionClass: "RED",
      reasonCode: "QUORUM_SPLIT:amount_micros",
      amountMicros: "0",
      chain: null,
      adjudications: [
        {
          channel: "artifact",
          tupleJson: {
            work_order_id: "WO-SOL-2",
            amount_micros: "999999999",
            delivery_timestamp: "2026-09-11T00:00:00.000Z"
          }
        },
        {
          channel: "payer_record",
          tupleJson: {
            work_order_id: "WO-SOL-2",
            amount_micros: "10000",
            delivery_timestamp: "2026-09-11T00:00:00.000Z"
          }
        }
      ]
    })
  ]);
  assert.equal(wall.rows[0].amount, "999.999999 USDC");
  assert.equal(wall.rows[0].chain, "No transfer attempted");
  assert.equal(wall.refusedAmount, "999.999999 USDC");
  assert.equal(wall.refusedWithAmount, 1);
  assert.equal(wall.rows[0].amount.includes("0.00"), false);
});

test("a refusal with no bill amount does not pretend the ask was 0.00", () => {
  const wall = buildRefusalWall([
    receipt({
      decisionClass: "RED",
      reasonCode: "NO_OPEN_OBLIGATION",
      amountMicros: "0",
      adjudications: []
    })
  ]);
  assert.equal(wall.rows[0].amount, "Not read");
  assert.equal(wall.refusedAmount, null);
  assert.equal(wall.refusedWithAmount, 0);
});

test("the network label follows the stored chain: Sui stays Sui, Solana stays Solana devnet", () => {
  const wall = buildRefusalWall([
    receipt({
      chain: "sui",
      decisionClass: "PAID",
      amountMicros: "10000",
      publicToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
      createdAt: "2026-09-11T09:07:54.000Z"
    }),
    receipt({
      chain: "solana",
      decisionClass: "PAID",
      publicToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
      createdAt: "2026-09-11T09:09:43.000Z"
    })
  ]);
  const byHref = Object.fromEntries(wall.rows.map((row) => [row.href, row.chain]));
  assert.equal(byHref["/r/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"], "Earlier test network, retired");
  assert.equal(byHref["/r/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"], "Solana devnet");
});

test("legacy Sui rows stay on the wall but the wall never says Sui", () => {
  const wall = buildRefusalWall([
    receipt({ chain: "sui", publicToken: "22222222-2222-4222-8222-222222222222" }),
    receipt({ chain: "solana", publicToken: "33333333-3333-4333-8333-333333333333", createdAt: "2026-09-26T09:00:00.000Z" })
  ]);
  assert.equal(wall.checksRun, 2);
  assert.equal(wall.rows[0].chain, "Earlier test network, retired");
  assert.equal(wall.rows[1].chain, "Solana devnet");
  assert.equal(/sui/i.test(visibleWallText(wall)), false);
});
