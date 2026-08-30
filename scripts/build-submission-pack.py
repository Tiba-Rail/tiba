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

<h2>To do — in order</h2>
<ul>
<li><b>1. Discord intro</b> in the Gonka mentor channel — copy below.</li>
<li><b>2. Demo video</b>, 3–5 min, YouTube/Loom unlisted. Before recording: <code>npm run demo:reset</code> then <code>E2E_BASE_URL=https://tiba-omega.vercel.app npm run e2e</code> so the live ledger has rows. Script beats in <code>docs/DECK.md</code>.</li>
<li><b>3. Submit on Devfolio</b> before 5 Sep 11:59 PM. Add the video link first. No submission = disqualified.</li>
<li><b>4. Rehearse</b> from <code>docs/DECK.md</code>, <code>docs/QA.md</code>, <code>docs/GLOSSARY.md</code>. 5 min pitch + 5 min Q&amp;A. Both of you in the room — solo pitchers were warned they lose the Q&amp;A.</li>
<li><b>5. Pitch day</b> 6 Sep at APU. Registration 8:00 AM, rooms from 9–10 AM, first-come-first-served per track. Charger, terminal 20pt, browser 150%.</li>
<li><b>Optional:</b> Circle USDC (SUI stand-in already works) · a design pass on the UI.</li>
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
