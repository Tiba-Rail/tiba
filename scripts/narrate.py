"""narrate.py SCRIPT.md VIDEO.mp4 OUT.mp4 WORKDIR [--synth-only]
First run parses SCRIPT.md -> WORKDIR/lines.json (edit it to tighten lines; re-run reuses it).
Clips cached by text hash. Builds a timeline, muxes with ffmpeg, verifies."""
import sys, os, re, json, hashlib, subprocess, requests

script, video, out, work = sys.argv[1:5]
synth_only = "--synth-only" in sys.argv
os.makedirs(work, exist_ok=True)
key = next(l.split("=", 1)[1].strip() for l in open(r"C:/Users/diony/.model-keys.env") if l.startswith("ILMU_API_KEY="))

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout

def dur(p):
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p))

# 1. parse script -> lines.json
lines_path = os.path.join(work, "lines.json")
if not os.path.exists(lines_path):
    lines, ts, buf = [], None, []
    def flush():
        if ts is not None and buf:
            lines.append({"t": ts, "text": " ".join(buf)})
    for raw in open(script, encoding="utf-8"):
        s = raw.strip()
        m = re.match(r"^(?:#+\s*)?(\d+):(\d{2})\s*-\s*(.*)$", s)
        if m:
            flush()
            ts, buf = int(m[1]) * 60 + int(m[2]), []
            rest = m[3].strip()
            if rest and not raw.startswith("#"):  # "0:06 - text" style; "### 0:06 - Title" is a heading
                buf.append(rest)
        elif s and ts is not None and not s.startswith("#"):
            buf.append(s)
    flush()
    json.dump(lines, open(lines_path, "w"), indent=1)
lines = json.load(open(lines_path))

# 2. synthesize + measure
for L in lines:
    h = hashlib.sha1(L["text"].encode()).hexdigest()[:10]
    clip = os.path.join(work, f"clip_{L['t']:03d}_{h}.mp3")
    if not os.path.exists(clip):
        r = requests.post("https://api.ilmu.ai/v1/audio/speech", headers={"Authorization": f"Bearer {key}"},
                          json={"model": "ilmu-tts-v2", "input": L["text"], "response_format": "mp3"}, timeout=180)
        assert r.status_code == 200 and r.headers.get("content-type", "").startswith("audio"), (r.status_code, r.text[:300])
        open(clip, "wb").write(r.content)
    L["clip"], L["dur"] = clip, dur(clip)

# 3. timeline
vdur = dur(video)
prev_end, shifts = 0.0, []
for i, L in enumerate(lines):
    start = max(L["t"], prev_end)
    nxt = lines[i + 1]["t"] if i + 1 < len(lines) else vdur
    if start + L["dur"] > vdur:  # last-resort: pull earlier so it is not cut by video end
        start = max(prev_end, vdur - L["dur"] - 0.2)
    if abs(start - L["t"]) > 0.01:
        shifts.append(f"line@{L['t']}s -> starts {start:.2f}s ({start - L['t']:+.2f}s)")
    L["start"] = start
    prev_end = start + L["dur"] + 0.3
    gap = nxt - L["t"]
    flag = "OVERRUN" if L["dur"] > gap else ""
    print(f"{L['t']:>4}s start={start:6.2f} dur={L['dur']:5.2f} gap={gap:5.1f} {flag} | {L['text'][:70]}")
print("video", vdur, "| shifts:", shifts or "none")
if synth_only:
    sys.exit()

# 4. mix + mux (single ffmpeg: video + clips -> aac narration)
n = len(lines)
fc = "".join(f"[{i+1}:a]aresample=48000,adelay={int(L['start']*1000)}:all=1[c{i}];" for i, L in enumerate(lines))
fc += "".join(f"[c{i}]" for i in range(n))
fc += f"amix=inputs={n}:duration=longest:normalize=0,apad,atrim=0:{vdur},loudnorm=I=-16:TP=-1.5:LRA=11[a]"
cmd = ["ffmpeg", "-y", "-v", "error", "-i", video] + sum([["-i", L["clip"]] for L in lines], []) + [
    "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", out]
subprocess.run(cmd, check=True)

# 5. verify
print("streams:", sh("ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out).split())
print("out dur", dur(out), "src dur", vdur)
vd = subprocess.run(["ffmpeg", "-i", out, "-vn", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
print([l.strip() for l in vd.splitlines() if "mean_volume" in l or "max_volume" in l])
