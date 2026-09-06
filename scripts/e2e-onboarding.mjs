import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const PREVIEW = process.argv[2] || process.env.PREVIEW_URL || "https://tiba-2va7onqie-kroevasuperadmins-projects.vercel.app";
const OUT_DIR = "C:/Users/diony/Downloads/Hackathons/MUBA/onboarding-preview";

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function screenshot(page, name, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.screenshot({ path: `${OUT_DIR}/${name}-${width}.png`, fullPage: true });
}

const context = await browser.newContext();
const page = await context.newPage();

let workspaceResult = null;
page.on("response", async (response) => {
  const url = response.url();
  const method = response.request().method();
  if (url.includes("/api/v1/workspaces") && method === "POST") {
    try {
      workspaceResult = await response.json();
    } catch {}
  }
});

await page.goto(`${PREVIEW}/start`);
await page.waitForLoadState("networkidle");
await page.waitForSelector('h1');

await screenshot(page, "start", 390);
await screenshot(page, "start", 1440);

await page.waitForSelector('input[type="text"]', { timeout: 10000 });
const nameInput = page.locator('input[type="text"]').first();
await nameInput.fill("MUBA onboarding test");

await page.click('button[type="submit"]');

await page.waitForSelector('text=Save these keys', { timeout: 60000 });

await screenshot(page, "created", 390);
await screenshot(page, "created", 1440);

if (!workspaceResult?.agent_key) {
  console.error("Workspace creation did not return a key:", workspaceResult);
  await browser.close();
  process.exit(1);
}

const { workspace_id, agent_key, agent_key_prefix, recipient_ref, work_order_ref } = workspaceResult;

const artifact = `DELIVERY NOTE\nWork order: ${work_order_ref}\nDelivered: first invoice, accepted and reviewed.\nAmount due: 5.00 USDC\nSigned: onboarding`;

const intentResult = await page.evaluate(
  async ({ url, body, key }) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    return res.json();
  },
  {
    url: `${PREVIEW}/api/v1/intents`,
    body: {
      idempotency_key: `onboarding-${Date.now()}`,
      recipient_ref,
      artifact
    },
    key: agent_key
  }
);

console.log(JSON.stringify({
  preview: PREVIEW,
  workspace_id,
  key_prefix: agent_key_prefix,
  intent: intentResult
}, null, 2));

await browser.close();
