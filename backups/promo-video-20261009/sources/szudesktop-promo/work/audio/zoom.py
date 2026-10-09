#!/usr/bin/env python3
"""调试：局部频谱 + 波形（带拍线），检查节拍对齐与段落细节。"""
import sys
import numpy as np
from PIL import Image, ImageDraw
import make_audio as M
from dsp import SR, BEAT, BAR, T, ns


def zoom(path, out, b0, b1):
    x = M.read_wav(path)
    t0, t1 = T(b0), T(b1)
    m = x[:, ns(t0):ns(t1)].mean(axis=0)
    W, H, HW = 1600, 300, 120
    nfft = 2048
    hop = max(1, len(m) // W)
    win = np.hanning(nfft)
    cols = []
    for i in range(W):
        seg = m[i * hop:i * hop + nfft]
        seg = np.pad(seg, (0, nfft - len(seg)))
        cols.append(np.abs(np.fft.rfft(seg * win)))
    S = np.array(cols).T
    f = np.fft.rfftfreq(nfft, 1 / SR)
    fr = np.geomspace(30, 18000, H)
    idx = np.clip(np.searchsorted(f, fr), 0, len(f) - 1)
    D = 20 * np.log10(S[idx] + 1e-9)
    D = np.clip((D - (D.max() - 75)) / 75, 0, 1)[::-1]
    img = Image.new('RGB', (W, H + HW + 20), (12, 12, 16))
    rgb = np.dstack([(255 * np.clip(D * 1.5 - 0.3, 0, 1)), (255 * np.clip(D * 1.5 - 0.8, 0, 1)), (255 * np.clip(D * 1.3, 0, 1) * (1 - np.clip(D * 1.5 - 0.9, 0, 1)))]).astype(np.uint8)
    img.paste(Image.fromarray(rgb), (0, 20))
    d = ImageDraw.Draw(img)
    env = np.abs(m[:W * hop]).reshape(W, hop).max(axis=1)
    for i, v in enumerate(env):
        h = int(v * HW / 1.0)
        d.line([(i, H + 20 + HW // 2 - h // 2), (i, H + 20 + HW // 2 + h // 2)], fill=(120, 220, 140))
    nbeats = int(round((t1 - t0) / BEAT))
    for k in range(nbeats + 1):
        xx = int(k * BEAT / (t1 - t0) * W)
        bar = b0 + k // 4
        d.line([(xx, 20), (xx, H + HW + 20)], fill=(230, 230, 120) if k % 4 == 0 else (80, 80, 80))
        d.text((xx + 2, 4), f'{bar}.{k % 4 + 1}', fill=(255, 255, 255))
    img.save(out)


if __name__ == '__main__':
    zoom(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
