import math
def inOut(t):
    t = min(1, max(0, t))
    return 4*t*t*t if t < 0.5 else 1 - (-2*t + 2)**3 / 2
AT4 = 113
def run(cx=900, cy=560, cam_y0=None, cam_x0=None, k=1.18, label=''):
    cam_y0 = cy if cam_y0 is None else cam_y0
    cam_x0 = cx + 90 if cam_x0 is None else cam_x0
    SH_W, PG_W, PG_H, PG_X, PG_Y = 210, 972, 774, 420, 89
    total = (SH_W + PG_W) * k
    left = cx - total / 2
    top = cy - PG_H * k / 2
    pages_left = left + SH_W * k
    typing = (pages_left + 6 + (980 - PG_X) * k, top + 6 + (700 - PG_Y) * k)
    w = SH_W * k + 12; h = PG_H * k + 12
    out = []
    for f in range(0, AT4 + 1, 4):
        u = inOut(f / AT4)
        z = 1 + 0.14 * u
        cxx = cam_x0 + (typing[0] - 120 - cam_x0) * u
        cyy = cam_y0 + (typing[1] - 160 - cam_y0) * u
        tilt = -4 + 6 * u
        th = math.radians(12 + tilt)
        P = 1600
        zf = P / (P - w * math.sin(th))
        lift = h / 2 * (zf - 1)
        xl = (left - 30 + w) - w * math.cos(th) * zf  # left edge stage x
        yl = top + 30 - lift
        s = 1 + (z - 1) * 0.8
        tx = -0.8 * z * (cxx - 960); ty = -0.8 * z * (cyy - 540)
        sx = 960 + (xl - 960) * s + tx
        sy = 540 + (yl - 540) * s + ty
        # typing point on screen (depth 1)
        s1 = z; tx1 = -z * (cxx - 960); ty1 = -z * (cyy - 540)
        tpx = 960 + (typing[0] - 960) * s1 + tx1; tpy = 540 + (typing[1] - 540) * s1 + ty1
        # pages bottom on screen
        pb = 540 + (top + PG_H * k + 12 - 540) * s1 + ty1
        out.append((f, round(sx), round(sy), round(tpx), round(tpy), round(pb)))
    print(label, 'typing stage', [round(v) for v in typing])
    for o in out:
        print('  f%3d shelfTL=(%d,%d) typing@(%d,%d) pagesBottom=%d' % o)
run(label='current cy=560')
run(cy=620, cam_y0=560, label='cy=620 cam start 560')
