#!/opt/miniconda3/bin/python3
import os, subprocess
import numpy as np
ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
W, H = 1600, 900
p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-i', f'{ROOT}/assets/footage/clip_note_to_todo.mp4', '-vf', f'scale={W}:{H}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
frames = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    frames.append(np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16))
print('frames', len(frames))
mask = np.ones((H, W), bool)
mask[805:890, 655:945] = False  # toast + shadow
# crop regions used: SHELF 210..420 x 89..863, PAGES 420..1392 x 89..863
reg = np.zeros((H, W), bool); reg[89:863, 210:1392] = True
m = mask & reg
ref = frames[85]
for n in [60, 70, 78, 80, 82, 84, 85, 86, 88, 90, 100, 120, 150, 171]:
    if n < len(frames):
        d = np.abs(frames[n] - ref).max(axis=2)
        changed = (d > 12) & m
        ys, xs = np.nonzero(changed)
        box = (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None
        print(n, 'changed px outside toast (crop regions):', int(changed.sum()), 'bbox', box)
