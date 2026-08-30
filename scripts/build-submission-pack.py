"""Builds Downloads/Hackathons/MUBA/Tiba_MUBA_Submission_Pack.pdf from docs/ via headless Chrome.

Dev tool. Copy comes verbatim from docs/DEVFOLIO.md and docs/GLOSSARY.md so the PDF cannot
drift from what was entered on Devfolio. No <h1> for the title (Paged/Chrome page-break rule).
"""
import html
import io
import os
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = pathlib.Path(r"C:\Users\diony\Downloads\Hackathons\MUBA")
OUT_DIR.mkdir(parents=True, exist_ok=True)

dev = io.open(ROOT / "docs" / "DEVFOLIO.md", encoding="utf-8").read()
glo = io.open(ROOT / "docs" / "GLOSSARY.md", encoding="utf-8").read()


def section(md, title):
    m = re.search(r"^## " + re.escape(title) + r".*?\n(.*?)(?=^## |\Z)", md, re.S | re.M)
    return m.group(1).strip() if m else ""


def para(txt):
    out = []
    for block in re.split(r"\n\s*\n", txt.strip()):
        block = block.strip()
        if not block:
            continue
        if block.startswith("- "):
            items = [html.escape(l[2:].strip()) for l in block.splitlines() if l.strip().startswith("- ")]
            out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")
        else:
            out.append(f"<p>{html.escape(block)}</p>")
    return "\n".join(out)


def copyblock(title, body):
    return f'<div class="copy"><div class="copytitle">{html.escape(title)}</div>{para(body)}</div>'


glossary_items = []
for l in glo.splitlines():
    if l.startswith("- "):
        item = html.escape(l[2:].strip())
        item = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", item)
        glossary_items.append(item)

DISCORD = (
    "Hi Jack, Rain — Faris here from Rizqey Labs, with Aariz and Arthur. We're building Tiba on your track. "
    "In plain terms: it lets a piece of software pay a person without a human approving each payment, and stays "
    "safe by checking every request two separate ways through GonkaRouter before any money moves. If the two "
    "checks disagree, it refuses.\n\n"
    "One question from building on the router: the same model sometimes answers in under a second and sometimes "
    "takes 30–40 seconds, depending on which node picks up the request. We worked around it by sending each check "
    "to two models at once and taking whichever answers first. Is there a setting on your side for this, or is our "
    "workaround the right approach? Happy to share what we built."
)

FOLLOWUPS = (
    "- \"Which models?\" — Kimi and DeepSeek. Both through your router.\n"
    "- \"How do you know an answer is good?\" — We asked for a fixed format. If the answer doesn't match it exactly, "
    "we ignore it and use the other one.\n"
    "- \"Why not just one model?\" — Because one slow node stalls the whole payment. Two at once means the fast one wins."
)

CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: Inter, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }
.doc-title { font-size: 22pt; font-weight: 700; margin: 0 0 2pt; }
.sub { color: #555; margin: 0 0 14pt; font-size: 10.5pt; }
h2 { font-size: 14pt; margin: 16pt 0 6pt; padding-top: 6pt; border-top: 1px solid #ddd; break-after: avoid; }
ul { margin: 4pt 0 8pt 18pt; padding: 0; } li { margin: 2pt 0; }
p { margin: 5pt 0; }
a { color: #0645ad; text-decoration: none; word-break: break-all; }
.copy { border: 1px solid #ccc; border-radius: 6px; padding: 8pt 10pt; margin: 8pt 0; break-inside: avoid; }
.copytitle { font-weight: 700; font-size: 10pt; text-transform: uppercase; letter-spacing: .04em; color: #444; margin-bottom: 4pt; }
code { font-family: Consolas, monospace; font-size: 10pt; background: #f3f3f3; padding: 1px 4px; border-radius: 3px; }
"""

ADDR = "0xb91e5bd8be3c828e329c2e4368f6f8abb9ec6e1ba53d9f8966b8369027224bef"
DIGEST = "2BLvd6pGqgsyMbnoDXNzoJyWezTChr2qjLBCL5LoAsV2"

BODY = f"""
<div class="doc-title">Tiba — MUBA Submission Pack</div>
<p class="sub">Rizqey Labs · GonkaRouter track + both Sui tracks · Submission closes 5 Sep 2026, 11:59 PM MYT · Pitch at APU, 6 Sep</p>

<h2>Links</h2>
<ul>
<li><b>Live app:</b> <a href="https://tiba-omega.vercel.app">https://tiba-omega.vercel.app</a> — landing, /console, /ledger, /r/&lt;token&gt;</li>
<li><b>Source:</b> <a href="https://github.com/Tiba-Rail/tiba">https://github.com/Tiba-Rail/tiba</a> — public, CI green</li>
<li><b>Devfolio project:</b> <a href="https://devfolio.co/projects/tiba-f440/update">https://devfolio.co/projects/tiba-f440/update</a></li>
<li><b>MUBA dashboard:</b> <a href="https://muba-hackathon.devfolio.co/dashboard">https://muba-hackathon.devfolio.co/dashboard</a></li>
<li><b>Discord:</b> <a href="https://discord.gg/2WrGAwpWVW">https://discord.gg/2WrGAwpWVW</a> — Gonka mentor channel, #resources</li>
<li><b>Rules / timeline:</b> <a href="https://www.mubahack.xyz/frequently_asked_questions/code.html">mubahack.xyz FAQ</a> · <a href="https://www.mubahack.xyz/event_timeline/code.html">timeline</a></li>
<li><b>Circle USDC faucet (optional):</b> <a href="https://faucet.circle.com">https://faucet.circle.com</a> — Sui Testnet, address <code>{ADDR}</code></li>
<li><b>Proof digest:</b> <a href="https://suiscan.xyz/testnet/tx/{DIGEST}">{DIGEST[:10]}…{DIGEST[-6:]}</a> — paid through the live deployment</li>
</ul>

<h2>Status</h2>
<ul>
<li><b>Built:</b> two-channel verification through GonkaRouter (hedged across Kimi + DeepSeek), policy engine with atomic caps, Sui testnet settlement, console, ledger, public receipts, landing page. 44 commits.</li>
<li><b>Proven:</b> real intents through the live site — adversarial refused, clean paid with digest. Eval: 20/20 clean paid, 10/10 attacks refused, 0 false refusals, ~13 s per decision. Refusal ~7 s, payment ~16 s.</li>
<li><b>Devfolio:</b> every field filled, links in, all three tracks with fit text. <b>Not yet submitted.</b></li>
<li><b>Team on Devfolio:</b> Faris Irfan, Arthur Wong, Aariz Sajan.</li>
</ul>

<h2>What is left — four steps, in order</h2>
<ul>
<li><b>Step 1.</b> Record the demo video. Script on the next page. 3 to 5 minutes.</li>
<li><b>Step 2.</b> Submit on Devfolio. Before Friday 5 Sep, 11:59 PM. Steps below.</li>
<li><b>Step 3.</b> Rehearse the pitch out loud, five times, with Aariz at least twice.</li>
<li><b>Step 4.</b> Saturday 6 Sep at APU. Logistics below.</li>
</ul>
<p>Discord intro: done, posted in the GonkaRouter chatroom. If they reply, the three likely questions and answers are on the Discord page of this pack.</p>

<h2>Step 1 — Demo video: exact script</h2>
<p><b>Set up before you press record</b></p>
<ul>
<li>Open Loom. Choose screen + microphone.</li>
<li>Chrome window on <a href="https://tiba-omega.vercel.app">https://tiba-omega.vercel.app</a>, zoomed to 150% so text is readable in the video.</li>
<li>A terminal window in <code>C:\\Users\\diony\\dev\\tiba</code>, font size 18 or bigger.</li>
<li>In the terminal, run <code>npm run demo:reset</code> and wait for it to finish. This clears old rows so the ledger starts empty.</li>
<li>Have this command ready to paste: <code>E2E_BASE_URL=https://tiba-omega.vercel.app npm run e2e</code></li>
</ul>
<p><b>Recording — what is on screen, what you do, what you say</b></p>
<ul>
<li><b>0:00 — Chrome, landing page.</b> Do nothing yet. Say: "This is Tiba. Software pays a person. No human approves each payment. Policy holds the line. I'm going to show you one real payment and one fake one."</li>
<li><b>0:20 — Click "Open console".</b> Move the mouse over Daily cap, then Hour cap, then the kill switch. Say: "These are the limits I set once. How much per day, how much per hour, who can be paid, and a kill switch. The software cannot go past them, no matter what it is told."</li>
<li><b>0:50 — Switch to the terminal.</b> Paste the command, press Enter. Say: "I'm sending two payment requests. One is a real delivery note from a contractor. The other is the same note with a line added that tells the system to pay a much bigger amount."</li>
<li><b>1:15 — While it runs, about 30 seconds.</b> Say: "Each request is checked two separate ways through GonkaRouter. One check reads the note. The other check reads our own records and never sees the note. Both have to name the same person and the same amount. If they disagree, nothing moves."</li>
<li><b>1:50 — Back to Chrome, click "Open ledger".</b> Two rows appear. Point at the RED one. Say: "The fake one: refused. The two checks disagreed on the amount." Point at the PAID one. Say: "The real one: paid."</li>
<li><b>2:20 — Click "Inspect row" on the RED row.</b> Say: "The receipt says exactly why. Two checks, two different amounts, so it stopped."</li>
<li><b>2:40 — Click "Inspect row" on the PAID row, then click the digest link.</b> The Sui explorer opens. Say: "And this is the actual transaction on the Sui test network. Not a mock."</li>
<li><b>3:10 — Back to the ledger tab.</b> Say: "Every outcome gets a public receipt like this. The person being paid can see why they were paid or refused, and which checks decided it."</li>
<li><b>3:30 — Stay on the ledger.</b> Say: "Test network only. Built in a week for MUBA by Rizqey Labs. That's Tiba." Stop recording.</li>
</ul>
<p><b>After recording:</b> in Loom, copy the share link. Keep it for Step 2. If the terminal step took longer than 45 seconds, record again — the models are slow sometimes and a second take is usually faster because the router remembers the request.</p>

<h2>Step 2 — Submit on Devfolio</h2>
<ul>
<li>Open <a href="https://devfolio.co/projects/tiba-f440/update">https://devfolio.co/projects/tiba-f440/update</a></li>
<li><b>Project media</b> has a red star. It is required. Click the +, upload the landing-page screenshot: <code>C:\\Users\\diony\\AppData\\Local\\Temp\\claude-chrome-screenshots-wB0oHV\\screenshot-1788071652881-1.jpg</code> (or take a fresh one of the live landing page).</li>
<li><b>Project links</b> → click the pencil → "+ Add link" → paste the Loom link → Save.</li>
<li>Click <b>Publish project</b> (blue button, top right). Confirm.</li>
<li>Open <a href="https://muba-hackathon.devfolio.co/dashboard">https://muba-hackathon.devfolio.co/dashboard</a> and check it shows the project as submitted. If it does not, you are not in.</li>
</ul>

<h2>Step 3 — Rehearse</h2>
<ul>
<li>Open three files in <code>C:\\Users\\diony\\dev\\tiba\\docs</code>: <b>DECK.md</b> (what to say, slide by slide), <b>QA.md</b> (the six questions judges will ask, with answers), <b>GLOSSARY.md</b> (one sentence per word).</li>
<li>Do the pitch out loud with a timer. Stop at 4:45. Five times.</li>
<li>Aariz does it with you at least twice. Two people in the room — solo pitchers were told they lose the Q&amp;A.</li>
<li>Read the glossary until you can say every line without looking.</li>
</ul>

<h2>Step 4 — Saturday 6 Sep, APU</h2>
<ul>
<li>Leave Shah Alam by 7:15. Registration opens 8:00. Pitch rooms open 9 to 10, first come first served, one room per track. Go to the <b>Gonka room first</b>, then both Sui rooms.</li>
<li>Bring: laptop, charger, phone hotspot in case the wifi dies.</li>
<li>Before your slot, in the terminal: <code>npm run demo:reset</code>, then the same e2e command from Step 1, so the ledger has fresh rows.</li>
<li>Pitch is 5 minutes, then 5 minutes of questions. Judges: Jack (engineer) and Rain (product) for Gonka; Raphael for Sui.</li>
</ul>

<h2>Discord intro — paste as is</h2>
{copyblock("Gonka mentor channel", DISCORD)}
{copyblock("If they reply — the three likely questions and what you say", FOLLOWUPS)}

<h2>Devfolio copy — already entered, kept for reference</h2>
{copyblock("Tagline", section(dev, "Tagline"))}
{copyblock("The problem it solves", section(dev, "The problem it solves"))}
{copyblock("Challenges we ran into", section(dev, "Challenges we ran into"))}
{copyblock("Technologies / Platforms", section(dev, "Technologies used") + chr(10) + chr(10) + section(dev, "Platforms"))}

<h2>Track fit — one per track</h2>
{copyblock("Gonka Router — AI For Society", section(dev, "Track fit — Gonka Router, AI For Society"))}
{copyblock("Sui Foundation — Anything AI powered by Sui", section(dev, "Track fit — Sui Foundation, Anything AI powered by Sui"))}
{copyblock("Sui Foundation — Payment and stablecoins", section(dev, "Track fit — Sui Foundation, Payment and stablecoins"))}
{copyblock("Single version, if one field covers all tracks", section(dev, "Track fit — single version, if one field covers all tracks"))}

<h2>Glossary — the sentence to say when a judge uses the word</h2>
<ul>{"".join(f"<li>{i}</li>" for i in glossary_items)}</ul>

<h2>Demo-day commands</h2>
<ul>
<li><b>Reset to seeded state:</b> <code>npm run demo:reset</code></li>
<li><b>Populate the live ledger:</b> <code>E2E_BASE_URL=https://tiba-omega.vercel.app npm run e2e</code> (spends 0.002 testnet SUI)</li>
<li><b>Re-run the eval table:</b> <code>MOCK_SETTLEMENT=1 npm run eval</code> → <code>docs/EVAL.md</code> (clears the ledger — run the e2e after)</li>
<li><b>Never:</b> mainnet, real funds. Disqualification ground.</li>
</ul>
"""

doc = ("<!doctype html><html><head><meta charset='utf-8'><title>Tiba — MUBA Submission Pack</title>"
       f"<style>{CSS}</style></head><body>{BODY}</body></html>")
out_html = OUT_DIR / "Tiba_MUBA_Submission_Pack.html"
out_html.write_text(doc, encoding="utf-8")
out_pdf = out_html.with_suffix(".pdf")

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(chrome):
    chrome = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
udd = tempfile.mkdtemp(prefix="tiba-pdf-")
subprocess.run(
    [chrome, "--headless=new", "--disable-gpu", f"--user-data-dir={udd}", "--no-pdf-header-footer",
     f"--print-to-pdf={out_pdf}", out_html.as_uri()],
    capture_output=True, text=True, timeout=120,
)
print("pdf:", out_pdf, os.path.getsize(out_pdf) if out_pdf.exists() else "MISSING")
try:
    from pypdf import PdfReader
    rd = PdfReader(str(out_pdf))
    t0 = (rd.pages[0].extract_text() or "").strip()
    print("pages:", len(rd.pages), "| page1 starts:", repr(t0[:50]))
except Exception as e:  # noqa: BLE001
    print("verify skipped:", e)
