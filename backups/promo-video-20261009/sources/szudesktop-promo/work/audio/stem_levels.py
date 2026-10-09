#!/usr/bin/env python3
"""调试：各分轨在各段落的 K 加权响度（相对值），用来做混音平衡。"""
import math
import sys

import numpy as np

import make_audio as M
from dsp import T, ns


def kl(x):
    y = M.k_filter(x)
    p = (y ** 2).mean(axis=1).sum()
    return -0.691 + 10 * math.log10(p + 1e-20)


def main(which='16x9'):
    mx, tone, sections, shots = (M.arrange_16x9 if which == '16x9' else M.arrange_9x16)()
    st = M.process_stems(mx, tone)
    secs = [(a, b, nm) for a, b, nm in sections]
    keys = [k for k in M.GAIN if k in st]
    print('section'.ljust(22) + ''.join(k[:6].rjust(8) for k in keys) + '   music')
    music = M.build_music(mx, st)
    for a, b, nm in secs:
        i0, i1 = ns(T(a)), ns(T(b + 1))
        row = []
        for k in keys:
            seg = M.GAIN[k] * st[k][:, i0:i1]
            row.append(kl(seg) if np.abs(seg).max() > 1e-6 else float('nan'))
        tot = kl(music[:, i0:i1])
        print(f'{a:>2}-{b:<2} {nm[:16]:<16}' + ''.join(('%8.1f' % v) if v == v else '       -' for v in row) + f'{tot:8.1f}')


if __name__ == '__main__' and len(sys.argv) <= 2:
    main(sys.argv[1] if len(sys.argv) > 1 else '16x9')


def cues(which='16x9'):
    mx, tone, sections, shots = (M.arrange_16x9 if which == '16x9' else M.arrange_9x16)()
    st = M.process_stems(mx, tone)
    sfb = M.build_sfx(mx, st)
    music = M.k_filter(M.build_music(mx, st) * M.sfx_duck(sfb))
    sf = M.k_filter(sfb)
    rows = []
    for c in mx.cues:
        i0 = ns(c['hit_t']); i1 = i0 + ns(0.12)
        a = 10 * math.log10((sf[:, i0:i1] ** 2).mean(axis=1).sum() + 1e-20)
        b = 10 * math.log10((music[:, i0:i1] ** 2).mean(axis=1).sum() + 1e-20)
        rows.append((a - b, c['hit_t'], c['name'], c['note']))
    for d, t, n, note in sorted(rows):
        print(f'{d:6.1f} dB  {t:7.3f}  {n:18s} {note}')


if __name__ == '__main__' and len(sys.argv) > 2:
    cues(sys.argv[1])
