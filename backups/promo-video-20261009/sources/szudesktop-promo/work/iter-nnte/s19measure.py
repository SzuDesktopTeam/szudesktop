#!/opt/miniconda3/bin/python3
import sys
import numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(int)
    L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    # shelf card: first bright (paper) row in columns 110..400 below y=20
    tops = []
    for x in range(110, 400, 10):
        col = L[20:600, x]
        idx = np.argmax(col > 215)
        tops.append(20 + idx if col[idx] > 215 else 9999)
    # tag: wood sign — gold text pixels (R>200, G>150, B<110) in the top-left box region
    reg = a[0:200, 0:700]
    gold = (reg[..., 0] > 200) & (reg[..., 1] > 140) & (reg[..., 2] < 120) & (reg[..., 0] - reg[..., 2] > 110)
    ys, xs = np.nonzero(gold)
    tag = (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) > 30 else None
    # tag panel bottom: dark wood rows under the gold text
    print(p.split('/')[-1], 'shelf top (min over x110-400)=', min(tops), ' per-x:', tops[:6], '...', ' tag gold bbox=', tag)
