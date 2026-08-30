import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const baseUrl = process.env.DEMO_BASE_URL ?? "https://tiba-omega.vercel.app";
const recordingsDir = resolve("recordings");
const webmPath = join(recordingsDir, "tiba-demo.webm");
const mp4Path = "C:/Users/diony/Downloads/Hackathons/MUBA/tiba-demo.mp4";
const viewport = { width: 1280, height: 720 };

mkdirSync(recordingsDir, { recursive: true });
mkdirSync("C:/Users/diony/Downloads/Hackathons/MUBA", { recursive: true });

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

function spawnE2e() {
  const output = createWriteStream(join(recordingsDir, "e2e-output.log"), { flags: "w" });
  const child = spawn(npmCommand(), ["run", "e2e"], { shell: true, 
    cwd: process.cwd(),
    env: { ...process.env, E2E_BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  child.on("exit", (code) => {
    output.write(`\n[e2e exited ${code}]\n`);
    output.end();
  });
  return child;
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

async function linkByText(page, name) {
  const byRole = page.getByRole("link", { name }).first();
  if (await byRole.count()) return byRole;
  logBeat(`fallback locator: text "${name}"`);
  return page.getByText(name, { exact: true }).first();
}

async function waitUntil(ms) {
  const delay = start + ms - Date.now();
  if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
}

async function waitForLedgerRows(page) {
  for (let i = 0; i < 30; i += 1) {
    const rows = page.locator("tbody tr");
    if ((await rows.count()) >= 2) return;
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "networkidle" });
  }
  missed.push("ledger did not reach 2 rows within 60s");
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

  console.log("Running demo reset...");
  await run(npmCommand(), ["run", "demo:reset"]);

  const browser = await chromium.launch({
    // Use the Chromium already in the Playwright cache; this machine cannot
    // download the headless-shell build this Playwright version wants.
    executablePath: process.env.PW_CHROME || "C:/Users/diony/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe",
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"]
  });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: recordingsDir, size: viewport }
  });
  await injectCursor(context);
  const page = await context.newPage();

  start = Date.now();
  logBeat("0:00 goto /");
  await page.goto("/", { waitUntil: "networkidle" });
  await setCursor(page, 80, 80);
  await hover(page.getByRole("heading", { name: "Tiba" }).first(), "headline", page);
  await hover(await linkByText(page, "Open console"), "Open console", page);
  await hover(await linkByText(page, "Open ledger"), "Open ledger", page);
  await waitUntil(20_000);

  logBeat('0:20 click "Open console"');
  await click(await linkByText(page, "Open console"), "Open console", page);
  await page.waitForURL("**/console", { timeout: 15000 }).catch(() => missed.push("console navigation was slow"));
  await hover(page.getByText("Daily cap").first(), "Daily cap", page);
  await hover(page.getByText("Day").first(), "Day cap bar", page);
  await hover(page.getByText("Hour").first(), "Hour cap bar", page);
  await hover(page.getByRole("button", { name: /Engage kill switch|Disable kill switch/ }).first(), "kill switch", page);
  await waitUntil(50_000);

  logBeat("0:50 spawn npm run e2e");
  const e2e = spawnE2e();
  await hover(page.getByText("Work orders").first(), "Work orders", page);
  await waitUntil(75_000);

  logBeat("1:15 hold console / scroll to recipients");
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(1500);
  await hover(page.getByText("Recipients").first(), "Recipients", page);
  await waitUntil(110_000);

  logBeat('1:50 click "Open ledger"');
  await page.goto("/ledger", { waitUntil: "networkidle" });
  await waitForLedgerRows(page);
  const redRow = page.locator("tbody tr").filter({ hasText: "RED" }).first();
  const paidRow = page.locator("tbody tr").filter({ hasText: "PAID" }).first();
  await hover(redRow, "RED row", page).catch(() => missed.push("RED row hover missed"));
  await hover(paidRow, "PAID row", page).catch(() => missed.push("PAID row hover missed"));
  await waitUntil(140_000);

  logBeat('2:20 click "Inspect row" on RED');
  await click(redRow.getByText("Inspect row", { exact: true }).first(), "Inspect row RED", page).catch(async () => {
    logBeat('fallback locator: summary "Inspect row" on RED');
    await click(redRow.locator("summary").first(), "Inspect row RED summary", page);
  });
  await hover(redRow.locator("td").nth(4), "reason code", page).catch(() => missed.push("reason code hover missed"));
  await waitUntil(160_000);

  logBeat("2:40 inspect PAID row and open digest");
  await click(paidRow.getByText("Inspect row", { exact: true }).first(), "Inspect row PAID", page).catch(async () => {
    logBeat('fallback locator: summary "Inspect row" on PAID');
    await click(paidRow.locator("summary").first(), "Inspect row PAID summary", page);
  });
  const digest = paidRow.locator("a[href^='http']").first();
  const href = await digest.getAttribute("href");
  if (href) {
    await hover(digest, "digest link", page);
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => missed.push("explorer navigation failed"));
  } else {
    missed.push("PAID digest link missing");
  }
  await waitUntil(190_000);

  logBeat("3:10 goBack to ledger");
  await page.goBack({ waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
    missed.push("goBack failed; reloaded ledger directly");
    await page.goto("/ledger", { waitUntil: "networkidle" });
  });
  await waitUntil(210_000);

  logBeat("3:30 close context");
  await context.close();
  await browser.close();

  if (existsSync(webmPath)) {
    renameSync(webmPath, join(recordingsDir, `tiba-demo-${Date.now()}.webm`));
  }
  renameSync(latestWebm(), webmPath);

  await run("ffmpeg", ["-y", "-i", webmPath, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-r", "30", "-pix_fmt", "yuv420p", mp4Path]);
  console.log("MP4:", mp4Path);
  await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path]);

  if (missed.length) {
    console.log("Missed beats:");
    for (const item of missed) console.log(`- ${item}`);
  }

  e2e.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
