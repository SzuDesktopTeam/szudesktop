#!/opt/miniconda3/bin/python3
"""50 ms RMS (dBFS) around key hits + 100 ms RMS envelope of the ending. Usage: audio_points.py file.wav|mp4 [16x9|9x16]"""
import subprocess, sys
import numpy as np
src = sys.argv[1]; cut = sys.argv[2] if len(sys.argv) > 2 else '16x9'
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'])
x = np.frombuffer(raw, np.float32).reshape(-1, 2)
SR = 48000
def rms(t0, dur):
    a = x[int(t0 * SR):int((t0 + dur) * SR)]
    return 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9)
def peak50(t, span=0.25):
    # max 50 ms RMS within [t-0.02, t+span]
    best = -200; bt = t
    for k in np.arange(t - 0.02, t + span, 0.005):
        v = rms(k, 0.05)
        if v > best: best, bt = v, k
    return best, bt
pts = {'16x9': [('open impact', 0.9375), ('DROP', 20.625), ('1024', 30.0), ('CLIMAX', 30.9375), ('badges', 48.75), ('badge2', 49.21875), ('badge3', 49.6875), ('online', 45.0), ('end icon', 52.5), ('final hit', 58.125)],
       '9x16': [('open impact', 0.9375), ('DROP', 11.25), ('CLIMAX', 15.9375), ('online', 22.5), ('badges', 24.375), ('end icon', 26.25), ('final hit', 28.125)]}[cut]
for name, t in pts:
    v, bt = peak50(t)
    print(f'{name:12s} t={t:7.4f}  max50ms {v:6.1f} dBFS at {bt:.3f}')
dur = len(x) / SR
print('ending 100 ms RMS:')
t = dur - 4.0
while t < dur - 0.05:
    print(f'  {t:6.2f}s {rms(t, 0.1):6.1f}')
    t += 0.2
