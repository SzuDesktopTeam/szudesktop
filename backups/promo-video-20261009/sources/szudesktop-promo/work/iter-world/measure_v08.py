import sys, numpy as np
from PIL import Image
# lowest y of the board's hard shadow (#492a16) / border (#8d633b) per frame, and top of the name strip
def near(a, rgb, tol=10): return (np.abs(a - np.array(rgb)).max(-1) <= tol)
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(int)
    H, W, _ = a.shape
    m = near(a, (0x49, 0x2a, 0x16), 6) | near(a, (0x8d, 0x63, 0x3b), 6)
    # require vertical runs of >= 4 px
    run = m[0:-3] & m[1:-2] & m[2:-1] & m[3:]
    ys, xs = np.where(run[900:1700])
    bottom = (ys.max() + 900 + 3) if len(ys) else -1
    # name strip: rows in 1380..1600 containing paperHi/gold text pixels
    t = near(a, (0xff, 0xfd, 0xf5), 12) | near(a, (0xff, 0xd3, 0x6f), 12)
    rows = np.where(t[1380:1600].sum(1) > 6)[0]
    strip = (rows.min() + 1380, rows.max() + 1380) if len(rows) else None
    print(p.split('/')[-1], 'board bottom', bottom, 'strip text rows', strip)
