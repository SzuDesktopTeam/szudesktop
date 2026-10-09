#!/opt/miniconda3/bin/python3
"""Scan every frame of a cut for 'empty stage' pixels: the Film / transition background colours
(C.ink #3F3829 -> encodes ~#3F3629, C.woodDark #492A16 -> ~#482A15). Reports frames whose share of
such pixels exceeds a threshold. Usage: check_empty.py in.mp4 [threshold=0.03]"""
import subprocess, sys, json
import numpy as np
src = sys.argv[1]
thr = float(sys.argv[2]) if len(sys.argv) > 2 else 0.03
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', src]))
W, H = probe['streams'][0]['width'], probe['streams'][0]['height']
w, h = W // 8, H // 8
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={w}:{h}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
targets = np.array([[0x3F, 0x36, 0x29], [0x48, 0x2A, 0x15]], dtype=np.int16)
tol = 7
bad = []
i = 0
worst = (0, -1)
while True:
    buf = p.stdout.read(w * h * 3)
    if len(buf) < w * h * 3:
        break
    a = np.frombuffer(buf, np.uint8).reshape(h, w, 3).astype(np.int16)
    m = np.zeros((h, w), bool)
    for t in targets:
        m |= (np.abs(a - t) <= tol).all(axis=2)
    frac = m.mean()
    if frac > worst[0]:
        worst = (frac, i)
    if frac > thr:
        bad.append((i, round(i / 60, 3), round(float(frac), 3)))
    i += 1
print(f'{src}: {i} frames, worst {worst[0]:.3f} at frame {worst[1]} ({worst[1] / 60:.3f}s); {len(bad)} frames over {thr:.0%}')
for b in bad:
    print('  frame %d  %.3fs  %.1f%%' % (b[0], b[1], b[2] * 100))
