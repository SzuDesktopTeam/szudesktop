#!/opt/miniconda3/bin/python3
"""One-pass render audit for a finished cut (mp4) or a PNG sequence directory.

usage: audit.py SRC [--first N] [--intended a-b,c,...] [--black a-b,...]
  SRC          out/….mp4, a 16x9 / 9x16 shorthand, or a dir of *.png (remotion --sequence)
  --first N    global frame number of the first frame (PNG dirs: taken from the file names)
  --intended   frames allowed to be isolated outliers (designed glitch frames)
  --black      frames allowed to be black (mean luma < 12)

Per frame (160-px proxy): mean luma, share of 'empty stage' colours (#3F3829 / #492A16 ±7, i.e.
Film / WarmBG background showing through) and the isolated-outlier score
min(d(prev,i), d(i,next)) - d(prev,next). Reported as BROKEN:
  * score >= 3 outside --intended,
  * luma < 12 outside --black,
  * an empty-colour jump: empty(i) exceeds both neighbours by > 3 points (a dark scene that is
    dark on every frame — S15 晚庭, the #492A16 end plate — does not jump, so no region masks).
Exit code 1 if anything is broken.
"""
import glob, json, os, re, subprocess, sys
import numpy as np
from PIL import Image

ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}

def ranges(s):
    out = set()
    for part in filter(None, (s or '').split(',')):
        a, _, b = part.partition('-')
        out.update(range(int(a), int(b or a) + 1))
    return out

args = sys.argv[1:]
src = args[0]
opt = {'first': None, 'intended': '', 'black': ''}
i = 1
while i < len(args):
    opt[args[i][2:]] = args[i + 1]
    i += 2
if src in ('16x9', '9x16'):
    src = f'{ROOT}/out/szudesktop-promo-{src}.mp4'
T = np.array([[0x3F, 0x38, 0x29], [0x49, 0x2A, 0x16]], np.int16)

def stats(a):
    m = np.zeros(a.shape[:2], bool)
    for t in T:
        m |= (np.abs(a.astype(np.int16) - t) <= 7).all(axis=2)
    return float(m.mean() * 100)

fr, emp, nums = [], [], []
if os.path.isdir(src):
    num = lambda p: int(re.findall(r'(\d+)\.png$', p)[0])
    for f in sorted(glob.glob(os.path.join(src, '*.png')), key=num):
        im = Image.open(f).convert('RGB')
        w = 160 if im.width > im.height else 90
        p = np.asarray(im.resize((w, round(im.height * w / im.width)), Image.BOX))
        fr.append(p.astype(np.float32))
        emp.append(stats(np.asarray(im.resize((im.width // 8, im.height // 8), Image.BOX))))
        nums.append(num(f))
else:
    pr = json.loads(subprocess.check_output([f'{CD}/ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', src], env=ENV))
    W, H = pr['streams'][0]['width'], pr['streams'][0]['height']
    w, h = W // 8, H // 8
    p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={w}:{h}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
    pw = 160 if W > H else 90
    ph = round(H * pw / W)
    first = int(opt['first'] or 0)
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        a = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        emp.append(stats(a))
        fr.append(np.asarray(Image.fromarray(a).resize((pw, ph), Image.BOX)).astype(np.float32))
        nums.append(first + len(nums))
    p.wait()

intended, black = ranges(opt['intended']), ranges(opt['black'])
n = len(fr)
if n < 3:
    sys.exit(f'{src}: only {n} frames decoded')
D = lambda a, b: float(np.abs(fr[a] - fr[b]).mean())
broken = []
for k in range(n):
    f = nums[k]
    luma = float(fr[k].mean())
    s = min(D(k - 1, k), D(k, k + 1)) - D(k - 1, k + 1) if 0 < k < n - 1 else 0.0
    jump = emp[k] - max(emp[k - 1] if k > 0 else 0, emp[k + 1] if k < n - 1 else 0) if 0 < k < n - 1 else 0.0
    why = []
    if s >= 3 and f not in intended:
        why.append(f'outlier {s:.1f}')
    if luma < 12 and f not in black:
        why.append(f'black {luma:.1f}')
    if jump > 3 and f not in intended and f not in black:
        why.append(f'empty +{jump:.1f} pts ({emp[k]:.1f}%)')
    if why:
        broken.append(f)
        print(f'  BROKEN frame {f:5d} {f / 60:7.3f}s  ' + '; '.join(why))
print(f'{src}: {n} frames, {len(broken)} broken' + (f' -> {broken}' if broken else ''))
sys.exit(1 if broken else 0)
