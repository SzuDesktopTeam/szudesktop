#!/opt/miniconda3/bin/python3
"""Find isolated outlier frames (partial paints / dropped tiles) in a cut or a PNG frame dir.

score(i) = min(d(i-1,i), d(i,i+1)) - d(i-1,i+1), d = mean |RGB diff| on a 160-px-wide proxy.
An isolated glitch frame differs from both neighbours while the neighbours agree.
usage: outliers.py IN.mp4|FRAMEDIR [top=30] [min_score=4]
"""
import os, subprocess, sys, json, glob
import numpy as np
from PIL import Image
CD='/Users/alakazan/workplace/szudesktop-promo/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}

src = sys.argv[1]
top = int(sys.argv[2]) if len(sys.argv) > 2 else 30
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0

def frames_from_mp4(path):
    pr = json.loads(subprocess.check_output([CD+'/ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path], env=ENV))
    W, H = pr['streams'][0]['width'], pr['streams'][0]['height']
    w = 160 if W > H else 90
    h = round(H * w / W)
    p = subprocess.Popen([CD+'/ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={w}:{h}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3).astype(np.float32)

def frames_from_dir(d):
    files = sorted(glob.glob(os.path.join(d, '*.png')))
    for f in files:
        im = Image.open(f).convert('RGB')
        w = 160 if im.width > im.height else 90
        yield np.asarray(im.resize((w, round(im.height * w / im.width)), Image.BOX)).astype(np.float32)

gen = frames_from_dir(src) if os.path.isdir(src) else frames_from_mp4(src)
fr = list(gen)
n = len(fr)
d = lambda a, b: float(np.abs(fr[a] - fr[b]).mean())
scores = []
for i in range(1, n - 1):
    a, b, c = d(i - 1, i), d(i, i + 1), d(i - 1, i + 1)
    scores.append((min(a, b) - c, i, a, b, c))
scores.sort(reverse=True)
print(f'{src}: {n} frames')
for s, i, a, b, c in scores[:top]:
    if s < thr:
        break
    print(f'  frame {i:5d} {i / 60:7.3f}s score {s:6.2f}  d(prev)={a:6.2f} d(next)={b:6.2f} d(prev,next)={c:6.2f}')
