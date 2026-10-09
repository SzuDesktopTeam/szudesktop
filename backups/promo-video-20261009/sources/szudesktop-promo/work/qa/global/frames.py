#!/opt/miniconda3/bin/python3
"""Quick health check of a PNG sequence rendered with `remotion render --sequence`.

usage: frames.py DIR [REFDIR]
  per frame: mean luma, share of 'empty stage' colours (#3F3829 / #492A16 ±7), isolated-outlier
  score (min(d(prev,i), d(i,next)) - d(prev,next) on a 160-px proxy) and, with REFDIR, the mean
  |RGB| difference against the same frame of a reference render (deterministic content → a clean
  frame differs by < 1).
"""
import glob, os, re, sys
import numpy as np
from PIL import Image

d = sys.argv[1]
ref = sys.argv[2] if len(sys.argv) > 2 else None
num = lambda p: int(re.findall(r'(\d+)\.png$', p)[0])
files = sorted(glob.glob(os.path.join(d, '*.png')), key=num)
T = np.array([[0x3F, 0x38, 0x29], [0x49, 0x2A, 0x16]], np.int16)

def proxy(p, w=160):
    im = Image.open(p).convert('RGB')
    return np.asarray(im.resize((w, round(im.height * w / im.width)), Image.BOX)).astype(np.float32)

fr = [proxy(f) for f in files]
emp = []
for f in files:
    im = Image.open(f).convert('RGB')
    a = np.asarray(im.resize((im.width // 8, im.height // 8), Image.BOX)).astype(np.int16)
    m = np.zeros(a.shape[:2], bool)
    for t in T:
        m |= (np.abs(a - t) <= 7).all(axis=2)
    emp.append(m.mean() * 100)
D = lambda a, b: float(np.abs(fr[a] - fr[b]).mean())
bad = 0
for i, f in enumerate(files):
    n = num(f)
    s = min(D(i - 1, i), D(i, i + 1)) - D(i - 1, i + 1) if 0 < i < len(files) - 1 else 0.0
    r = ''
    if ref:
        rp = os.path.join(ref, os.path.basename(f))
        if os.path.exists(rp):
            dr = float(np.abs(proxy(rp) - fr[i]).mean())
            r = f' ref {dr:6.2f}' + ('  <-- DIFF' if dr > 1.0 else '')
            bad += dr > 1.0
    print(f'{n:5d} luma {fr[i].mean():6.1f} empty {emp[i]:5.1f}% score {s:6.2f}{r}')
if ref:
    print(f'{bad} of {len(files)} frames differ from the reference')
