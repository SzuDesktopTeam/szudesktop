#!/opt/miniconda3/bin/python3
"""tile.py OUT.jpg W COLS file1 file2 ... [--crop x,y,w,h] — labelled contact sheet."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
args = sys.argv[1:]
crop = None
if '--crop' in args:
    i = args.index('--crop'); crop = tuple(map(int, args[i + 1].split(','))); del args[i:i + 2]
out, w, cols, files = args[0], int(args[1]), int(args[2]), args[3:]
ims = []
for p in files:
    im = Image.open(p).convert('RGB')
    if crop:
        x, y, cw, ch = crop; im = im.crop((x, y, x + cw, y + ch))
    ims.append((os.path.basename(p), im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)))
h = max(i.height for _, i in ims); lab = 22
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w + 4) + 4, rows * (h + lab + 4) + 4), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for k, (n, im) in enumerate(ims):
    x = 4 + (k % cols) * (w + 4); y = 4 + (k // cols) * (h + lab + 4)
    sheet.paste(im, (x, y + lab)); d.text((x + 2, y + 4), n, fill=(255, 220, 120))
sheet.save(out, quality=88); print(out, sheet.size)
