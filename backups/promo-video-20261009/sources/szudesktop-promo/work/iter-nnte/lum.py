#!/opt/miniconda3/bin/python3
"""Mean luminance (Rec.709, gamma-encoded 0-255 and relative linear) per frame for a frame range of an mp4,
or for a directory of PNG frames. Flags full-screen 'flashes': |dL| between consecutive frames > 20% (of 255 scale)
usage: lum.py SRC A B      (SRC = mp4 path | 16x9 | 9x16 | png dir with NAME-NNNN.png files)
"""
import os, sys, subprocess, json, glob, re
import numpy as np
from PIL import Image
ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
src, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
def lum_of(arr):
    arr = arr.astype(np.float32) / 255.0
    y = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    yl = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    h = arr.shape[0]
    return float(y.mean()), float(yl.mean()), float(y[: h // 2].mean()), float(y[h // 2 :].mean())
vals = {}
if os.path.isdir(src):
    for p in sorted(glob.glob(f'{src}/*.png')):
        m = re.search(r'(\d+)\.png$', p)
        n = int(m.group(1))
        if a <= n <= b:
            vals[n] = lum_of(np.asarray(Image.open(p).convert('RGB').resize((480, 270) if Image.open(p).width > Image.open(p).height else (270, 480))))
else:
    mp4 = src if src.endswith('.mp4') else f'{ROOT}/out/szudesktop-promo-{src}.mp4'
    pr = json.loads(subprocess.check_output([f'{CD}/ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', mp4], env=ENV))
    W, H = pr['streams'][0]['width'], pr['streams'][0]['height']
    w, h = W // 4, H // 4
    # seek a bit early, then count frames by pts
    start = max(0, a - 30)
    p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-ss', f'{start / 60:.5f}', '-i', mp4, '-frames:v', str(b - start + 1), '-vf', f'scale={w}:{h}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
    n = start
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        if a <= n <= b:
            vals[n] = lum_of(np.frombuffer(buf, np.uint8).reshape(h, w, 3))
        n += 1
    p.wait()
prev = None
flips = []
for n in sorted(vals):
    y, yl, top, bot = vals[n]
    d = 0 if prev is None else y - prev
    mark = ''
    if prev is not None and abs(d) > 0.2:
        mark = ' <== FLIP %+.2f' % d
        flips.append(n)
    print(f'f{n:5d} {n/60:7.3f}s  L={y:.3f} lin={yl:.3f} top={top:.3f} bot={bot:.3f}  d={d:+.3f}{mark}')
    prev = y
print('flips (>20% mean-luma change frame-to-frame):', flips)
# count transitions per 1 s window (pairs of opposing changes = 1 flash; WCAG counts flashes)
fl = sorted(flips)
worst = 0
for i, s in enumerate(fl):
    cnt = sum(1 for t in fl if s <= t < s + 60)
    worst = max(worst, cnt)
print('max luma transitions (>20%) in any 60-frame window:', worst)
