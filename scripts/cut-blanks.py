"""Cut near-blank stretches (white/black page loads) out of a screen recording.

usage: python scripts/cut-blanks.py IN.mp4 OUT.mp4 [--min 1.0] [--keep 0.3] [--thresh 6]

Writes OUT.mp4 and OUT.json ({"removed": [[start, end], ...] in ORIGINAL seconds,
"duration_in", "duration_out"}). Shift a narration timestamp t with shift(t) below, or:
    cut_t = t - sum(min(end, t) - start for start, end in removed if start < t)
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageStat

FPS = 4


def arg(name, default):
    if name in sys.argv:
        return float(sys.argv[sys.argv.index(name) + 1])
    return default


def duration(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]
    )
    return float(out.decode().strip())


def blank_runs(src, thresh, min_len, keep):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.check_call(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", src,
             "-vf", f"fps={FPS},scale=32:18,format=gray", os.path.join(tmp, "%06d.png")]
        )
        names = sorted(os.listdir(tmp))
        flags = []
        for name in names:
            with Image.open(os.path.join(tmp, name)) as img:
                flags.append(ImageStat.Stat(img).stddev[0] < thresh)
    runs, start = [], None
    for i, blank in enumerate(flags + [False]):
        if blank and start is None:
            start = i
        elif not blank and start is not None:
            a, b = start / FPS, i / FPS
            if b - a >= min_len:
                runs.append([round(a + keep, 2), round(b, 2)])  # keep a flash of the load
            start = None
    return runs


def shift(t, removed):
    return t - sum(min(end, t) - start for start, end in removed if start < t)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    thresh, min_len, keep = arg("--thresh", 6), arg("--min", 1.0), arg("--keep", 0.3)
    total = duration(src)
    removed = blank_runs(src, thresh, min_len, keep)
    keeps, cursor = [], 0.0
    for a, b in removed:
        if a > cursor:
            keeps.append((cursor, a))
        cursor = b
    if cursor < total:
        keeps.append((cursor, total))
    select = "+".join(f"between(t,{a},{b})" for a, b in keeps)
    subprocess.check_call(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-an",
         "-vf", f"select='{select}',setpts=N/FRAME_RATE/TB", "-r", "30",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", dst]
    )
    report = {"duration_in": round(total, 2), "duration_out": round(duration(dst), 2), "removed": removed}
    with open(os.path.splitext(dst)[0] + ".json", "w") as fh:
        json.dump(report, fh, indent=1)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
