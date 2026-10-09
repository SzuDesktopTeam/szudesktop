#!/opt/miniconda3/bin/python3
"""Grab exact frames from a finished cut (bundled Remotion ffmpeg) and tile them with labels.

usage: grab.py CUT OUT.jpg [--w 480] [--cols 6] [--crop x,y,w,h] SPEC...
  CUT   16x9 | 9x16 (reads out/szudesktop-promo-CUT.mp4) or a path to an mp4
  SPEC  1830          single frame
        1830-1845     every frame in range (inclusive)
        1830-1900:5   every 5th frame
        30.47t        frame nearest to 30.47 s
Frames are cached as PNG in work/qa/cache/<cut>/fNNNNN.png (full resolution).
"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
FPS = 60

args = sys.argv[1:]
opt = {'w': 480, 'cols': 6, 'crop': None}
specs = []
i = 2
cut, out = args[0], args[1]
while i < len(args):
    a = args[i]
    if a.startswith('--'):
        opt[a[2:]] = args[i + 1]
        i += 2
        continue
    specs.append(a)
    i += 1
src = cut if cut.endswith('.mp4') else f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
tag = os.path.splitext(os.path.basename(src))[0].replace('szudesktop-promo-', '')
cache = f'{ROOT}/work/qa/cache/{tag}'
os.makedirs(cache, exist_ok=True)
stamp = os.path.getmtime(src)
# invalidate cache if the video is newer than the cache marker
marker = f'{cache}/.stamp'
if not os.path.exists(marker) or float(open(marker).read() or 0) != stamp:
    for fn in os.listdir(cache):
        if fn.endswith('.png'):
            os.remove(f'{cache}/{fn}')
    open(marker, 'w').write(str(stamp))

frames = []
for s in specs:
    if s.endswith('t'):
        frames.append(round(float(s[:-1]) * FPS))
    elif '-' in s:
        rng, _, step = s.partition(':')
        a, b = map(int, rng.split('-'))
        frames.extend(range(a, b + 1, int(step or 1)))
    else:
        frames.append(int(s))

dense = f'{ROOT}/work/qa/dense/{tag}'
def path(n):
    d = f'{dense}/f{n:05d}.jpg'
    if os.path.exists(d) and os.path.getmtime(d) > stamp:
        return d
    return f'{cache}/f{n:05d}.png'

# extract missing frames in contiguous runs
need = sorted(set(n for n in frames if not os.path.exists(path(n))))
runs = []
for n in need:
    if runs and n - runs[-1][1] <= 8:
        runs[-1][1] = n
    else:
        runs.append([n, n])
for a, b in runs:
    tmp = f'{cache}/run_%05d.png'
    subprocess.run([f'{CD}/ffmpeg', '-v', 'error', '-ss', f'{max(0, (a - 0.3) / FPS):.5f}', '-i', src, '-frames:v', str(b - a + 1), '-start_number', str(a), '-y', tmp], env=ENV, check=True)
    for n in range(a, b + 1):
        p = f'{cache}/run_{n:05d}.png'
        if os.path.exists(p):
            os.replace(p, path(n))

w, cols = int(opt['w']), int(opt['cols'])
crop = tuple(map(int, opt['crop'].split(','))) if opt['crop'] else None
ims = []
for n in frames:
    im = Image.open(path(n)).convert('RGB')
    if crop:
        x, y, cw, ch = crop
        im = im.crop((x, y, x + cw, y + ch))
    h = round(im.height * w / im.width)
    ims.append((n, im.resize((w, h), Image.LANCZOS)))
h = max(im.height for _, im in ims)
rows = (len(ims) + cols - 1) // cols
lab = 24
sheet = Image.new('RGB', (cols * (w + 6) + 6, rows * (h + lab + 6) + 6), (40, 36, 30))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype(f'{ROOT}/video/node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff', 17)
except Exception:
    font = None
for k, (n, im) in enumerate(ims):
    x = 6 + (k % cols) * (w + 6)
    y = 6 + (k // cols) * (h + lab + 6)
    sheet.paste(im, (x, y + lab))
    d.text((x + 2, y + 2), f'f{n}  {n / FPS:.3f}s', fill=(255, 220, 120), font=font)
sheet.save(out, quality=88)
print(out, sheet.size, len(ims))
