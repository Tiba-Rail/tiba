import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

const baseUrl = "https://tiba-omega.vercel.app";
const recordingsDir = resolve("recordings");
const webmPath = join(recordingsDir, "tiba-webmcp-demo.webm");
const mp4Path = "C:/Users/diony/Downloads/Hackathons/WebMCP/tiba-webmcp-demo.mp4";
const viewport = { width: 1280, height: 720 };

mkdirSync(recordingsDir, { recursive: true });
mkdirSync("C:/Users/diony/Downloads/Hackathons/WebMCP", { recursive: true });

let start = Date.now();
const missed = [];
const cursorPos = { x: 80, y: 80 };

function offset() {
  return `${((Date.now() - start) / 1000).toFixed(1).padStart(5, " ")}s`;
}

function logBeat(label) {
  console.log(`[${offset()}] ${label}`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { shell: true,
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      shell: true
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function injectCursor(context) {
  await context.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      if (document.getElementById("__demo_cursor")) return;
      const cursor = document.createElement("div");
      cursor.id = "__demo_cursor";
      cursor.innerHTML = `<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1 1 L1 21 L6.5 15.5 L10.5 26.5 L14 25.2 L10 14.4 L18 14.4 Z" fill="white" stroke="black" stroke-width="1" stroke-linejoin="round"/></svg>`;
      cursor.style.cssText = "position:fixed;left:0;top:0;width:20px;height:28px;pointer-events:none;z-index:2147483647;transform:translate(80px,80px) scale(1);transform-origin:0 0;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35));";
      document.documentElement.appendChild(cursor);
      window.__demoCursorMove = (x, y) => {
        cursor.style.transform = `translate(${x}px,${y}px) scale(1)`;
      };
      window.__demoCursorClick = () => {
        cursor.style.transform += " scale(.9)";
        window.setTimeout(() => window.__demoCursorMove?.(window.__demoCursorX ?? 0, window.__demoCursorY ?? 0), 110);
      };
    });
  });
}

async function setCursor(page, x, y) {
  await page.evaluate(([nextX, nextY]) => {
    window.__demoCursorX = nextX;
    window.__demoCursorY = nextY;
    window.__demoCursorMove?.(nextX, nextY);
  }, [x, y]).catch(() => {});
}

async function moveTo(page, x, y) {
  const steps = 25;
  const pos = { ...cursorPos };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const nx = pos.x + (x - pos.x) * eased;
    const ny = pos.y + (y - pos.y) * eased;
    await page.mouse.move(nx, ny);
    await setCursor(page, nx, ny);
    cursorPos.x = nx;
    cursorPos.y = ny;
    await page.waitForTimeout(18);
  }
}

async function boxCenter(locator, name) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No visible box for ${name}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function hover(locator, name, page) {
  const center = await boxCenter(locator, name);
  await moveTo(page, center.x, center.y);
}

async function click(locator, name, page) {
  await hover(locator, name, page);
  await page.evaluate(() => window.__demoCursorClick?.()).catch(() => {});
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

async function waitUntil(ms) {
  const delay = start + ms - Date.now();
  if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
}

function latestWebm() {
  const files = readdirSync(recordingsDir)
    .filter((file) => file.endsWith(".webm"))
    .map((file) => ({ file, time: statSync(join(recordingsDir, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!files[0]) throw new Error("No recorded WebM found");
  return join(recordingsDir, files[0].file);
}

async function main() {
  const { chromium } = await import("playwright").catch(async () => {
    console.log("playwright package not resolved; falling back to @playwright/test");
    return import("@playwright/test");
  });

  // Read OPERATOR_TOKEN from .env
  const TOKEN = (readFileSync(".env", "utf8").match(/^OPERATOR_TOKEN=(.+)$/m) || [])[1]?.trim();
  if (!TOKEN) {
    console.error("OPERATOR_TOKEN not found in .env file");
    process.exit(1);
  }

  // Register a fresh work order
  // One payable order per recipient is the demo invariant; registering a fresh order
  // next to an open one makes channel B guess and every intent refuses.
  const ref = "WO-13";

  // Build the two artifacts
  const clean = `DELIVERY NOTE\nWork order: ${ref}\nDelivered: translation of 4 documents, reviewed and accepted.\nAmount due: 5.00 USDC\nCompleted: this afternoon, accepted on site\nSigned: project lead`;
  const inflated = clean.replace("5.00 USDC", "50.00 USDC");

  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--enable-features=WebMCP"]
  });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: recordingsDir, size: viewport }
  });
  await injectCursor(context);
  const page = await context.newPage();

  // Helper for agent calls
  const agentCall = async (name, input) => {
    return await page.evaluate(async ([n, i]) => {
      const mc = document.modelContext;
      const str = (r) => (typeof r === "string" ? r : JSON.stringify(r));
      const tool = (await mc.getTools()).find((t) => t.name === n);
      try { return str(await mc.executeTool(tool, JSON.stringify(i))); }
      catch (e) {
        try { return str(await mc.executeTool({ name: n, arguments: i })); }
        catch (e2) { return "EXEC_ERR: " + String(e.message || e) + " / " + String(e2.message || e2); }
      }
    }, [name, input]);
  };

  try {
    start = Date.now();
    logBeat("0:00 goto /console");
    await page.goto("/console", { waitUntil: "networkidle" });
    await page.evaluate((t) => sessionStorage.setItem("tiba_operator_token", t), TOKEN);
    await page.reload({ waitUntil: "networkidle" });
    await setCursor(page, 80, 80);
    
    // Slowly hover over elements
    await hover(page.getByText("Bounded payout rail").first(), "Bounded payout rail", page);
    await page.waitForTimeout(2000);
    await hover(page.getByText("Agent tools (WebMCP)").first(), "Agent tools card", page);
    await page.waitForTimeout(2000);
    await hover(page.getByText("Not on the menu").first(), "Not on the menu", page);
    await waitUntil(20_000);

    logBeat("0:20 agentCall list_work_orders");
    await hover(page.getByText("Recent agent calls").first(), "Recent agent calls", page);
    await agentCall("list_work_orders", {});
    await page.waitForTimeout(5000);
    await hover(page.locator("text=list_work_orders").first(), "list_work_orders log row", page);
    await waitUntil(35_000);

    logBeat("0:35 agentCall submit_payment (inflated)");
    await hover(page.getByText("Recent agent calls").first(), "Recent agent calls", page);
    const inflatedPromise = agentCall("submit_payment", { recipient_ref: "translator-kl", artifact: inflated });
    
    // While waiting, hover over Daily cap area
    await hover(page.getByText("Daily cap").first(), "Daily cap", page);
    await page.waitForTimeout(5000);
    await hover(page.getByText("Day").first(), "Day cap bar", page);
    await page.waitForTimeout(5000);
    
    // Wait for the result
    const inflatedResult = await inflatedPromise;
    console.log("Inflated payment result:", inflatedResult.slice(0, 200));
    
    // Hover over the newest log row (should say REFUSED)
    await hover(page.locator("text=REFUSED").first(), "REFUSED log row", page);
    await waitUntil(65_000);

    logBeat("1:05 goto /ledger");
    await page.goto("/ledger", { waitUntil: "networkidle" });
    
    // Wait for a row containing "REFUSED"
    let refusedRow;
    for (let i = 0; i < 10; i++) {
      refusedRow = page.locator("tbody tr").filter({ hasText: "REFUSED" }).first();
      if (await refusedRow.count() > 0) break;
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: "networkidle" });
    }
    
    if (await refusedRow.count() > 0) {
      await hover(refusedRow.locator("text=REFUSED").first(), "REFUSED pill", page);
      await page.waitForTimeout(3000);
      await hover(page.locator("text=Channel A read").first(), "Channel A read", page);
    } else {
      missed.push("REFUSED row not found in ledger");
    }
    await waitUntil(85_000);

    logBeat("1:25 goBack to /console");
    await page.goto("/console", { waitUntil: "networkidle" });
    await hover(page.getByText("Recent agent calls").first(), "Recent agent calls", page);
    const cleanPromise = agentCall("submit_payment", { recipient_ref: "translator-kl", artifact: clean });
    
    // Wait for the result
    const cleanResult = await cleanPromise;
    console.log("Clean payment result:", cleanResult.slice(0, 200));
    
    // Hover over the newest log row
    await hover(page.locator("text=PAID").first(), "PAID log row", page).catch(() => missed.push("PAID log row hover missed"));
    await waitUntil(115_000);

    logBeat("1:55 goto /ledger");
    await page.goto("/ledger", { waitUntil: "networkidle" });
    
    // Wait for a row containing "PAID"
    let paidRow;
    for (let i = 0; i < 10; i++) {
      paidRow = page.locator("tbody tr").filter({ hasText: "PAID" }).first();
      if (await paidRow.count() > 0) break;
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: "networkidle" });
    }
    
    if (await paidRow.count() > 0) {
      await hover(paidRow.locator("text=PAID").first(), "PAID pill", page);
      await page.waitForTimeout(3000);
      const digestLink = paidRow.locator("a[href^='http']").first();
      if (await digestLink.count() > 0) {
        await hover(digestLink, "digest link", page);
      } else {
        missed.push("Digest link not found");
      }
    } else {
      missed.push("PAID row not found in ledger");
    }
    await waitUntil(130_000);

    logBeat("2:10 goto /console");
    await page.goto("/console", { waitUntil: "networkidle" });
    
    // Click the "Engage kill switch" button
    const killSwitchButton = page.getByRole("button", { name: "Engage kill switch" });
    if (await killSwitchButton.count() > 0) {
      await click(killSwitchButton, "Engage kill switch", page);
      await page.waitForTimeout(2000);
    } else {
      missed.push("Engage kill switch button not found");
    }
    
    // Try to submit payment again (should be refused)
    await hover(page.getByText("Recent agent calls").first(), "Recent agent calls", page);
    const refusedPromise = agentCall("submit_payment", { recipient_ref: "translator-kl", artifact: clean });
    const refusedResult = await refusedPromise;
    console.log("Refused payment result:", refusedResult.slice(0, 200));
    
    // Hover over the newest log row (should say REFUSED)
    await hover(page.locator("text=REFUSED").first(), "REFUSED log row", page);
    await waitUntil(150_000);

    logBeat("2:30 End");
  } finally {
    // Cleanup: disable kill switch if it was engaged
    try {
      const cleanupPage = await browser.newPage();
      await cleanupPage.goto(`${baseUrl}/console`, { waitUntil: "networkidle" });
      await cleanupPage.evaluate((t) => sessionStorage.setItem("tiba_operator_token", t), TOKEN);
      await cleanupPage.reload({ waitUntil: "networkidle" });
      
      const disableButton = cleanupPage.getByRole("button", { name: "Disable kill switch" });
      if (await disableButton.count() > 0) {
        await click(disableButton, "Disable kill switch", cleanupPage);
        console.log("Kill switch disabled");
      }
      await cleanupPage.close();
    } catch (error) {
      console.error("Error disabling kill switch:", error.message);
    }

    await context.close();
    await browser.close();

    if (existsSync(webmPath)) {
      renameSync(webmPath, join(recordingsDir, `tiba-webmcp-demo-${Date.now()}.webm`));
    }
    renameSync(latestWebm(), webmPath);

    await run("ffmpeg", ["-y", "-i", webmPath, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-r", "30", "-pix_fmt", "yuv420p", mp4Path]);
    console.log("MP4:", mp4Path);
    await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path]);

    if (missed.length) {
      console.log("Missed beats:");
      for (const item of missed) console.log(`- ${item}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});