#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""szuDesktop · 荔枝庭院 宣传片 —— 原创程序合成配乐与音效（主程序）。

/opt/miniconda3/bin/python3 make_audio.py

全部声音由 numpy 逐样本合成（48 kHz 立体声），不使用任何外部音乐、采样、音色库或 SoundFont。
128 BPM、4/4、D 大调；横版 60 s = 32 小节，竖版 30 s = 16 小节。
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time
import wave

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dsp  # noqa: E402
from dsp import (SR, BEAT, BAR, S16, T, ns, fade_edges, frame_of, N, hz, dshift, chord_tones, bass_root, Song,  # noqa: E402
                 fft_filter, tv_filter, convolve, make_ir, pingpong, lp, hp, highshelf, lowshelf, bell, stereo,
                 pan2, place, mk_kick, mk_snare, mk_hat, mk_crash, mk_tom, mk_impact, mk_riser, mk_reverse_cymbal,
                 mk_inhale, mk_stab, lead_tone, bass_tone, arp_tone, pad_chord, ep_tone, bell_tone, merge_tone,
                 horn_note, cached, _nfft)
import sfx as SFX  # noqa: E402

ROOT = '/Users/alakazan/workplace/szudesktop-promo'
OUT = os.path.join(ROOT, 'assets', 'audio')
SFX_DIR = os.path.join(OUT, 'sfx')
WORK = os.path.join(ROOT, 'work', 'audio')
TARGET_LUFS = -14.0
CEILING = -1.5           # 限幅器真峰值上限（dBTP）：AAC 256k 编码后实测仍 ≤ -1 dBTP

# ================================================================ 鼓与固定音色
KICK = cached('kick', lambda: mk_kick(ta=0.17))
KICK_HARD = cached('kick_hard', lambda: mk_kick(185, 42, 0.04, 0.3, 0.55, 0.2, 2.2, 0.6))
CLAP = cached('clap', lambda: mk_snare(0.4, 190, 0.13, clap=True))
SNARE = cached('snare', lambda: mk_snare(0.3, 210, 0.1))
SNARE_ROLL = cached('snare_roll', lambda: mk_snare(0.22, 230, 0.06, bright=1.15, chip=0.3))
HAT = cached('hat', lambda: mk_hat(False))
OHAT = cached('ohat', lambda: mk_hat(True))
CRASH = cached('crash', lambda: mk_crash())
TOM_HI = cached('tom_hi', lambda: mk_tom(150))
TOM_LO = cached('tom_lo', lambda: mk_tom(105))


# ================================================================ 混音台
class Mix:
    def __init__(self, name, dur, song):
        self.name, self.dur, self.song = name, dur, song
        self.n = ns(dur) + ns(4.0)
        self.st = {}
        self.kicks = []
        self.cues = []
        self.marks = []
        self.gates = []
        self.silences = []   # 母带后再强制归零的“真静音”区间
        self.tapestops = []
        self.releases = []   # (t0, t1, dB at t1)：收尾的 dB 线性释放（母带 glue 之后、限幅之前施加）

    def add(self, stem, sig, t, gain=1.0, pan=0.0):
        if stem not in self.st:
            self.st[stem] = np.zeros((2, self.n))
        s = pan2(sig, pan) if sig.ndim == 1 else sig
        place(self.st[stem], s, ns(t), gain)

    def mark(self, t, kind, note=''):
        self.marks.append(dict(t=round(t, 6), kind=kind, note=note))

    def sfx(self, t_hit, name, gain=1.0, pan=0.0, shot='', note=''):
        sig, off = SFX.get(name)
        gain *= next((v for k, v in SFX_TRIM if name.startswith(k)), 1.0)
        self.add('sfx', sig, t_hit - off, gain, pan)
        self.cues.append(dict(hit_t=t_hit, start_t=t_hit - off, name=name, gain=gain, pan=pan, shot=shot, note=note))


# 音效相对电平修正（按名称前缀），让短促的界面音在密集配乐里也听得清
SFX_TRIM = [('key_tick', 2.0), ('hover_tick', 2.0), ('click', 1.7), ('clock_tick', 1.6), ('tile_clack', 1.6),
            ('flip', 1.5), ('dust', 1.6), ('scan_sweep', 1.6), ('diag_neutral', 1.6), ('diag_fail', 1.5),
            ('diag_ok', 1.3), ('coin_tinkle', 1.4), ('success', 1.4), ('connect_success', 1.3), ('pop', 1.3),
            ('whoosh', 1.3), ('build_thud', 1.2), ('sparkle', 1.3), ('menu_open', 1.3), ('notify', 1.3),
            ('select_swish', 1.2), ('paper', 1.2), ('land_soft', 1.3), ('hop', 1.4), ('bloop', 1.2),
            ('signal_on', 1.3), ('page_flip', 1.2), ('water', 1.3), ('chime3', 1.2)]


# ================================================================ 编曲积木（按时间段）
def kick_at(mx, t, v=1.0, hard=False):
    mx.add('kick', KICK_HARD if hard else KICK, t, v)
    mx.kicks.append((t, min(1.0, v)))


def L_drums(mx, t0, t1, kick='four', clap='24', hat='16', ohat=False, kv=1.0, cv=0.8, hv=1.0, ov=0.55):
    for k in range(int(round(t0 / S16)), int(round(t1 / S16))):
        t = k * S16
        pos = k % 16
        sub = pos % 4
        if (kick == 'four' and sub == 0) or (kick == 'half' and pos in (0, 8)) or \
           (kick == '8' and sub in (0, 2)) or (kick == 'one' and pos == 0):
            kick_at(mx, t, kv)
        if (clap == '24' and pos in (4, 12)) or (clap == 'three' and pos == 8):
            mx.add('snare', CLAP, t, cv)
        if ohat and sub == 2:
            mx.add('hat', OHAT, t, hv * ov, 0.15)
            continue
        if hat == '16':
            mx.add('hat', HAT, t, hv * (1.0, 0.42, 0.7, 0.42)[sub], (-0.18, 0.12, -0.1, 0.18)[sub])
        elif hat == '8' and sub in (0, 2):
            mx.add('hat', HAT, t, hv * (0.8 if sub == 0 else 1.0), 0.1)
        elif hat == '8off' and sub == 2:
            mx.add('hat', HAT, t, hv, 0.12)


def L_roll(mx, t0, t1, v0=0.25, v1=1.0, plan=((0.5, 2), (0.75, 1), (1.0, 0.5))):
    """军鼓滚奏：plan = [(进度上限, 步长/16 分音符)]，逐段加密并渐强。"""
    dur = t1 - t0
    t = t0
    while t < t1 - 1e-6:
        u = (t - t0) / dur
        step = next(s for lim, s in plan if u < lim + 1e-9) * S16
        v = v0 + (v1 - v0) * u ** 1.4
        mx.add('snare', SNARE_ROLL, t, v, 0.12 * math.sin(t * 37))
        t += step


def L_bass(mx, t0, t1, mode='oct8', v=1.0):
    if mode == 'long':
        for a, b, ch in mx.song.segments(t0, t1):
            mx.add('bass', bass_tone(bass_root(ch), b - a - 0.03, v), a)
        return
    step = S16 if mode == '16' else 2 * S16
    for k in range(int(round(t0 / step)), int(round(t1 / step))):
        t = k * step
        r = bass_root(mx.song.chord(t))
        if mode == 'oct8':
            m, L, g = (r, step * 0.78, 1.0) if k % 2 == 0 else (r + 12, step * 0.7, 0.82)
        elif mode == 'pulse8':
            m, L, g = r, step * 0.5, (1.0 if k % 2 == 0 else 0.8)
        elif mode == 'pedal8':
            m, L, g = (r if k % 2 == 0 else r + 12), step * 0.62, 1.0
        else:  # '16'
            m, L, g = (r + 12 if k % 4 == 2 else r), step * 0.7, (1.0 if k % 2 == 0 else 0.75)
        mx.add('bass', bass_tone(m, L, v * g), t)


ARP_PAT = [0, 1, 2, 3, 4, 3, 2, 1, 1, 2, 3, 4, 3, 2, 1, 2]


def L_arp(mx, t0, t1, v=1.0, chip=0.0, lo='A4', pat=ARP_PAT):
    for k in range(int(round(t0 / S16)), int(round(t1 / S16))):
        t = k * S16
        tones = chord_tones(mx.song.chord(t), N(lo), N(lo) + 30)[:5]
        m = tones[pat[k % 16] % len(tones)]
        acc = 1.0 if k % 4 == 0 else (0.78 if k % 2 == 0 else 0.66)
        mx.add('arp', arp_tone(m, S16, v * acc, chip), t, pan=(-0.5, 0.5)[k % 2])


def L_pad(mx, t0, t1, v=1.0):
    for a, b, ch in mx.song.segments(t0, t1):
        mx.add('pad', pad_chord(chord_tones(ch, 57, 72), b - a, v), a)


EP_RHY = [(0, 3), (3, 3), (6, 4), (10, 2), (12, 4)]


def L_ep(mx, t0, t1, v=1.0, rhythm=EP_RHY):
    b0 = int(t0 // BAR) + 1
    b1 = int(math.ceil(t1 / BAR - 1e-9))
    for bar in range(b0, b1 + 1):
        for s, L in rhythm:
            t = T(bar) + s * S16
            if t0 - 1e-6 <= t < t1 - 1e-6:
                notes = chord_tones(mx.song.chord(t), 62, 78)[:4]
                for j, m in enumerate(notes):
                    mx.add('ep', ep_tone(m, L * S16 * 0.92, v * (0.9 if s else 1.0)), t, pan=(-0.3, -0.1, 0.1, 0.3)[j])


def L_lead(mx, bar, notes, v=1.0, harm=0.0, octave=0.0):
    for s, L, name in notes:
        t = T(bar) + s * S16
        d = L * S16 * 0.9
        m = N(name)
        mx.add('lead', lead_tone(m, d, v), t)
        mx.add('lead', lead_tone(m, d, v * 0.3, detune=8, ph0=0.25), t, pan=-0.6)
        mx.add('lead', lead_tone(m, d, v * 0.3, detune=-8, ph0=0.6), t, pan=0.6)
        if harm:
            mx.add('harm', lead_tone(harm_note(m, mx.song.chord(t + 0.01)), d, v * harm, duty=0.125, vib=8, bright=0.0), t, pan=0.22)
        if octave:
            mx.add('lead', lead_tone(m + 12, d, v * octave, duty=0.5, vib=10, bright=0.0), t, pan=-0.15)


def harm_note(m, ch):
    """和声声部：取旋律下方 3–9 个半音内最高的和弦音，保证与当拍和弦协和。"""
    c = chord_tones(ch, m - 9, m - 3)
    return c[-1] if c else dshift(m, -2)


def stab_notes(ch, lo='D3'):
    return chord_tones(ch, N(lo), N(lo) + 26)


def hit(mx, t, ch, size=1.0, crash=1.0, stab=1.0, kick=True, stem='fx', note=''):
    mx.add(stem, cached(('impact', size), lambda: mk_impact(size)), t, 0.9)
    if crash:
        mx.add('cym', CRASH, t, crash)
    if stab:
        mx.add(stem, cached(('stab', ch), lambda: mk_stab(stab_notes(ch), 0.6)), t, stab)
    if kick:
        mx.add('kick', KICK_HARD, t, 1.0)
        mx.kicks.append((t, 1.0))
    mx.mark(t, 'impact', note or f'impact + crash + {ch} stab')


def crash(mx, t, v=0.8, note='crash'):
    mx.add('cym', CRASH, t, v)
    mx.mark(t, 'crash', note)


def riser(mx, t0, t1, v=0.8, stem='fx', note='riser', **kw):
    mx.add(stem, mk_riser(t1 - t0, **kw), t0, v)
    mx.mark(t0, 'riser_start', note)
    mx.mark(t1, 'riser_end', note)


def rev_cym(mx, t_end, dur=BEAT, v=0.7):
    mx.add('cym', mk_reverse_cymbal(dur), t_end - dur, v)
    mx.mark(t_end - dur, 'reverse_cymbal', f'反向镲，落点 {t_end:.4f}s')


def gate(mx, t0, t1, note, hard_from=None):
    mx.gates.append((t0, t1))
    mx.silences.append((t0 if hard_from is None else hard_from, t1))
    mx.mark(t0, 'silence_start', note)
    mx.mark(t1, 'silence_end', note)


def merges(mx, times, names, stem='merge'):
    for t, nm in zip(times, names):
        mx.add(stem, cached(('merge', nm), lambda nm=nm: merge_tone(N(nm))), t, 1.0)
        mx.mark(t, 'merge', nm)


def horn(mx, t, v=1.0):
    sig, _ = SFX.get('horn_harvest')
    mx.add('fx', sig, t, v)
    mx.mark(t, 'horn', '收获号角 D5–G5–B5')


def coin_chord(mx, t, v=0.9):
    sig, _ = SFX.get('coin_chord')
    mx.add('fx', sig, t, v)
    mx.mark(t, 'coin_chord', '金币和弦')


def success_chord(mx, t, ch='D', v=1.0):
    mx.add('fx', cached(('stab_bright', ch), lambda: mk_stab(stab_notes(ch, 'D4'), 0.9, 9000, 1600, 0.4, pulse_amt=0.7)), t, v)
    for m in (N('D6'), N('A6')):
        mx.add('fx', bell_tone(m, 2.0, 0.45, ratio=2.0, idx=1.3, tau=0.6), t, v)
    mx.mark(t, 'success_chord', f'「上线」成功和弦（{ch}）')


def sparkle_arp(mx, t, notes=('D6', 'F#6', 'A6', 'B6', 'D7', 'F#7', 'A7', 'D7'), v=0.8):
    for i, nm in enumerate(notes):
        tt = t + i * S16 / 2
        mx.add('merge', arp_tone(N(nm), S16 / 2, v, chip=0.5), tt, pan=(-0.5, 0.5)[i % 2])
    mx.mark(t, 'sparkle_arp', '闪光琶音（32 分音符）')


def climax_hit(mx, t, note):
    """全片最大冲击（v2）：impact + 加重 kick + 九音全乐队和弦 + 低音 + 双镲，整体软削波压低峰均比，
    加在刹车之后（fxpost，不受刹车影响），让它的 50 ms 响度成为全片最高。"""
    n = ns(3.6)
    buf = np.zeros((2, n))

    def put(sig, g, pan=0.0, off=0.0):
        place(buf, pan2(sig, pan) if sig.ndim == 1 else sig, ns(off), g)
    put(mk_impact(1.45, 3.6), 1.0)
    put(KICK_HARD, 1.3)
    put(CRASH, 0.8, -0.35)
    put(CRASH, 0.8, 0.35, 0.012)
    put(mk_stab([N(x) for x in ('D2', 'D3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'F#5', 'A5')], 1.2, 11000, 1100, 0.45), 1.5)
    put(bass_tone(N('D2'), 0.9, 1.0), 0.9)
    pk = np.abs(buf).max()
    drive = 3.4
    y = np.tanh(drive * buf / pk) / np.tanh(drive) * pk
    mx.add('fxpost', y, t, CLIMAX_GAIN)
    mx.kicks.append((t, 1.0))
    mx.mark(t, 'impact_max', note)


def final_hit(mx, t, note):
    """收尾 hit（v2）：短 impact + kick + D 和弦短刺 + 轻镲 + 金币「叮」，之后不留持续音，只剩混响尾巴。"""
    mx.add('fx', cached(('impact_end', 0.8), lambda: mk_impact(0.8, 1.6)), t, 0.8)
    mx.add('kick', KICK_HARD, t, 0.9)
    mx.kicks.append((t, 0.9))
    mx.add('cym', CRASH, t, 0.45)
    mx.add('fx', cached(('stab_end', 'D'), lambda: mk_stab(stab_notes('D', 'D4'), 0.22, 9000, 1400, 0.18)), t, 0.85)
    mx.add('fx', SFX.get('ding')[0], t, 0.9)
    mx.releases.append((t + 0.3, mx.dur - 0.1, -9.0))
    mx.mark(t, 'final_hit', note)


CLIMAX_GAIN = 2.4


# ================================================================ 旋律
HOOK1 = [(8, 2, 'D5'), (10, 2, 'F#5'), (12, 2, 'A5'), (14, 4, 'B5')]
HOOK2 = [(2, 2, 'A5'), (4, 2, 'F#5'), (6, 2, 'E5'), (8, 6, 'D5')]
CH_A = [(0, 3, 'D5'), (3, 3, 'F#5'), (6, 2, 'A5'), (8, 4, 'B5'), (12, 2, 'A5'), (14, 2, 'F#5')]
CH_B = [(0, 3, 'E5'), (3, 3, 'F#5'), (6, 2, 'A5'), (8, 4, 'C#6'), (12, 2, 'B5'), (14, 2, 'A5')]
CH_C = [(0, 3, 'B5'), (3, 3, 'A5'), (6, 2, 'F#5'), (8, 4, 'C#6'), (12, 2, 'A5'), (14, 2, 'F#5')]
CH_D = [(0, 2, 'B5'), (2, 2, 'A5'), (4, 2, 'G5'), (6, 2, 'B5'), (8, 2, 'A5'), (10, 2, 'C#6'), (12, 4, 'E6')]
CH2_27 = [(0, 4, 'B5'), (4, 4, 'D6'), (8, 4, 'F#6'), (12, 2, 'E6'), (14, 2, 'D6')]
CH2_28 = [(0, 3, 'D6'), (3, 3, 'B5'), (6, 2, 'G5'), (8, 4, 'B5'), (12, 2, 'C#6'), (14, 2, 'E6')]
MOTIF_END = [(0, 2, 'D5'), (2, 2, 'F#5'), (4, 2, 'A5'), (6, 6, 'B5'), (12, 4, 'A5')]
CLIMB = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6']
TILE_NAMES = ['嫩芽 4', '小萝卜 8', '草莓 16', '蓝莓 32', '荔枝 64', '萝卜篮 128', '草莓篮 256', '蓝莓篮 512', '荔枝篮 1024']


# ================================================================ 横版 16:9（60 s，32 小节）
CH_H = {
    1: [(1, 'D')], 2: [(1, 'A'), (3, 'G')],
    3: [(1, 'Bm')], 4: [(1, 'G')], 5: [(1, 'D')], 6: [(1, 'A')],
    7: [(1, 'Bm')], 8: [(1, 'G')], 9: [(1, 'D')], 10: [(1, 'A')],
    11: [(1, 'G'), (3, 'A')],
    12: [(1, 'D')], 13: [(1, 'A')], 14: [(1, 'Bm'), (3, 'F#m')], 15: [(1, 'G'), (3, 'A')],
    16: [(1, 'D')], 17: [(1, 'A'), (3, 'D')], 18: [(1, 'D')],
    19: [(1, 'G')], 20: [(1, 'A')], 21: [(1, 'F#m')], 22: [(1, 'Bm')],
    23: [(1, 'G')], 24: [(1, 'A')], 25: [(1, 'D')],
    26: [(1, 'A')], 27: [(1, 'Bm')], 28: [(1, 'G'), (4, 'A')],
    29: [(1, 'D')], 30: [(1, 'G')], 31: [(1, 'A')], 32: [(1, 'D')],
}
SECTIONS_H = [(1, 2, 'Hook 开场钩子'), (3, 6, '主歌 A'), (7, 10, '主歌 B / 积累'), (11, 11, '预冲'),
              (12, 15, '副歌 1（DROP）'), (16, 17, '2048 攀升 → 高潮'), (18, 18, '余波'), (19, 21, '间奏'),
              (22, 22, '故障'), (23, 25, '积累 2'), (26, 28, '副歌 2'), (29, 30, '尾声'), (31, 32, '收尾')]
SHOTS_H = [('S01', 0, 0.938), ('S02', 0.938, 2.813), ('S03', 2.813, 3.75)] + \
    [(f'S{i:02d}', T(i - 1), T(i)) for i in range(4, 17)] + [('S17', T(16), T(18))] + \
    [(f'S{i:02d}', T(i), T(i + 1)) for i in range(18, 29)] + [('S29', T(29), T(31)), ('S30', T(31), 60.0)]
TONE_H = [(0, 9000), (T(3) - 0.01, 9000), (T(3), 3000), (T(8), 3000), (T(10), 4200), (T(11), 16000),
          (T(18, 3), 16000), (T(19) - 0.01, 5000), (T(19), 950), (T(22) - 0.01, 950), (T(22), 520), (T(23), 800),
          (T(24), 1400), (T(25) - 0.01, 9000), (T(25), 16000), (T(31), 16000), (T(32), 5500), (T(33), 2500), (64, 2500)]


def arrange_16x9():
    song = Song(CH_H)
    mx = Mix('16x9', 60.0, song)

    # ---- 1–2 Hook
    L_roll(mx, T(1, 1), T(1, 3), 0.35, 1.0)
    riser(mx, T(1, 1), T(1, 3), 0.75, note='开场 riser（2 拍）')
    mx.sfx(T(1, 2), 'coin', 0.75, shot='S01', note='0.469 s 金币 blip')
    mx.sfx(T(1, 3), 'fall_whistle', 0.55, shot='S01', note='荔枝 0.70 s 起下落，0.9375 s 落地')
    hit(mx, T(1, 3), 'D', 1.0, note='开场 IMPACT：荔枝落地、荔宝炸开')
    mx.sfx(T(1, 3), 'sparkle_burst', 0.6, shot='S02', note='40 颗素材粒子四散')
    L_drums(mx, T(1, 3) + S16, T(3), 'four', '24', '16', kv=1.0, cv=0.85, hv=1.0)
    mx.add('snare', TOM_HI, T(2, 3), 0.85, -0.3)
    mx.add('snare', TOM_LO, T(2, 4), 0.9, 0.3)
    mx.mark(T(2, 3), 'tom', '栗栗落位'); mx.mark(T(2, 4), 'tom', '小白落位')
    mx.sfx(T(2, 3), 'dust', 0.6, -0.5, 'S03', '栗栗落地像素尘')
    mx.sfx(T(2, 4), 'dust', 0.6, 0.5, 'S03', '小白落地像素尘')
    L_bass(mx, T(1, 3), T(3), 'oct8', 1.0)
    L_pad(mx, T(1, 3), T(3), 1.0)
    L_arp(mx, T(1, 3), T(3), 0.65, chip=0.3)
    L_lead(mx, 1, HOOK1, 1.0, harm=0.5)
    L_lead(mx, 2, HOOK2, 1.0, harm=0.5)
    mx.sfx(3.69, 'whoosh_whip', 0.9, shot='S03→S04', note='拍 8 末向右甩镜')

    # ---- 3–6 主歌 A（给桌面伙伴音效留空间）
    L_drums(mx, T(3), T(7), 'four', '24', '8off', kv=0.66, cv=0.45, hv=0.65)
    L_bass(mx, T(3), T(7), 'oct8', 0.62)
    L_pad(mx, T(3), T(7), 0.75)
    L_arp(mx, T(3), T(7), 0.55)
    crash(mx, T(3), 0.35, '主歌 A 起（轻镲）')
    mx.sfx(T(3) + 0.15, 'whoosh_soft', 0.7, shot='S04', note='主窗口 rotateY 飞入')
    mx.sfx(T(3, 2.75), 'hop', 0.6, 0.3, 'S04', '荔宝跳出窗口')
    mx.sfx(T(3, 3), 'pop', 0.8, 0.3, 'S04', '拍 3 气泡弹出')
    mx.sfx(T(4, 1), 'click', 0.6, shot='S05', note='光标按住荔宝')
    mx.sfx(T(4, 1) + 0.47, 'whoosh_drag', 0.75, shot='S05', note='拖动弧线（拍 1–2）')
    mx.sfx(T(4, 3), 'land_soft', 0.7, 0.5, 'S05', '落在任务栏上方')
    for i, b in enumerate((3.0, 3.25, 3.5, 3.75, 4.0)):
        mx.sfx(T(4, b), f'scroll_tick_{i + 1}', 0.7, 0.4, 'S05', f'滚轮第 {i + 1} 档 → {110 + 10 * i}%')
    mx.sfx(T(5, 1), 'menu_open', 0.8, shot='S06', note='点击荔宝弹出伙伴菜单')
    mx.sfx(T(5, 2), 'hover_tick', 0.8, shot='S06', note='光标移到「摸摸头」')
    mx.sfx(T(5, 3), 'click', 0.7, shot='S06', note='点「摸摸头」')
    mx.sfx(T(5, 3), 'pat_chime', 0.75, shot='S06', note='摸头三音 + 爱心')
    mx.sfx(T(5, 4), 'pop', 0.65, 0.3, 'S06', '气泡「嘿嘿，叶子都被你摸歪啦。」')
    mx.sfx(T(6, 1), 'click', 0.55, shot='S07', note='打开「切换伙伴 ▸」')
    for b, nm, who in ((1, 'D5', '荔宝'), (2, 'Fs5', '栗栗'), (3, 'A5', '小白')):
        mx.sfx(T(6, b), f'bloop_{nm}', 0.75, shot='S07', note=f'名字点亮 / 溶解成{who}')
    mx.sfx(T(6, 2.5), 'pop', 0.45, -0.3, 'S07', '栗栗气泡')
    mx.sfx(T(6, 3.5), 'pop', 0.45, 0.3, 'S07', '小白气泡')
    mx.sfx(T(7), 'whoosh_inhale', 0.8, shot='S07→S08', note='拍 4 冲向主窗口，穿屏')

    # ---- 7–10 主歌 B / 积累
    L_drums(mx, T(7), T(9), 'four', '24', '16', kv=0.8, cv=0.58, hv=0.75)
    L_drums(mx, T(9), T(11), 'four', '24', '16', ohat=True, kv=0.92, cv=0.7, hv=0.9)
    L_bass(mx, T(7), T(11), 'oct8', 0.85)
    L_pad(mx, T(7), T(11), 0.85)
    L_arp(mx, T(7), T(9), 0.6)
    L_arp(mx, T(9), T(11), 0.62, chip=0.18)
    crash(mx, T(7), 0.45, '主歌 B 起')
    for k in range(7):
        mx.sfx(T(7) + k * S16, f'key_tick_{k % 4 + 1}', 0.7, 0.15, 'S08', f'键入「复习高数第三章」第 {k + 1} 字')
    mx.sfx(T(7, 4), 'click', 0.75, shot='S08', note='点「添加」')
    mx.add('fx', cached(('stab_small', 'Bm'), lambda: mk_stab(stab_notes('Bm', 'B3'), 0.25, 6000, 1200, 0.12)), T(7, 4), 0.5)
    mx.mark(T(7, 4), 'stab', '「添加」小和弦')
    mx.sfx(T(8, 1), 'click', 0.75, shot='S09', note='点「25 分钟」')
    ticks = [T(8, 2) + k * S16 for k in range(8)] + [T(8, 4) + k * S16 / 2 for k in range(8)]
    for i, t in enumerate(ticks):
        mx.sfx(t, f'clock_tick_{min(3, i // 4) + 1}', 0.42 + 0.025 * i, 0.2 * (-1) ** i, 'S09', '延时时钟 tick（16 分→32 分）')
    coin_chord(mx, T(9, 1), 0.9)
    crash(mx, T(9, 1), 0.5, '金币和弦')
    mx.sfx(T(9, 1), 'click', 0.7, shot='S10', note='点「完成并领取奖励」')
    mx.sfx(T(9, 1), 'coin', 0.9, shot='S10', note='+25 荔枝币')
    for k in range(11):
        mx.sfx(T(9, 1) + (k + 1) * S16, f'coin_tinkle_{k % 6 + 1}', 0.45, 0.6 * math.sin(k * 1.7), 'S10', '金币飞进计数牌')
    mx.sfx(T(9, 4) + 0.15, 'whoosh_down', 0.75, shot='S10→S11', note='金币下倾，镜头下摇到农田')
    mx.sfx(T(10, 2), 'water', 0.75, 0.35, 'S11', '荔宝浇水')
    L_lead(mx, 10, [(8, 2, 'A5'), (10, 2, 'B5'), (12, 2, 'C#6'), (14, 2, 'E6')], 0.55)
    mx.sfx(T(10, 4), 'notify', 0.55, shot='S11', note='「已浇水」标签闪一下')

    # ---- 11 预冲
    horn(mx, T(11, 1), 0.9)
    crash(mx, T(11, 1), 0.4, '收获')
    L_drums(mx, T(11, 1), T(11, 3), 'four', '24', '16', kv=0.92, cv=0.7, hv=0.85)
    L_bass(mx, T(11, 1), T(11, 4.5), 'pulse8', 0.85)
    L_pad(mx, T(11, 1), T(11, 4.5), 0.85)
    L_arp(mx, T(11, 1), T(11, 3), 0.55, chip=0.18)
    L_roll(mx, T(11, 3), T(11, 4.5), 0.3, 1.0, plan=((0.34, 2), (0.67, 1), (1.0, 0.5)))
    riser(mx, T(11, 3), T(11, 4.5), 0.8, note='DROP 前 riser')
    gate(mx, T(11, 4.5), T(12), 'DROP 前最后一个 8 分音符全静音（画面全黑）')
    mx.sfx(T(11, 1), 'click', 0.6, shot='S12', note='点成熟萝卜田')
    mx.sfx(T(11, 1), 'harvest_pop', 0.9, shot='S12', note='收获入仓 · 小萝卜 +2')
    mx.sfx(T(11, 1.5) + 0.25, 'whoosh_zoom', 0.8, shot='S12', note='两颗小萝卜冲向镜头')
    mx.sfx(T(11, 2), 'pop', 0.6, 0.35, 'S12', '荔宝气泡')

    # ---- 12–15 副歌 1（DROP）
    hit(mx, T(12), 'D', 1.0, note='DROP：荔湖晴昼')
    L_drums(mx, T(12), T(15, 3), 'four', '24', '16', ohat=True, kv=1.0, cv=0.88, hv=1.0)
    L_drums(mx, T(15, 3), T(16), 'four', 'none', '16', kv=1.0, hv=1.0)
    L_roll(mx, T(15, 3), T(16), 0.25, 0.8, plan=((1.0, 1),))
    L_bass(mx, T(12), T(16), 'oct8', 1.0)
    L_pad(mx, T(12), T(16), 1.0)
    L_arp(mx, T(12), T(16), 0.55, chip=0.3)
    for b, mel in zip((12, 13, 14, 15), (CH_A, CH_B, CH_C, CH_D)):
        L_lead(mx, b, mel, 1.0, harm=0.45)
    crash(mx, T(13), 0.85, '雨后书屋'); crash(mx, T(13, 3), 0.6, '拍 3 白闪')
    mx.add('fx', cached(('stab', 'A'), lambda: mk_stab(stab_notes('A'), 0.6)), T(13, 3), 0.55)
    crash(mx, T(14), 0.85, '蓝调晚庭'); crash(mx, T(15), 0.85, '庭院建设')
    riser(mx, T(15, 4), T(17), 0.75, note='进入 2048 攀升', pitch=(N('A3'), N('A5')))
    mx.sfx(T(12, 4.5) + 0.06, 'whoosh_whip', 0.75, shot='S13→S14', note='小节末甩镜')
    for i, b in enumerate((3.0, 3.25, 3.5, 3.75)):
        mx.sfx(T(14, b), f'flip_{i + 1}', 0.7, (-0.5, 0.5, -0.5, 0.5)[i], 'S15', f'四宫格第 {i + 1} 格翻出（v2：16 分音符）')
    mx.sfx(T(15, 2), 'click', 0.7, shot='S16', note='v2：拍 2 点「布置湖畔野餐角 →」（拍 1 先推近就绪状态）')
    mx.sfx(T(15, 2) + 0.07, 'success', 0.6, shot='S16', note='真实提示「湖畔野餐角建好啦」弹出')
    for k in range(8):
        mx.sfx(T(15, 3) + k * S16, f'build_thud_{k + 1}', 0.75, 0.3 * (-1) ** k, 'S16', '野餐角逐行搭建')

    # ---- 16–17 2048 攀升 → 高潮
    mtimes = [T(16) + k * 2 * S16 for k in range(8)] + [T(17, 1)]
    merges(mx, mtimes, CLIMB)
    for i, t in enumerate(mtimes):
        mx.sfx(t, 'tile_clack', 0.6, 0.2 * (-1) ** i, 'S17', f'合成 {TILE_NAMES[i]}')
    L_drums(mx, T(16), T(17), '8', '24', '16', kv=0.95, cv=0.7, hv=1.0)
    L_roll(mx, T(16), T(17), 0.15, 0.85, plan=((0.75, 1), (1.0, 0.5)))
    L_bass(mx, T(16), T(17), 'pedal8', 1.0)
    L_pad(mx, T(16), T(17, 3), 0.95)
    L_arp(mx, T(16), T(17, 2), 0.35, chip=0.2)
    hit(mx, T(17, 1), 'A', 0.7, crash=0.8, stab=0.8, note='合出荔枝篮 1024')
    L_drums(mx, T(17, 1) + S16, T(17, 3), 'four', 'none', '16', kv=0.9, hv=0.9)
    L_bass(mx, T(17, 1), T(17, 3), 'oct8', 1.0)
    mx.tapestops.append((T(17, 2), BEAT))
    mx.mark(T(17, 2), 'tape_stop', '全曲刹车（1 拍）+ 吸气 riser，两枚 1024 发光')
    mx.add('fxpost', mk_inhale(BEAT), T(17, 2), 0.75)
    # 拍 3：全片最大冲击（加在刹车之后，不受刹车影响）
    climax_hit(mx, T(17, 3), '全片最大冲击：荔宝丰收礼 2048（boom + 全乐队和弦 + 双镲，软削波）')
    mx.sfx(T(17, 3), 'sparkle_burst', 0.8, shot='S17', note='全素材彩纸 360° 爆发')
    L_drums(mx, T(17, 3) + S16, T(18), 'four', 'none', '16', kv=1.0, hv=0.95)
    mx.add('snare', CLAP, T(17, 4), 0.9)
    L_bass(mx, T(17, 3), T(18), 'oct8', 1.0)
    L_lead(mx, 17, [(8, 8, 'D6')], 0.8, octave=0.35)
    sparkle_arp(mx, T(17, 4), v=0.8)

    # ---- 18 余波
    L_drums(mx, T(18), T(19), 'half', 'three', '8', kv=0.85, cv=0.7, hv=0.6)
    L_bass(mx, T(18), T(19), 'long', 0.85)
    L_pad(mx, T(18), T(19), 0.9)
    L_arp(mx, T(18), T(19), 0.4)
    mx.sfx(T(18, 3), 'click', 0.7, shot='S18', note='点「领取种子与小礼」')
    mx.sfx(T(18, 3), 'coin_chord', 0.6, shot='S18', note='备种礼：金币和弦')
    mx.sfx(T(18, 3.5) + 0.2, 'whoosh_up', 0.6, shot='S18', note='种子袋飞向农田')

    # ---- 19–21 间奏
    L_drums(mx, T(19), T(22), 'none', 'none', '8off', hv=0.4)
    L_bass(mx, T(19), T(22), 'long', 0.5)
    L_pad(mx, T(19), T(22), 0.9)
    L_ep(mx, T(19), T(22), 0.8)
    L_arp(mx, T(20), T(22), 0.3)
    for k in range(16):
        mx.sfx(T(19) + k * S16, f'key_tick_{k % 4 + 1}', 0.5, 0.15, 'S19', 'Markdown 键入')
    mx.sfx(T(20, 1), 'page_flip', 0.8, shot='S20', note='切到「阅读」')
    mx.sfx(T(20, 2), 'pop', 0.55, shot='S20', note='展开「本页大纲」')
    mx.sfx(T(20, 3), 'click', 0.65, shot='S20', note='点「还没弄懂」')
    mx.sfx(T(20, 3), 'chime3_A', 0.6, shot='S20', note='三音 chime')
    mx.sfx(T(20, 3.5) + 0.15, 'whoosh_down', 0.45, shot='S20', note='正文跳到该标题')
    mx.sfx(T(21, 1), 'select_swish', 0.8, shot='S21', note='选中「课后做完习题 3.2」')
    mx.sfx(T(21, 2), 'click', 0.7, shot='S21', note='点「加入学习待办」')
    mx.sfx(T(21, 2), 'notify', 0.5, shot='S21', note='加入成功提示')
    mx.sfx(T(21, 2.25) + 0.22, 'paper_whoosh', 0.8, shot='S21', note='纸条飞出')
    mx.sfx(T(21, 3), 'paper_land', 0.8, 0.4, 'S21', '落进「我的小事」')
    riser(mx, T(21, 4), T(22), 0.55, note='小 riser，被「断电」截断', pitch=(N('F#3'), N('F#4')))
    mx.sfx(T(22), 'glitch', 0.8, shot='S21→S22', note='故障转场（RGB 分离 + 2 帧黑），落点 = 小节线')

    # ---- 22 故障
    mx.add('fxpost', SFX.get('power_down')[0], T(22), 0.9)
    mx.mark(T(22), 'power_down', '断电：bitcrush 下滑')
    gate(mx, T(22), T(22, 2), '断电下滑 0.26 s 后静音到拍 2（共 1 拍）', hard_from=T(22) + 0.26)
    L_bass(mx, T(22, 2), T(23), 'pulse8', 0.85)
    L_drums(mx, T(22, 2), T(23), 'none', 'none', '8', hv=0.45)
    L_pad(mx, T(22, 2), T(23), 0.6)
    for i, b in enumerate((2.0, 2.25, 2.5, 2.75)):
        mx.sfx(T(22, b), f'signal_off_{i + 1}', 0.6, 0.0, 'S22', f'信号柱第 {4 - i} 根熄灭')

    # ---- 23–25 积累 2
    L_drums(mx, T(23), T(24), 'four', 'none', '16', kv=0.72, hv=0.55)
    L_drums(mx, T(24), T(24, 3), 'four', '24', '16', kv=0.85, cv=0.6, hv=0.75)
    L_drums(mx, T(24, 3), T(25), 'four', 'none', '16', kv=0.9, hv=0.85)
    L_roll(mx, T(24, 3), T(25), 0.25, 0.95, plan=((0.5, 1), (1.0, 0.5)))
    L_bass(mx, T(23), T(25), 'pulse8', 0.9)
    L_pad(mx, T(23), T(25), 0.8)
    L_arp(mx, T(23), T(25), 0.45)
    riser(mx, T(24), T(25), 0.7, note='登录前 riser', pitch=(N('A3'), N('A5')))
    mx.sfx(T(23, 1), 'click', 0.65, shot='S23', note='点「运行网络诊断」')
    for b, nm, lab in ((1, 'diag_ok', '区域判定 ✓'), (2, 'diag_fail', '互联网 ✗'), (3, 'diag_ok', '教学区门户 ✓'), (4, 'diag_neutral', '宿舍区门户 ·')):
        mx.sfx(T(23, b), nm, 0.8, shot='S23', note=lab)
    mx.sfx(T(23, 4.5) + 0.12, 'whoosh_soft', 0.55, shot='S23', note='结论条滑出')
    mx.sfx(T(24, 1), 'menu_open', 0.7, shot='S24', note='「所在区域」下拉展开')
    mx.sfx(T(24, 2), 'scan_sweep', 0.7, shot='S24', note='像素扫描线停在「教学区」')
    for k in range(8):
        mx.sfx(T(24, 3) + k * S16 / 2, f'key_tick_{k % 4 + 1}', 0.6, 0.15, 'S24', '键入演示卡号与圆点密码')
    mx.sfx(T(24, 4), 'click', 0.8, shot='S24', note='点「登录校园网」')
    success_chord(mx, T(25), 'D', 0.9)
    crash(mx, T(25), 0.8, '「上线」，鼓组回归')
    mx.sfx(T(25), 'connect_success', 0.7, shot='S25', note='当前网络出口已在线')
    for i in range(4):
        mx.sfx(T(25) + (i + 1) * S16, f'signal_on_{i + 1}', 0.55, 0.0, 'S25', f'信号柱第 {i + 1} 根亮起')
    mx.sfx(T(25, 3) + 0.16, 'whoosh_whip', 0.7, shot='S25', note='甩镜到学院公告 / 校历')
    kick_at(mx, T(25), 1.0)
    L_drums(mx, T(25) + S16, T(26), 'four', '24', '16', ohat=True, kv=1.0, cv=0.85, hv=1.0)
    L_bass(mx, T(25), T(26), 'oct8', 1.0)
    L_pad(mx, T(25), T(26), 1.0)
    L_arp(mx, T(25), T(26), 0.55, chip=0.3)

    # ---- 26–28 副歌 2
    crash(mx, T(26), 0.9, '副歌 2：双平台')
    mx.sfx(T(26), 'whoosh_pair', 0.75, shot='S26', note='两扇窗在拍 1 交汇')
    mx.sfx(T(26, 3), 'sparkle', 0.6, shot='S26', note='平台名亮起')
    L_drums(mx, T(26), T(29), 'four', '24', '16', ohat=True, kv=1.0, cv=0.88, hv=1.0)
    L_bass(mx, T(26), T(29), 'oct8', 1.0)
    L_pad(mx, T(26), T(29), 1.0)
    L_arp(mx, T(26), T(29), 0.55, chip=0.3)
    L_lead(mx, 26, CH_B, 1.0, harm=0.45)
    L_lead(mx, 27, CH2_27, 1.0, harm=0.45)
    L_lead(mx, 28, CH2_28, 1.0, harm=0.45)
    for b, lab in ((1, '数据只存本机'), (2, '没有遥测'), (3, '断网也能用')):
        hit(mx, T(27, b), 'Bm', 0.55, crash=0.7, stab=0.45, note=f'徽章砸下：{lab}')
        mx.sfx(T(27, b), 'badge_slam', 0.75, (-0.4, 0.0, 0.4)[b - 1], 'S27', lab)
    mx.sfx(T(28) + 0.11, 'whoosh_pullback', 0.75, shot='S28', note='从荔宝一帧急速后拉出动作墙')
    mx.add('fx', cached(('stab', 'G'), lambda: mk_stab(stab_notes('G'), 0.6)), T(28, 3), 0.6)
    mx.mark(T(28, 3), 'stab', '「开源 · MIT」大字')
    rev_cym(mx, T(29), BEAT * 1.0, 0.8)

    # ---- 29–30 尾声
    hit(mx, T(29), 'D', 1.1, note='结尾冲击：应用图标砸出')
    mx.sfx(T(29), 'sparkle_burst', 0.6, shot='S29', note='logo 弹出')
    L_drums(mx, T(29) + S16, T(30), 'four', '24', '8', kv=0.95, cv=0.75, hv=0.8)
    L_drums(mx, T(30), T(31), 'four', '24', '8off', kv=0.75, cv=0.55, hv=0.6)
    L_bass(mx, T(29), T(30), 'oct8', 0.95)
    L_bass(mx, T(30), T(31), 'long', 0.8)
    L_pad(mx, T(29), T(31), 1.0)
    L_arp(mx, T(29), T(30), 0.5, chip=0.25)
    L_ep(mx, T(30), T(31), 0.7, [(0, 16)])
    L_lead(mx, 29, MOTIF_END, 1.0, harm=0.45, octave=0.3)
    L_lead(mx, 30, [(0, 8, 'B5'), (8, 8, 'D6')], 0.75)

    # ---- 31–32 收尾（v2）：撤掉鼓组；第 32 小节拍 1 收尾 hit + 金币「叮」，之后只剩混响尾巴，59.9 s 前 ≤ -40 dBFS
    L_bass(mx, T(31), T(32), 'long', 0.6)
    L_pad(mx, T(31), T(32), 0.78)
    L_arp(mx, T(31), T(32), 0.34, pat=[4, 3, 2, 1, 3, 2, 1, 0, 2, 1, 0, 1, 2, 3, 2, 1])
    L_lead(mx, 31, [(0, 6, 'C#6'), (6, 2, 'B5'), (8, 8, 'A5')], 0.5)
    rev_cym(mx, T(32), BEAT, 0.5)
    mx.sfx(T(31) + 0.2, 'whoosh_up', 0.5, shot='S30', note='下载牌从下方滑入')
    final_hit(mx, T(32), '第 32 小节拍 1 收尾 hit + 金币「叮」，之后只剩混响尾巴')
    mx.sfx(T(32, 1.5), 'pop', 0.55, 0.3, 'S30', '荔宝 greet 气泡')
    return mx, TONE_H, SECTIONS_H, SHOTS_H


# ================================================================ 竖版 9:16（30 s，16 小节）
CH_V = {
    1: [(1, 'D')], 2: [(1, 'A'), (3, 'G')],
    3: [(1, 'Bm')], 4: [(1, 'G')], 5: [(1, 'D')], 6: [(1, 'G'), (3, 'A')],
    7: [(1, 'D')], 8: [(1, 'D')], 9: [(1, 'A'), (3, 'D')], 10: [(1, 'G')],
    11: [(1, 'A')], 12: [(1, 'Bm'), (3, 'A')], 13: [(1, 'D'), (3, 'A')],
    14: [(1, 'G'), (4, 'A')], 15: [(1, 'D'), (3, 'G')], 16: [(1, 'D')],
}
# v2：V11 加长到 2 小节（12–13），V12 = 第 14 小节，V13 = 第 15–16 小节（3.75 s）
SECTIONS_V = [(1, 2, 'Hook 开场钩子'), (3, 4, '主歌'), (5, 6, '积累'), (7, 7, 'DROP'), (8, 9, '2048 攀升 → 高潮'),
              (10, 10, '余波 / 建设'), (11, 14, '副歌延续'), (15, 16, '尾声')]
SHOTS_V = [('V01', 0, 0.938), ('V02', 0.938, 3.75)] + [(f'V{i:02d}', T(i), T(i + 1)) for i in range(3, 8)] + \
    [('V08', T(8), T(10)), ('V09', T(10), T(11)), ('V10', T(11), T(12)), ('V11', T(12), T(14)),
     ('V12', T(14), T(15)), ('V13', T(15), 30.0)]
TONE_V = [(0, 9000), (T(3) - 0.01, 9000), (T(3), 3000), (T(5), 3200), (T(6), 4200), (T(7), 16000),
          (T(15), 16000), (T(16), 5500), (T(17), 2500), (34, 2500)]


def arrange_9x16():
    song = Song(CH_V)
    mx = Mix('9x16', 30.0, song)

    # ---- 1–2 Hook（同横版）
    L_roll(mx, T(1, 1), T(1, 3), 0.35, 1.0)
    riser(mx, T(1, 1), T(1, 3), 0.75, note='开场 riser（2 拍）')
    mx.sfx(T(1, 2), 'coin', 0.75, shot='V01', note='0.469 s 金币 blip')
    mx.sfx(T(1, 3), 'fall_whistle', 0.55, shot='V01', note='荔枝下落，0.9375 s 落地')
    hit(mx, T(1, 3), 'D', 1.0, note='开场 IMPACT')
    mx.sfx(T(1, 3), 'sparkle_burst', 0.6, shot='V02', note='素材粒子爆发')
    L_drums(mx, T(1, 3) + S16, T(3), 'four', '24', '16', kv=1.0, cv=0.85, hv=1.0)
    mx.add('snare', TOM_HI, T(2, 3), 0.85, -0.3)
    mx.add('snare', TOM_LO, T(2, 4), 0.9, 0.3)
    mx.mark(T(2, 3), 'tom', '栗栗滑入'); mx.mark(T(2, 4), 'tom', '小白滑入')
    mx.sfx(T(2, 3), 'dust', 0.6, -0.5, 'V02', '栗栗落位')
    mx.sfx(T(2, 4), 'dust', 0.6, 0.5, 'V02', '小白落位')
    L_bass(mx, T(1, 3), T(3), 'oct8', 1.0)
    L_pad(mx, T(1, 3), T(3), 1.0)
    L_arp(mx, T(1, 3), T(3), 0.65, chip=0.3)
    L_lead(mx, 1, HOOK1, 1.0, harm=0.5)
    L_lead(mx, 2, HOOK2, 1.0, harm=0.5)
    mx.sfx(3.69, 'whoosh_whip', 0.9, shot='V02→V03', note='甩镜进桌面')

    # ---- 3–4 主歌
    L_drums(mx, T(3), T(5), 'four', '24', '8off', kv=0.68, cv=0.47, hv=0.65)
    L_bass(mx, T(3), T(5), 'oct8', 0.65)
    L_pad(mx, T(3), T(5), 0.75)
    L_arp(mx, T(3), T(5), 0.55)
    crash(mx, T(3), 0.35, '主歌起（轻镲）')
    mx.sfx(T(3) + 0.15, 'whoosh_soft', 0.7, shot='V03', note='主窗口飞入')
    mx.sfx(T(3, 2), 'pop', 0.8, 0.3, 'V03', '荔宝坐在窗口边沿冒气泡')
    mx.sfx(T(3, 3), 'click', 0.55, shot='V03', note='光标按住荔宝')
    mx.sfx(T(3, 3) + 0.2, 'whoosh_drag', 0.6, shot='V03', note='拖到下方')
    for i, b in enumerate((3.75, 4.0, 4.25, 4.5, 4.75)):
        mx.sfx(T(3, b), f'scroll_tick_{i + 1}', 0.7, 0.4, 'V03', f'滚轮第 {i + 1} 档 → {110 + 10 * i}%')
    mx.sfx(T(4, 1), 'click', 0.7, shot='V04', note='菜单点「摸摸头」')
    mx.sfx(T(4, 1), 'pat_chime', 0.75, shot='V04', note='摸头三音 + 爱心')
    for b, nm, who in ((2, 'D5', '栗栗'), (3, 'Fs5', '小白'), (4, 'A5', '荔宝')):
        mx.sfx(T(4, b), f'bloop_{nm}', 0.75, shot='V04', note=f'像素溶解成{who}')

    # ---- 5–6 积累
    L_drums(mx, T(5), T(6, 3), 'four', '24', '16', ohat=True, kv=0.92, cv=0.7, hv=0.9)
    L_bass(mx, T(5), T(6, 4.5), 'oct8', 0.88)
    L_pad(mx, T(5), T(6, 4.5), 0.85)
    L_arp(mx, T(5), T(6, 3), 0.6, chip=0.18)
    crash(mx, T(5), 0.45, '积累起')
    mx.sfx(T(5, 1), 'click', 0.7, shot='V05', note='点「25 分钟」')
    ticks = [T(5, 1.25) + k * S16 for k in range(3)] + [T(5, 2) + k * S16 / 2 for k in range(8)]
    for i, t in enumerate(ticks):
        mx.sfx(t, f'clock_tick_{min(3, i // 3) + 1}', 0.42 + 0.03 * i, 0.2 * (-1) ** i, 'V05', '25:00→00:00 延时 tick')
    coin_chord(mx, T(5, 3), 0.9)
    crash(mx, T(5, 3), 0.5, '金币和弦')
    mx.sfx(T(5, 3), 'click', 0.7, shot='V05', note='点「完成并领取奖励」')
    mx.sfx(T(5, 3), 'coin', 0.9, shot='V05', note='+25 荔枝币')
    for k in range(7):
        mx.sfx(T(5, 3) + (k + 1) * S16, f'coin_tinkle_{k % 6 + 1}', 0.45, 0.6 * math.sin(k * 1.7), 'V05', '金币飞向计数牌')
    horn(mx, T(6, 1), 0.9)
    crash(mx, T(6, 1), 0.4, '收获')
    mx.sfx(T(6, 1), 'click', 0.6, shot='V06', note='点成熟萝卜田')
    mx.sfx(T(6, 1), 'harvest_pop', 0.9, shot='V06', note='收获')
    mx.sfx(T(6, 1.5) + 0.25, 'whoosh_zoom', 0.8, shot='V06', note='萝卜冲镜头')
    mx.sfx(T(6, 2), 'pop', 0.6, 0.35, 'V06', '荔宝气泡')
    L_roll(mx, T(6, 3), T(6, 4.5), 0.3, 1.0, plan=((0.34, 2), (0.67, 1), (1.0, 0.5)))
    riser(mx, T(6, 3), T(6, 4.5), 0.8, note='DROP 前 riser')
    gate(mx, T(6, 4.5), T(7), 'DROP 前最后一个 8 分音符全静音')

    # ---- 7 DROP
    hit(mx, T(7), 'D', 1.0, note='DROP：荔湖晴昼')
    L_drums(mx, T(7), T(8), 'four', '24', '16', ohat=True, kv=1.0, cv=0.88, hv=1.0)
    L_bass(mx, T(7), T(8), 'oct8', 1.0)
    L_pad(mx, T(7), T(8), 1.0)
    L_arp(mx, T(7), T(8), 0.55, chip=0.3)
    L_lead(mx, 7, CH_A, 1.0, harm=0.45)
    crash(mx, T(7, 3), 0.8, '雨后书屋')
    crash(mx, T(7, 4), 0.6, '蓝调晚庭')
    mx.sfx(T(7, 3), 'whoosh_whip', 0.6, shot='V07', note='切雨后书屋')
    mx.sfx(T(7, 4), 'whoosh_whip', 0.55, shot='V07', note='切蓝调晚庭')

    # ---- 8–9 2048
    mtimes = [T(8) + k * 2 * S16 for k in range(8)] + [T(9, 1)]
    merges(mx, mtimes, CLIMB)
    for i, t in enumerate(mtimes):
        mx.sfx(t, 'tile_clack', 0.6, 0.2 * (-1) ** i, 'V08', f'合成 {TILE_NAMES[i]}')
    L_drums(mx, T(8), T(9), '8', '24', '16', kv=0.95, cv=0.7, hv=1.0)
    L_roll(mx, T(8), T(9), 0.15, 0.85, plan=((0.75, 1), (1.0, 0.5)))
    riser(mx, T(8), T(9), 0.7, note='2048 攀升 riser', pitch=(N('A3'), N('A5')))
    L_bass(mx, T(8), T(9), 'pedal8', 1.0)
    L_pad(mx, T(8), T(9, 3), 0.95)
    L_arp(mx, T(8), T(9, 2), 0.35, chip=0.2)
    hit(mx, T(9, 1), 'A', 0.7, crash=0.8, stab=0.8, note='合出荔枝篮 1024')
    L_drums(mx, T(9, 1) + S16, T(9, 3), 'four', 'none', '16', kv=0.9, hv=0.9)
    L_bass(mx, T(9, 1), T(9, 3), 'oct8', 1.0)
    mx.tapestops.append((T(9, 2), BEAT))
    mx.mark(T(9, 2), 'tape_stop', '全曲刹车 + 吸气 riser')
    mx.add('fxpost', mk_inhale(BEAT), T(9, 2), 0.75)
    climax_hit(mx, T(9, 3), '全片最大冲击：荔宝丰收礼占满全屏（软削波）')
    mx.sfx(T(9, 3), 'sparkle_burst', 0.8, shot='V08', note='彩纸爆发')
    L_drums(mx, T(9, 3) + S16, T(10), 'four', 'none', '16', kv=1.0, hv=0.95)
    mx.add('snare', CLAP, T(9, 4), 0.9)
    L_bass(mx, T(9, 3), T(10), 'oct8', 1.0)
    L_lead(mx, 9, [(8, 8, 'D6')], 0.8, octave=0.35)
    sparkle_arp(mx, T(9, 4), v=0.8)

    # ---- 10 余波 / 建设
    L_drums(mx, T(10), T(10, 4), 'half', 'three', '8', kv=0.85, cv=0.7, hv=0.6)
    L_roll(mx, T(10, 4), T(11), 0.3, 0.8, plan=((1.0, 1),))
    L_bass(mx, T(10), T(11), 'long', 0.85)
    L_pad(mx, T(10), T(11), 0.9)
    L_arp(mx, T(10), T(11), 0.42)
    mx.sfx(T(10, 1), 'click', 0.7, shot='V09', note='点「布置湖畔野餐角 →」')
    mx.sfx(T(10, 1.5), 'success', 0.55, shot='V09', note='建好啦')
    for k in range(12):
        mx.sfx(T(10, 2) + k * S16, f'build_thud_{k + 1}', 0.72, 0.3 * (-1) ** k, 'V09', '野餐角逐行搭建')

    # ---- 11–14 副歌延续（v2：V11 两小节，V12 第 14 小节）
    crash(mx, T(11), 0.85, '副歌延续：课程笔记')
    L_drums(mx, T(11), T(15), 'four', '24', '16', ohat=True, kv=1.0, cv=0.85, hv=0.95)
    L_bass(mx, T(11), T(15), 'oct8', 1.0)
    L_pad(mx, T(11), T(15), 1.0)
    L_arp(mx, T(11), T(15), 0.5, chip=0.25)
    L_lead(mx, 11, CH_B, 0.85, harm=0.4)
    mx.sfx(T(11, 1), 'page_flip', 0.7, shot='V10', note='展开本页大纲')
    mx.sfx(T(11, 2), 'chime3_A', 0.55, shot='V10', note='点标题跳转')
    mx.sfx(T(11, 3), 'select_swish', 0.75, shot='V10', note='选中一句')
    mx.sfx(T(11, 4), 'click', 0.7, shot='V10', note='点「加入学习待办」')
    mx.sfx(T(11, 4.25) + 0.22, 'paper_whoosh', 0.7, shot='V10', note='纸条飞出')
    crash(mx, T(12), 0.55, '校园网：诊断')
    for b, nm, lab in ((1, 'diag_ok', '区域判定 ✓'), (2, 'diag_fail', '互联网 ✗'), (3, 'diag_ok', '教学区门户 ✓'), (4, 'diag_neutral', '宿舍区门户 ·')):
        mx.sfx(T(12, b), nm, 0.85, shot='V11', note=lab)
    success_chord(mx, T(13), 'D', 0.85)
    mx.sfx(T(13), 'connect_success', 0.7, shot='V11', note='当前网络出口已在线')
    crash(mx, T(13), 0.7, '上线')
    for i in range(4):
        mx.sfx(T(13, 2) + i * S16, f'signal_on_{i + 1}', 0.55, 0.0, 'V11', f'信号柱第 {i + 1} 根亮起')
    L_lead(mx, 13, [(0, 4, 'A5'), (4, 4, 'D6'), (8, 4, 'F#6'), (12, 2, 'E6'), (14, 2, 'C#6')], 0.8, harm=0.4)
    for b, lab in ((1, '数据只存本机'), (2, '没有遥测'), (3, '开源 MIT')):
        hit(mx, T(14, b), 'G', 0.55, crash=0.7, stab=0.45, note=f'徽章砸下：{lab}')
        mx.sfx(T(14, b), 'badge_slam', 0.75, (-0.4, 0.0, 0.4)[b - 1], 'V12', lab)
    L_lead(mx, 14, [(0, 4, 'G5'), (4, 4, 'B5'), (8, 4, 'D6'), (12, 2, 'C#6'), (14, 2, 'E6')], 0.85, harm=0.4)
    rev_cym(mx, T(15), BEAT, 0.8)

    # ---- 15–16 尾声（v2：鼓组渐稀，第 16 小节撤掉鼓组；拍 1 收尾 hit + 金币「叮」，之后只剩混响尾巴）
    hit(mx, T(15), 'D', 1.1, note='结尾冲击：应用图标砸出')
    mx.sfx(T(15), 'sparkle_burst', 0.6, shot='V13', note='logo 弹出')
    L_drums(mx, T(15) + S16, T(15, 3), 'four', '24', '8', kv=0.85, cv=0.65, hv=0.7)
    L_drums(mx, T(15, 3), T(16), 'half', 'none', '8off', kv=0.55, hv=0.4)
    L_bass(mx, T(15), T(16), 'oct8', 0.8)
    L_pad(mx, T(15), T(16), 0.95)
    L_arp(mx, T(15), T(16), 0.42, chip=0.25)
    L_lead(mx, 15, MOTIF_END, 1.0, harm=0.45, octave=0.3)
    rev_cym(mx, T(16), BEAT, 0.45)
    final_hit(mx, T(16), '第 16 小节拍 1 收尾 hit + 金币「叮」，之后只剩混响尾巴')
    mx.sfx(T(16) + 0.05, 'whoosh_up', 0.45, shot='V13', note='下载牌滑入')
    mx.sfx(T(16, 1.5), 'pop', 0.55, 0.3, 'V13', '荔宝气泡')
    return mx, TONE_V, SECTIONS_V, SHOTS_V


# ================================================================ 混音与母带
GAIN = dict(kick=0.68, snare=0.46, hat=0.36, cym=0.25, bass=0.55, pad=0.72, arp=0.48, ep=0.34, lead=0.45,
            harm=0.55, merge=0.62, fx=0.55, fxpost=0.55, sfx=0.62)
SEND = dict(kick=0.0, snare=0.2, hat=0.05, cym=0.06, bass=0.0, pad=0.22, arp=0.3, ep=0.35, lead=0.22, harm=0.22,
            merge=0.32, fx=0.25, fxpost=0.3)
MUSIC_STEMS = ['kick', 'snare', 'hat', 'cym', 'bass', 'pad', 'arp', 'ep', 'lead', 'harm', 'merge', 'fx']
REV_GAIN = 0.55
IR_MAIN = make_ir(1.8, 2.8, 0.018, seed=1)
IR_SFX = make_ir(0.6, 1.0, 0.008, seed=2, width=0.6)


def cutoff_fn(points):
    ts = np.array([p[0] for p in points], float)
    ls = np.log(np.array([p[1] for p in points], float))
    return lambda t: np.exp(np.interp(t, ts, ls))


def sidechain(kicks, n, att=0.003, rel=0.1):
    sc = np.zeros(n)
    L = ns(0.5)
    tt = np.arange(L) / SR
    shape = np.where(tt < att, tt / att, np.exp(-(tt - att) / rel))
    for t, v in kicks:
        i = ns(t)
        m = min(L, n - i)
        if m > 0:
            sc[i:i + m] = np.maximum(sc[i:i + m], shape[:m] * v)
    return sc


def tape_stop(x, t0, dur, curve=1.7):
    i0, n = ns(t0), ns(dur)
    u = np.arange(n) / n
    rate = (1 - u) ** curve
    pos = i0 + np.cumsum(rate) - rate[0]
    idx = np.arange(x.shape[1])
    env = np.minimum(1, (1 - u) / 0.12) ** 1.5
    for c in range(2):
        x[c, i0:i0 + n] = np.interp(pos, idx, x[c]) * env
    x[:, i0:i0 + n] = fft_filter(x[:, i0:i0 + n], lambda f: lp(f, 6000) * hp(f, 35))


def apply_gate(x, t0, t1, f_out=0.004, f_in=0.0015):
    i0, i1 = ns(t0), ns(t1)
    a, b = ns(f_out), ns(f_in)
    x[:, i0 - a:i0] *= np.linspace(1, 0, a)
    x[:, i0:i1] = 0
    x[:, i1:i1 + b] *= np.linspace(0, 1, b)


def process_stems(mx, tone):
    st = {k: v.copy() for k, v in mx.st.items()}
    cut = cutoff_fn(tone)
    if 'bass' in st:
        st['bass'] = fft_filter(st['bass'], lambda f: lp(f, 1150, 0.85) * hp(f, 28))
    if 'pad' in st:
        st['pad'] = tv_filter(st['pad'], lambda t, f: lp(f, cut(t), 0.85))
        st['pad'] = fft_filter(st['pad'], lambda f: hp(f, 140))
    if 'arp' in st:
        st['arp'] = tv_filter(st['arp'], lambda t, f: lp(f, np.minimum(cut(t) * 1.7, 11000), 0.75))
        st['arp'] = fft_filter(st['arp'], lambda f: hp(f, 280))
    if 'ep' in st:
        st['ep'] = tv_filter(st['ep'], lambda t, f: lp(f, np.minimum(cut(t) * 1.4, 18000), 0.75))
        st['ep'] = fft_filter(st['ep'], lambda f: hp(f, 120))
    for k in ('lead', 'harm'):
        if k in st:
            st[k] = fft_filter(st[k], lambda f: hp(f, 190) * lp(f, 8500, 0.7) * lp(f, 12000, 0.7))
    if 'merge' in st:
        st['merge'] = fft_filter(st['merge'], lambda f: hp(f, 150))
    for k in ('fx', 'fxpost'):
        if k in st:
            st[k] = fft_filter(st[k], lambda f: hp(f, 32, 0.6))
    sc = sidechain(mx.kicks, mx.n)
    for k, d in (('bass', 0.55), ('pad', 0.6), ('arp', 0.3), ('ep', 0.3), ('harm', 0.15), ('lead', 0.08)):
        if k in st:
            st[k] *= 1 - d * sc
    return st


def build_music(mx, st):
    n = mx.n
    music = np.zeros((2, n))
    send = np.zeros((2, n))
    for k in MUSIC_STEMS:
        if k in st:
            music += GAIN[k] * st[k]
            send += GAIN[k] * SEND[k] * st[k]
    echo_in = GAIN['lead'] * st.get('lead', np.zeros((2, n))) * 0.4 + GAIN['harm'] * st.get('harm', np.zeros((2, n))) * 0.3 \
        + GAIN['merge'] * st.get('merge', np.zeros((2, n))) * 0.25
    music += pingpong(echo_in, 3 * S16, 0.36)
    music += convolve(send, IR_MAIN) * REV_GAIN
    for t0, d in mx.tapestops:
        tape_stop(music, t0, d)
    for t0, t1 in mx.gates:
        apply_gate(music, t0, t1)
    if 'fxpost' in st:
        post = GAIN['fxpost'] * st['fxpost']
        music += post + convolve(post * SEND['fxpost'], IR_MAIN) * REV_GAIN
    return music


def sfx_duck(sfxbus, depth_db=2.5, att=0.005, rel=0.12, blk=96):
    """按音效总线包络给配乐让位（最多 depth_db），只用于含音效的成片。"""
    p = (sfxbus ** 2).mean(axis=0)
    nb = len(p) // blk
    lvl = np.sqrt(p[:nb * blk].reshape(nb, blk).mean(axis=1))
    ref = np.percentile(lvl[lvl > 1e-5], 98) if np.any(lvl > 1e-5) else 1.0
    tgt = np.clip(lvl / (0.5 * ref), 0, 1)
    ca, cr = math.exp(-blk / (att * SR)), math.exp(-blk / (rel * SR))
    g, out = 0.0, np.empty(nb)
    for i in range(nb):
        c = ca if tgt[i] > g else cr
        g = c * g + (1 - c) * tgt[i]
        out[i] = g
    env = np.interp(np.arange(len(p)), np.arange(nb) * blk + blk / 2, out)
    return 10 ** (-depth_db * env / 20)


def build_sfx(mx, st):
    if 'sfx' not in st:
        return np.zeros((2, mx.n))
    s = GAIN['sfx'] * fft_filter(st['sfx'], lambda f: hp(f, 60))
    s = s + convolve(s * 0.22, IR_SFX) * 0.7
    for t0, t1 in mx.gates:
        apply_gate(s, t0, t1)
    return s


# ---------------------------------------------------------------- 测量
def k_filter(x):
    n = x.shape[-1]
    nf = _nfft(n + SR)
    X = np.fft.rfft(x, nf, axis=-1)
    w = 2 * np.pi * np.fft.rfftfreq(nf, 1 / SR) / SR
    z1 = np.exp(-1j * w)
    z2 = z1 * z1
    H1 = (1.53512485958697 - 2.69169618940638 * z1 + 1.19839281085285 * z2) / (1 - 1.69065929318241 * z1 + 0.73248077421585 * z2)
    H2 = (1.0 - 2.0 * z1 + z2) / (1 - 1.99004745483398 * z1 + 0.99007225036621 * z2)
    return np.fft.irfft(X * H1 * H2, nf, axis=-1)[..., :n]


def _block_power(y, win, hop):
    p = y ** 2
    cs = np.concatenate([np.zeros((2, 1)), np.cumsum(p, axis=1)], axis=1)
    starts = np.arange(0, p.shape[1] - win + 1, hop)
    return ((cs[:, starts + win] - cs[:, starts]) / win).sum(axis=0), starts


def loudness(x):
    """ITU-R BS.1770-4 / EBU R128：综合响度（LUFS）、短期最大、瞬时最大、LRA。"""
    y = k_filter(x)
    z, _ = _block_power(y, ns(0.4), ns(0.1))
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    g1 = lk > -70
    rel = -0.691 + 10 * np.log10(z[g1].mean()) - 10
    g2 = g1 & (lk > rel)
    I = -0.691 + 10 * np.log10(z[g2].mean())
    zs, starts = _block_power(y, ns(3.0), ns(0.1))
    ls = -0.691 + 10 * np.log10(zs + 1e-20)
    s1 = ls[ls > -70]
    relS = -0.691 + 10 * np.log10((10 ** ((s1 + 0.691) / 10)).mean()) - 20
    s2 = s1[s1 > relS]
    lra = float(np.percentile(s2, 95) - np.percentile(s2, 10)) if len(s2) > 2 else 0.0
    return dict(I=float(I), M_max=float(lk.max()), S_max=float(ls.max()), LRA=lra,
                S_curve=(starts / SR + 1.5, ls))


def tp_env(x, chunk=1 << 18, pad=2048):
    """4 倍过采样真峰值包络（每个原始样本取其后 4 个过采样点的最大绝对值）。"""
    n = x.shape[-1]
    out = np.empty(n)
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        a, b = max(0, s - pad), min(n, e + pad)
        m = b - a
        nf = _nfft(m)
        X = np.fft.rfft(x[:, a:b], nf, axis=-1)
        Y = np.zeros((x.shape[0], 2 * nf + 1), complex)
        Y[:, :X.shape[1]] = X
        y = np.fft.irfft(Y, 4 * nf, axis=-1)[:, :4 * m] * 4
        pk = np.abs(y).max(axis=0).reshape(m, 4).max(axis=1)
        out[s:e] = pk[s - a:s - a + (e - s)]
    return out


def db(v):
    return 20 * math.log10(max(v, 1e-12))


def glue(x, ratio=1.6, knee=6.0, att=0.01, rel=0.2, blk=240):
    p = (x ** 2).mean(axis=0)
    nb = len(p) // blk
    pb = p[:nb * blk].reshape(nb, blk).mean(axis=1)
    lvl = 10 * np.log10(pb + 1e-12)
    thr = np.percentile(lvl[lvl > -50], 92) - 2.0
    over = lvl - thr
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 / ratio - 1), (1 / ratio - 1) * (over + knee / 2) ** 2 / (2 * knee)))
    ca, cr = math.exp(-blk / (att * SR)), math.exp(-blk / (rel * SR))
    g, out = 0.0, np.empty(nb)
    for i in range(nb):
        tgt = gr[i]
        c = ca if tgt < g else cr
        g = c * g + (1 - c) * tgt
        out[i] = g
    gain_db = np.interp(np.arange(len(p)), np.arange(nb) * blk + blk / 2, out)
    return x * 10 ** (gain_db / 20), float(out.min())


def limiter(x, ceiling_db, look=0.0015, rel=0.07):
    c = 10 ** (ceiling_db / 20)
    pk = tp_env(x)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = ns(look)
    a = sliding_window_view(np.concatenate([req, np.ones(L)]), L + 1).min(axis=1)[:len(req)]
    b = np.maximum(1.0 - a, 1e-12)
    lc = -1.0 / (rel * SR)
    k = np.arange(len(b), dtype=float)
    h = np.exp(np.maximum.accumulate(np.log(b) - k * lc) + k * lc)
    g = 1.0 - h
    cs = np.concatenate([[0.0], np.cumsum(g)])
    lo = np.maximum(0, np.arange(len(g)) - L)
    gs = (cs[np.arange(len(g)) + 1] - cs[lo]) / (np.arange(len(g)) + 1 - lo)
    return x * gs, float(db(gs.min()))


def release_env(n, releases):
    env = np.ones(n)
    t = np.arange(n) / SR
    for t0, t1, d in releases:
        u = np.clip((t - t0) / (t1 - t0), 0, None)
        env *= 10 ** (d * u / 20)
    return env


def master(x, dur, label, silences=(), releases=()):
    x = x[:, :ns(dur)].copy()
    x = fft_filter(x, lambda f: hp(f, 27, 0.7) * hp(f, 27, 0.7) * highshelf(f, 9000, -2.5) * lp(f, 17500, 0.7) * bell(f, 450, 1.0, 0.8))
    for a, b in silences:
        apply_gate(x, a, b, 0.006, 0.0015)
    l_in = loudness(x)['I']
    x, glue_gr = glue(x)
    if releases:
        x = x * release_env(x.shape[1], releases)
    nfade = ns(0.5)
    x[:, -nfade:] *= (0.5 + 0.5 * np.cos(np.pi * np.linspace(0, 1, nfade)))
    g = 10 ** ((TARGET_LUFS - loudness(x)['I']) / 20)
    y, lim_gr = None, 0.0
    for _ in range(6):
        y, lim_gr = limiter(x * g, CEILING)
        I = loudness(y)['I']
        if abs(I - TARGET_LUFS) < 0.05:
            break
        g *= 10 ** ((TARGET_LUFS - I) / 20)
    tp = tp_env(y).max()
    if db(tp) > CEILING:
        y *= 10 ** ((CEILING - db(tp)) / 20)
    y[:, -1] = 0.0
    print(f'  [{label}] glue GR {glue_gr:.1f} dB, limiter max GR {lim_gr:.1f} dB, pre-gain {db(g):+.1f} dB')
    return y, dict(glue_max_gr_db=round(glue_gr, 2), limiter_max_gr_db=round(lim_gr, 2), net_gain_db=round(TARGET_LUFS - l_in, 2))


def analyze(x):
    L = loudness(x)
    tp = tp_env(x).max()
    sp = np.abs(x).max()
    rms = math.sqrt((x ** 2).mean())
    return dict(lufs_integrated=round(L['I'], 2), lufs_short_term_max=round(L['S_max'], 2),
                lufs_momentary_max=round(L['M_max'], 2), lra_lu=round(L['LRA'], 2),
                true_peak_dbtp=round(db(tp), 2), sample_peak_dbfs=round(db(sp), 2), rms_dbfs=round(db(rms), 2),
                dc_offset=float(np.abs(x.mean(axis=1)).max()))


def write_wav(path, x, silences=()):
    r = np.random.default_rng(7)
    d = r.random(x.shape) - r.random(x.shape)
    y = np.clip(np.round(x * 32767.0 + d), -32768, 32767).astype('<i2')
    for a, b in silences:
        y[:, ns(a):ns(b)] = 0
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.ascontiguousarray(y.T).tobytes())


def read_wav(path):
    with wave.open(path, 'rb') as w:
        ch, n = w.getnchannels(), w.getnframes()
        y = np.frombuffer(w.readframes(n), '<i2').astype(float) / 32768.0
    return y.reshape(n, ch).T


def ffmpeg_check(path):
    try:
        r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-filter_complex',
                            'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, timeout=120)
        txt = r.stderr[r.stderr.rfind('Summary:'):]
        out = {}
        for line in txt.splitlines():
            line = line.strip()
            if line.startswith('I:'):
                out['I_lufs'] = float(line.split()[1])
            elif line.startswith('LRA:'):
                out['LRA_lu'] = float(line.split()[1])
            elif line.startswith('Peak:'):
                out['true_peak_dbfs'] = float(line.split()[1])
        return out
    except Exception as e:  # noqa: BLE001
        return {'error': str(e)}


# ---------------------------------------------------------------- QA 图
def qa_image(path, x, mx, sections, title):
    from PIL import Image, ImageDraw
    m = x.mean(axis=0)
    W, Hs, Hl = 1600, 360, 140
    nfft, hop = 4096, max(1, len(m) // W)
    win = np.hanning(nfft)
    cols = []
    for i in range(W):
        s = i * hop
        seg = m[s:s + nfft]
        if len(seg) < nfft:
            seg = np.pad(seg, (0, nfft - len(seg)))
        cols.append(np.abs(np.fft.rfft(seg * win)))
    S = np.array(cols).T
    f = np.fft.rfftfreq(nfft, 1 / SR)
    fr = np.geomspace(30, 18000, Hs)
    idx = np.clip(np.searchsorted(f, fr), 0, len(f) - 1)
    Sdb = 20 * np.log10(S[idx] + 1e-9)
    Sdb = np.clip((Sdb - (Sdb.max() - 80)) / 80, 0, 1)[::-1]
    r = (255 * np.clip(Sdb * 1.6 - 0.3, 0, 1)).astype(np.uint8)
    g = (255 * np.clip(Sdb * 1.6 - 0.8, 0, 1)).astype(np.uint8)
    b = (255 * np.clip(Sdb * 1.2, 0, 1) * (1 - np.clip(Sdb * 1.6 - 0.9, 0, 1))).astype(np.uint8)
    img = Image.new('RGB', (W, Hs + Hl + 40), (16, 16, 20))
    img.paste(Image.fromarray(np.dstack([r, g, b])), (0, 20))
    d = ImageDraw.Draw(img)
    dur = mx.dur
    nb = int(round(dur / BAR))
    for bar in range(1, nb + 2):
        xx = int((bar - 1) * BAR / dur * W)
        d.line([(xx, 20), (xx, 20 + Hs + Hl)], fill=(90, 90, 90) if (bar - 1) % 4 else (200, 200, 120))
        if bar <= nb:
            d.text((xx + 2, 22), str(bar), fill=(255, 255, 255))
    for mk in mx.marks:
        if mk['kind'] in ('impact', 'impact_max', 'tape_stop', 'silence_start', 'power_down'):
            xx = int(mk['t'] / dur * W)
            d.line([(xx, 20 + Hs - 30), (xx, 20 + Hs)], fill=(255, 80, 80), width=2)
    L = loudness(x)
    ts, ls = L['S_curve']
    y0 = 20 + Hs
    for lv in (-30, -20, -14, -10):
        yy = y0 + int((-(lv) - 6) / 30 * Hl)
        d.line([(0, yy), (W, yy)], fill=(60, 60, 60))
        d.text((2, yy - 10), f'{lv}', fill=(150, 150, 150))
    pts = [(int(t / dur * W), y0 + int((-(l) - 6) / 30 * Hl)) for t, l in zip(ts, ls) if l > -60]
    if len(pts) > 1:
        d.line(pts, fill=(120, 230, 120), width=2)
    for b0, b1, nm in sections:
        xx = int((b0 - 1) * BAR / dur * W)
        d.text((xx + 2, 4), f'b{b0}', fill=(255, 210, 110))
    d.text((W - 420, 4), title, fill=(255, 255, 255))
    img.save(path)


# ---------------------------------------------------------------- manifest 片段
def grid(mx, sections, shots):
    nb = int(round(mx.dur / BAR))
    bars = []
    for bar in range(1, nb + 1):
        sec = next(s[2] for s in sections if s[0] <= bar <= s[1])
        chords = [dict(beat=b, chord=c) for b, c in mx.song.chmap.get(bar, [])]
        t0 = T(bar)
        sh = [s[0] for s in shots if s[1] < T(bar + 1) - 1e-3 and s[2] > t0 + 1e-3]
        beats = [dict(beat=b, global_beat=(bar - 1) * 4 + b, t=round(T(bar, b), 6), frame=frame_of(T(bar, b))) for b in (1, 2, 3, 4)]
        bars.append(dict(bar=bar, start_s=round(t0, 6), end_s=round(T(bar + 1), 6), start_frame=frame_of(t0),
                         section=sec, chords=chords, shots=sh, beats=beats))
    return bars


RAW_TP = {}


def cue_list(mx, net_gain_db):
    out = []
    for c in sorted(mx.cues, key=lambda c: (c['hit_t'], c['name'])):
        vol = c['gain'] * GAIN['sfx'] * 10 ** (net_gain_db / 20) * RAW_TP[c['name']] / 10 ** (-1.5 / 20)
        bar = int(c['hit_t'] // BAR) + 1
        beat = (c['hit_t'] - T(bar)) / BEAT + 1
        out.append(dict(hit_t=round(c['hit_t'], 6), hit_frame=frame_of(c['hit_t']), start_t=round(c['start_t'], 6),
                        bar=bar, beat=round(beat, 4), sfx=c['name'], file=f'sfx/{c["name"]}.wav',
                        gain_in_mix=round(c['gain'], 4), remotion_volume_over_music_only=round(min(1.0, vol), 3),
                        pan=round(float(c['pan']), 3), shot=c['shot'], note=c['note']))
    return out


def accent_list(mx):
    out = []
    for m in sorted(mx.marks, key=lambda m: m['t']):
        bar = int(m['t'] // BAR + 1e-9) + 1
        beat = (m['t'] - T(bar)) / BEAT + 1
        out.append(dict(t=m['t'], frame=frame_of(m['t']), bar=bar, beat=round(beat, 4), kind=m['kind'], note=m['note']))
    return out


# ================================================================ 主流程
def main():
    t_start = time.time()
    os.makedirs(SFX_DIR, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    versions = {}
    for arr in (arrange_16x9, arrange_9x16):
        mx, tone, sections, shots = arr()
        print(f'[{mx.name}] arranged ({time.time() - t_start:.1f}s); stems: {sorted(mx.st)}')
        st = process_stems(mx, tone)
        music = build_music(mx, st)
        sfxb = build_sfx(mx, st)
        # 各分轨在 DROP / 全曲的电平（调试用）
        lv = {}
        for k in sorted(st):
            if k in GAIN:
                seg = GAIN[k] * st[k][:, :ns(mx.dur)]
                lv[k] = round(db(math.sqrt((seg ** 2).mean()) + 1e-12), 1)
        print(f'  stem RMS dBFS (pre-master): {lv}')
        full, info_full = master(music * sfx_duck(sfxb) + sfxb, mx.dur, f'{mx.name} full', mx.silences, mx.releases)
        only, info_music = master(music, mx.dur, f'{mx.name} music', mx.silences, mx.releases)
        p_full = os.path.join(OUT, f'promo_{mx.name}_full.wav')
        p_music = os.path.join(OUT, f'music_{mx.name}.wav')
        write_wav(p_full, full, mx.silences)
        write_wav(p_music, only, mx.silences)
        qa_image(os.path.join(WORK, f'qa_{mx.name}_full.png'), full, mx, sections, f'promo_{mx.name}_full')
        versions[mx.name] = dict(mx=mx, sections=sections, shots=shots, files={'full': p_full, 'music': p_music},
                                 master={'full': info_full, 'music': info_music})
        print(f'[{mx.name}] rendered ({time.time() - t_start:.1f}s)')

    # 音效库导出（每个文件真峰值归一到 -1 dBTP 以下）
    lib = []
    used = set()
    for v in versions.values():
        used |= {c['name'] for c in v['mx'].cues}
    for name, meta in SFX.LIB.items():
        sig, off = SFX.get(name)
        s = stereo(sig)
        s = np.concatenate([s, np.zeros((2, ns(0.02)))], axis=1)
        s = fade_edges(fft_filter(s, lambda f: hp(f, 20, 0.6)), a=0.0002, r=0.003)
        tp = tp_env(s).max()
        RAW_TP[name] = tp
        s = s * (10 ** (-1.5 / 20) / tp)
        p = os.path.join(SFX_DIR, f'{name}.wav')
        write_wav(p, s)
        lib.append(dict(name=name, file=f'sfx/{name}.wav', group=meta['group'], desc=meta['desc'],
                        duration_s=round(s.shape[1] / SR, 4), hit_offset_s=round(off, 6),
                        used_in_mix=name in used, true_peak_dbtp=-1.5))
    print(f'sfx exported: {len(lib)} ({time.time() - t_start:.1f}s)')

    # 回读校验 + manifest
    files = {}
    for key, v in versions.items():
        for kind, p in v['files'].items():
            x = read_wav(p)
            a = analyze(x)
            a.update(master=v['master'][kind])
            a.update(path=os.path.relpath(p, OUT), abs_path=p, version=key, kind=kind, duration_s=x.shape[1] / SR,
                     samples=int(x.shape[1]), sample_rate=SR, channels=2, bit_depth=16,
                     ffmpeg_ebur128=ffmpeg_check(p))
            files[f'{kind}_{key}'] = a
            print(f'  {os.path.basename(p)}: {a}')

    man = dict(
        title='szuDesktop · 荔枝庭院 宣传片 原创配乐与音效',
        generator='work/audio/make_audio.py（+ dsp.py、sfx.py），/opt/miniconda3/bin/python3 + numpy 逐样本合成',
        originality='全部声音由程序合成：振荡器（polyBLEP 方波/脉冲/锯齿、4/5-bit 阶梯三角波、FM）、白噪声与 15 位 LFSR 噪声、'
                    '合成混响脉冲；不使用任何外部音乐、采样、音色库或 SoundFont。',
        format=dict(sample_rate=SR, bit_depth=16, channels=2, container='WAV PCM', dither='TPDF ±1 LSB'),
        loudness_target=dict(integrated_lufs=TARGET_LUFS, true_peak_ceiling_dbtp=CEILING,
                             method='ITU-R BS.1770-4 K 加权 + 门限（自算），4 倍过采样真峰值（自算）；ffmpeg ebur128 交叉核对'),
        tempo=dict(bpm=BPM_VAL, time_signature='4/4', key='D 大调', beat_s=BEAT, bar_s=BAR, sixteenth_s=S16,
                   frames_per_beat_60fps=BEAT * 60, frames_per_bar_60fps=BAR * 60,
                   frame_rounding='frame = round(t × 60)，.5 进位（与 JS Math.round 一致）'),
        harmony=dict(motif='「荔-枝-庭-院」D5–F#5–A5–B5', verse='Bm–G–D–A', chorus='D–A–Bm–G', interlude='G–A–F#m–Bm'),
        files=files,
        recommended=dict(
            **{'16x9': 'promo_16x9_full.wav', '9x16': 'promo_9x16_full.wav'},
            how='成片直接用 promo_*_full.wav（配乐 + 全部音效，已做母带，-14 LUFS / ≤ -1 dBTP），从第 0 帧开始放，不要再叠加 sfx/。'
                'music_*.wav 是同一编曲去掉界面音效后单独母带的版本（同样 -14 LUFS），只在画面时间点改动、需要自己重排音效时使用；'
                '这时在 Remotion 里把 sfx/*.wav 按 sfx_cues 的 start_t（= hit_t − hit_offset_s）放置，音量用 remotion_volume_over_music_only，'
                '叠加后自行复核总峰值（可能超过 -1 dBTP，必要时整体降 1–2 dB）。'),
        versions={},
        sfx_library=lib,
    )
    for key, v in versions.items():
        mx = v['mx']
        man['versions'][key] = dict(
            duration_s=mx.dur, bars=int(round(mx.dur / BAR)), full_mix=f'promo_{key}_full.wav', music_only=f'music_{key}.wav',
            sections=[dict(bars=[s[0], s[1]], start_s=round(T(s[0]), 6), end_s=round(T(s[1] + 1), 6), name=s[2]) for s in v['sections']],
            grid=grid(mx, v['sections'], v['shots']),
            music_accents=accent_list(mx),
            sfx_cues=cue_list(mx, v['master']['music']['net_gain_db']),
            silences=[dict(start_s=round(a, 6), end_s=round(b, 6), start_frame=frame_of(a), end_frame=frame_of(b),
                           note='数字静音（样本全 0）') for a, b in mx.silences],
            tape_stops=[dict(start_s=round(a, 6), end_s=round(a + d, 6)) for a, d in mx.tapestops],
            ending=dict(fade_out_s=[round(mx.dur - 0.5, 3), mx.dur], note='v2：最后一小节拍 1 收尾 hit + 金币「叮」后不留持续音，混响尾巴叠加 dB 线性释放（hit+0.3 s 起，到结束前 0.1 s 共 -26 dB），59.9 s / 29.9 s 前 ≤ -40 dBFS；最后 0.5 s 余弦淡出只作保险，最后一个样本为 0；画面保持到结束、不淡黑'),
        )
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    print(f'done in {time.time() - t_start:.1f}s')


BPM_VAL = 128

if __name__ == '__main__':
    main()
