import sys, os, glob, re
from PIL import Image, ImageDraw, ImageFont
src, out, cut = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(glob.glob(os.path.join(src, '*.png')))
ims = [Image.open(f).convert('RGB') for f in files]
vertical = ims[0].height > ims[0].width
w = 270 if vertical else 384
cols = 10 if vertical else 6
th = round(ims[0].height * w / ims[0].width)
rows = (len(ims) + cols - 1) // cols
pad, lab = 8, 26
sheet = Image.new('RGB', (cols * (w + pad) + pad, 70 + rows * (th + lab + pad) + pad), (63, 56, 41))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/Users/alakazan/workplace/szudesktop-promo/video/node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff', 20)
except Exception:
    font = None
d.text((pad, 20), f'szuDesktop promo {cut} - one still per second', fill=(255, 211, 111), font=font)
for i, (im, f) in enumerate(zip(ims, files)):
    x = pad + (i % cols) * (w + pad)
    y = 70 + (i // cols) * (th + lab + pad)
    sheet.paste(im.resize((w, th), Image.LANCZOS), (x, y + lab))
    m = re.search(r'_t([\d.]+)s', os.path.basename(f))
    d.text((x + 2, y + 3), f"{m.group(1) if m else os.path.basename(f)} s", fill=(255, 249, 233), font=font)
sheet.save(out, quality=90)
print(out, sheet.size, len(ims))
