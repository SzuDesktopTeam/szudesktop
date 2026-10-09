#!/opt/miniconda3/bin/python3
"""Single-pass frame dumper (bundled Remotion ffmpeg -> raw RGB pipe), much faster than one seek per still.

usage: dump.py CUT [--every N] [--dense-dir DIR] [--stills-dir DIR] [--frames a,b,c-d]
  CUT        16x9 | 9x16 (reads out/szudesktop-promo-CUT.mp4) or a path to an mp4
  --every N  save every Nth frame as JPEG (q90) into DIR/fNNNNN.jpg   (default: off)
  --frames   extra exact frames to save as JPEG into the dense dir
  --stills-dir DIR   also write one PNG per second (CUT_tSSs.png) + the last frame (CUT_tSS.983s_last.png)
"""
import os, subprocess, sys, json
import numpy as np
from PIL import Image

ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
FPS = 60

args = sys.argv[1:]
cut = args[0]
opt = {'every': None, 'dense-dir': None, 'stills-dir': None, 'frames': ''}
i = 1
while i < len(args):
    opt[args[i][2:]] = args[i + 1]
    i += 2
src = cut if cut.endswith('.mp4') else f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
tag = os.path.splitext(os.path.basename(src))[0].replace('szudesktop-promo-', '')
pr = json.loads(subprocess.check_output([f'{CD}/ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', src], env=ENV))
W, H, N = pr['streams'][0]['width'], pr['streams'][0]['height'], int(pr['streams'][0]['nb_frames'])
every = int(opt['every']) if opt['every'] else None
extra = set()
for part in filter(None, opt['frames'].split(',')):
    if '-' in part:
        a, b = map(int, part.split('-'))
        extra.update(range(a, b + 1))
    else:
        extra.add(int(part))
dense = opt['dense-dir']
stills = opt['stills-dir']
if dense:
    os.makedirs(dense, exist_ok=True)
if stills:
    os.makedirs(stills, exist_ok=True)
    for fn in os.listdir(stills):
        if fn.endswith('.png'):
            os.remove(os.path.join(stills, fn))
p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-i', src, '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV, bufsize=W * H * 3 * 2)
n = 0
size = W * H * 3
last = None
saved = 0
while True:
    buf = p.stdout.read(size)
    if len(buf) < size:
        break
    want_dense = dense and ((every and n % every == 0) or n in extra)
    want_still = stills and n % FPS == 0
    if want_dense or want_still:
        im = Image.fromarray(np.frombuffer(buf, np.uint8).reshape(H, W, 3))
        if want_dense:
            im.save(f'{dense}/f{n:05d}.jpg', quality=90)
            saved += 1
        if want_still:
            im.save(f'{stills}/{tag}_t{n // FPS:02d}s.png')
            saved += 1
    last = buf
    n += 1
p.wait()
if stills and last is not None:
    im = Image.fromarray(np.frombuffer(last, np.uint8).reshape(H, W, 3))
    secs = (n - 1) / FPS
    im.save(f'{stills}/{tag}_t{int(secs):02d}.{round((secs - int(secs)) * 1000):03d}s_last.png')
print(f'{src}: {n} frames decoded ({N} expected), {saved} images written')
