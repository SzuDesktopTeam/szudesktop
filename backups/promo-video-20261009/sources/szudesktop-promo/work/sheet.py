# Contact sheet: python sheet.py out.jpg cols label_prefix files...
import sys, os
from PIL import Image, ImageDraw
out, cols = sys.argv[1], int(sys.argv[2])
files = sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w = 640 if ims[0].width >= ims[0].height else 300
ims2 = []
for im in ims:
    h = round(im.height * w / im.width)
    ims2.append(im.resize((w, h), Image.LANCZOS))
h = ims2[0].height
rows = (len(ims2) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w + 6) + 6, rows * (h + 26) + 6), (40, 34, 26))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims2, files)):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 26)
    sheet.paste(im, (x, y + 20))
    d.text((x, y + 4), os.path.basename(f), fill=(255, 220, 120))
sheet.save(out, quality=88)
