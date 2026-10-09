#!/opt/miniconda3/bin/python3
"""tile.py out.jpg cols width img1 img2 ... — labelled grid for quick review."""
import sys
from PIL import Image, ImageDraw
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = sys.argv[4:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = int(im.height * w / im.width)
    ims.append((f.split('/')[-1], im.resize((w, h))))
h = max(i.height for _, i in ims)
rows = (len(ims) + cols - 1) // cols
c = Image.new('RGB', (cols * (w + 6), rows * (h + 22)), (40, 40, 40))
d = ImageDraw.Draw(c)
for k, (name, im) in enumerate(ims):
    x, y = (k % cols) * (w + 6), (k // cols) * (h + 22)
    c.paste(im, (x, y + 20))
    d.text((x + 4, y + 4), name, fill=(255, 220, 120))
c.save(out, quality=88)
