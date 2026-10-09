import math
def inOut(t):
    t = min(1, max(0, t))
    return 4*t*t*t if t < 0.5 else 1 - (-2*t + 2)**3 / 2
AT4 = 113
def sim(cx=900, cy=560, cam0=(990, 560), m0=0, m1=AT4, zEnd=1.14, endOff=(-120, -160), k=1.18):
    SH_W, PG_W, PG_H, PG_X, PG_Y = 210, 972, 774, 420, 89
    total = (SH_W + PG_W) * k
    left = cx - total / 2; top = cy - PG_H * k / 2
    pages_left = left + SH_W * k
    typing = (pages_left + 6 + (980 - PG_X) * k, top + 6 + (700 - PG_Y) * k)
    w = SH_W * k + 12; h = PG_H * k + 12
    rows = []
    for f in range(0, AT4 + 1):
        u = inOut((f - m0) / (m1 - m0))
        z = 1 + (zEnd - 1) * u
        cxx = cam0[0] + (typing[0] + endOff[0] - cam0[0]) * u
        cyy = cam0[1] + (typing[1] + endOff[1] - cam0[1]) * u
        tilt = -4 + 6 * inOut(f / AT4)
        th = math.radians(12 + tilt); P = 1600
        zf = P / (P - w * math.sin(th)); lift = h / 2 * (zf - 1)
        yl = top + 30 - lift
        s = 1 + (z - 1) * 0.8; ty = -0.8 * z * (cyy - 540)
        sy = 540 + (yl - 540) * s + ty
        tpx = 960 + (typing[0] - 960) * z - z * (cxx - 960); tpy = 540 + (typing[1] - 540) * z - z * (cyy - 540)
        pb = 540 + (top + PG_H * k + 12 - 540) * z - z * (cyy - 540)
        rows.append((f, sy, tpx, tpy, pb))
    cross = next((r[0] for r in rows if r[1] < 149), None)
    end = rows[-1]
    return cross, rows[0][1], end
for name, kw in {
    'A cy620 cam560 move0-113': dict(cy=620),
    'B cy620 cam560 move28-113': dict(cy=620, m0=28),
    'C cy640 cam560 move28-113': dict(cy=640, m0=28),
    'D cy620 cam540 move28-113': dict(cy=620, cam0=(990, 540), m0=28),
    'E cy640 cam540 move28-113 z1.12': dict(cy=640, cam0=(990, 540), m0=28, zEnd=1.12),
    'F cy620 cam560 move28-113 z1.12 endOffY-100': dict(cy=620, m0=28, zEnd=1.12, endOff=(-120, -100)),
    'G cy640 cam560 move20-113 z1.12 endOffY-120': dict(cy=640, m0=20, zEnd=1.12, endOff=(-120, -120)),
}.items():
    cross, y0, end = sim(**{k: v for k, v in kw.items() if k != 'cy'}, cy=kw.get('cy', 560))
    print(f'{name:45s} shelfTop@0={y0:6.1f} crosses149@f={cross}  end: typing=({end[2]:.0f},{end[3]:.0f}) pagesBottom={end[4]:.0f}')
