#!/opt/miniconda3/bin/python3
"""Highlight 'empty stage' coloured pixels (#3F3629 / #482A15 ±7) in cached frames.
usage: emptymask.py CUT OUT.jpg FRAME... (frames must already be cached by grab.py)"""
import sys
import numpy as np
from PIL import Image, ImageDraw
ROOT = '/Users/alakazan/workplace/szudesktop-promo'
cut, out, frames = sys.argv[1], sys.argv[2], [int(a) for a in sys.argv[3:]]
targets = np.array([[0x3F, 0x36, 0x29], [0x48, 0x2A, 0x15]], dtype=np.int16)
tiles = []
for n in frames:
    im = Image.open(f'{ROOT}/work/qa/cache/{cut}/f{n:05d}.png').convert('RGB')
    a = np.asarray(im).astype(np.int16)
    m = np.zeros(a.shape[:2], bool)
    for t in targets:
        m |= (np.abs(a - t) <= 7).all(axis=2)
    b = a.copy().astype(np.uint8)
    b[m] = [255, 0, 255]
    t = Image.fromarray(b)
    w = 640
    t = t.resize((w, round(t.height * w / t.width)))
    d = ImageDraw.Draw(t)
    d.rectangle((0, 0, 260, 22), fill=(0, 0, 0))
    d.text((4, 4), f'f{n} {n/60:.3f}s {m.mean()*100:.1f}%', fill=(255, 255, 0))
    tiles.append(t)
cols = 3
W = tiles[0].width
H = max(t.height for t in tiles)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (W + 4), rows * (H + 4)), (20, 20, 20))
for k, t in enumerate(tiles):
    sheet.paste(t, ((k % cols) * (W + 4), (k // cols) * (H + 4)))
sheet.save(out, quality=85)
print(out)
