#!/opt/miniconda3/bin/python3
"""Compare several renders of the same frame range (same code) and flag broken frames per run.

usage: vote.py RUNDIR... [--ref REFDIR]
For every frame the consensus is the version that agrees (mean |RGB| < 1 on a 160-px proxy) with
the most other runs (REFDIR, if given, counts as two votes). A run's frame that disagrees with the
consensus is reported as broken. Content is deterministic, so clean renders agree.
"""
import glob, os, re, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
ref = None
if '--ref' in args:
    i = args.index('--ref')
    ref = args[i + 1]
    del args[i:i + 2]
runs = args + ([ref] if ref else [])
num = lambda p: int(re.findall(r'(\d+)\.png$', p)[0])

def proxy(p, w=160):
    im = Image.open(p).convert('RGB')
    return np.asarray(im.resize((w, round(im.height * w / im.width)), Image.BOX)).astype(np.float32)

frames = sorted({num(p) for r in runs for p in glob.glob(os.path.join(r, '*.png'))})
broken = {r: [] for r in args}
undecided = []
for n in frames:
    ims = {}
    for r in runs:
        ps = glob.glob(os.path.join(r, f'*-{n:04d}.png')) + glob.glob(os.path.join(r, f'*-{n}.png'))
        if ps:
            ims[r] = proxy(ps[0])
    keys = list(ims)
    agree = {a: [b for b in keys if b != a and float(np.abs(ims[a] - ims[b]).mean()) < 1.0] for a in keys}
    weight = lambda a: sum(2 if b == ref else 1 for b in agree[a]) + (2 if a == ref else 1)
    best = max(keys, key=weight)
    if weight(best) < 2 or (len(keys) > 2 and len(agree[best]) == 0):
        undecided.append(n)
        continue
    for r in args:
        if r in ims and r != best and r not in agree[best]:
            broken[r].append(n)
for r in args:
    print(f'{os.path.basename(r.rstrip("/")):28s} broken {len(broken[r]):3d}: {broken[r]}')
if undecided:
    print('no consensus:', undecided)
