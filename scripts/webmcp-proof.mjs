// Dev tool: prove the WebMCP tools work in real Chrome against the live site.
//   node scripts/webmcp-proof.mjs            (read-only tools + no-token refusal)
//   PROOF_PAY=1 node scripts/webmcp-proof.mjs (also: inflated -> REFUSED, clean -> PAID; spends 0.005 testnet SUI)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

// Operator token is read from the local env file at runtime and never printed.
const TOKEN = (readFileSync(".env", "utf8").match(/^OPERATOR_TOKEN=(.+)$/m) || [])[1]?.trim();
const BASE = process.env.PROOF_BASE_URL ?? "https://tiba-omega.vercel.app";

const b = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-features=WebMCP"]
});
const ctx = await b.newContext();
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 200)); });
await p.goto(`${BASE}/console`, { waitUntil: "networkidle", timeout: 90000 });

const run = (name, input) => p.evaluate(async ([n, i]) => {
  const mc = document.modelContext;
  const str = (r) => (typeof r === "string" ? r : JSON.stringify(r));
  const tool = (await mc.getTools()).find((t) => t.name === n);
  try { return str(await mc.executeTool(tool, JSON.stringify(i))); }
  catch (e) {
    try { return str(await mc.executeTool({ name: n, arguments: i })); }
    catch (e2) { return "EXEC_ERR: " + String(e.message || e) + " / " + String(e2.message || e2); }
  }
}, [name, input]);

const tools = await p.evaluate(async () => {
  const t = await document.modelContext.getTools();
  return (Array.isArray(t) ? t : []).map((x) => x.name);
});
console.log("TOOLS VISIBLE TO AGENT:", JSON.stringify(tools));
console.log("card status:", await p.locator("text=/exposes \\d+ tools/").first().textContent().catch(() => "(status line not found)"));
console.log("list_work_orders:", (await run("list_work_orders", {})).slice(0, 400));
console.log("get_budget:", (await run("get_budget", {})).slice(0, 300));
console.log("submit_payment NO TOKEN:", (await run("submit_payment", { recipient_ref: "translator-kl", artifact: "x" })).slice(0, 300));

await p.evaluate((t) => sessionStorage.setItem("tiba_operator_token", t), TOKEN);
await p.reload({ waitUntil: "networkidle" });
console.log("list_ledger (with token):", (await run("list_ledger", {})).slice(0, 300));

if (process.env.PROOF_PAY === "1") {
  const clean = "DELIVERY NOTE\nWork order: WO-12\nDelivered: translation of 4 documents, reviewed and accepted.\nAmount due: 5.00 USDC\nCompleted: this afternoon, accepted on site\nSigned: project lead";
  const inflated = clean.replace("5.00 USDC", "50.00 USDC");
  console.log("submit_payment INFLATED:", (await run("submit_payment", { recipient_ref: "translator-kl", artifact: inflated })).slice(0, 400));
  console.log("submit_payment CLEAN:", (await run("submit_payment", { recipient_ref: "translator-kl", artifact: clean })).slice(0, 400));
}
console.log("recent-calls rows on page:", await p.locator("text=/list_work_orders|get_budget|submit_payment|list_ledger/").count());
await p.screenshot({ path: "C:/Users/diony/Downloads/Hackathons/WebMCP-console-agent.png", fullPage: true });
await b.close();
