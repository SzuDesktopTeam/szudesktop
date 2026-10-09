#!/opt/miniconda3/bin/python3
import os, subprocess
import numpy as np
ROOT = '/Users/alakazan/workplace/szudesktop-promo'
CD = f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV = {**os.environ, 'DYLD_LIBRARY_PATH': CD}
W, H = 1600, 900
p = subprocess.Popen([f'{CD}/ffmpeg', '-v', 'error', '-i', f'{ROOT}/assets/footage/clip_note_to_todo.mp4', '-vf', f'scale={W}:{H}:flags=area', '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, env=ENV)
fr = []
while True:
    b = p.stdout.read(W * H * 3)
    if len(b) < W * H * 3: break
    fr.append(np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.int16))
ref = fr[60]
toast = (slice(805, 890), slice(655, 945))
sel = (slice(340, 800), slice(690, 1340))
for n in range(70, 92):
    dt = np.abs(fr[n][toast] - ref[toast]).max(axis=2)
    ds = np.abs(fr[n][sel] - fr[86][sel]).max(axis=2)
    print(n, 'toast-region px changed vs f60 (>6):', int((dt > 6).sum()), ' max', int(dt.max()), ' | selection-region px differing from f86 (>12):', int((ds > 12).sum()))
