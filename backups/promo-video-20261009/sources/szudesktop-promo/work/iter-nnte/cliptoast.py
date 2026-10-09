#!/opt/miniconda3/bin/python3
"""Per-frame darkness of the toast region in clip_note_to_todo.mp4 (toast border is dark brown)."""
import os, subprocess
import numpy as np
ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
W, H = 1600, 900
p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-i', f'{ROOT}/assets/footage/clip_note_to_todo.mp4', '-vf', f'scale={W}:{H}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
n = 0
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    a = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
    reg = a[814:880, 668:934]
    # toast fill is warm yellow (~#FFF0C8); count yellowish pixels: R>240, B<215
    yel = ((reg[..., 0] > 235) & (reg[..., 2] < 215) & (reg[..., 1] > 220)).mean()
    brown = ((reg[..., 0] < 180) & (reg[..., 0] > 120) & (reg[..., 2] < 80)).mean()
    sel = a[690:710, 700:900].mean()
    if n % 2 == 0 or yel > 0.05:
        print(n, round(float(yel), 3), round(float(brown), 3))
    n += 1
