# -*- coding: utf-8 -*-
"""szuDesktop 宣传片配乐 —— 纯 numpy 的合成与处理工具。

所有声音都从振荡器、噪声和包络逐样本算出来，不读取任何外部音频、采样或音色库。
"""
from __future__ import annotations

import bisect
import math

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

SR = 48000
BPM = 128
BEAT = 60.0 / BPM          # 0.46875 s = 22500 样本
BAR = 4 * BEAT             # 1.875 s
S16 = BEAT / 4             # 0.1171875 s
FPS = 60


def T(bar, beat=1.0):
    """小节、拍（都从 1 起）→ 秒。"""
    return (bar - 1) * BAR + (beat - 1) * BEAT


def ns(sec):
    return int(round(sec * SR))


def frame_of(t):
    """60fps 帧号，四舍五入（与 JS Math.round 一致：.5 进位）。"""
    return int(math.floor(t * FPS + 0.5 + 1e-9))


# ---------------------------------------------------------------- 音高
_PC = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7,
       'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def N(name):
    return 12 * (int(name[-1]) + 1) + _PC[name[:-1]]


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


D_MAJOR = {2, 4, 6, 7, 9, 11, 1}


def dshift(m, steps):
    """D 大调内按音级移动（-2 = 下方三度）。"""
    cur, d = m, (1 if steps > 0 else -1)
    for _ in range(abs(steps)):
        cur += d
        while cur % 12 not in D_MAJOR:
            cur += d
    return cur


CHORDS = {'D': (2, (0, 4, 7)), 'A': (9, (0, 4, 7)), 'Bm': (11, (0, 3, 7)),
          'G': (7, (0, 4, 7)), 'F#m': (6, (0, 3, 7)), 'E': (4, (0, 4, 7))}


def chord_pcs(ch):
    r, iv = CHORDS[ch]
    return [(r + i) % 12 for i in iv]


def chord_tones(ch, lo, hi):
    pcs = chord_pcs(ch)
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


def bass_root(ch):
    r = CHORDS[ch][0]
    return 35 + ((r - 11) % 12)      # B1(35)…A#2(46)


class Song:
    """和弦时间线。chmap = {小节: [(拍, 和弦名), ...]}"""

    def __init__(self, chmap):
        self.starts, self.chs = [], []
        for bar in sorted(chmap):
            for b, ch in chmap[bar]:
                self.starts.append(T(bar, b))
                self.chs.append(ch)
        self.chmap = chmap

    def chord(self, t):
        i = bisect.bisect_right(self.starts, t + 1e-6) - 1
        return self.chs[max(i, 0)]

    def segments(self, t0, t1):
        cuts = [t0] + [s for s in self.starts if t0 + 1e-6 < s < t1 - 1e-6] + [t1]
        return [(a, b, self.chord(a)) for a, b in zip(cuts[:-1], cuts[1:])]


# ---------------------------------------------------------------- 随机源（确定性）
_SEED = [20261005]


def rng():
    _SEED[0] += 1
    return np.random.default_rng(_SEED[0])


def noise(n):
    return rng().standard_normal(n)


def _lfsr(tap):
    reg, out = 1, np.empty(32767)
    for i in range(32767):
        bit = (reg ^ (reg >> tap)) & 1
        reg = (reg >> 1) | (bit << 14)
        out[i] = 1.0 if reg & 1 else -1.0
    return out


LFSR_LONG = _lfsr(1)    # 仿 8-bit 掌机的 15 位线性反馈噪声
LFSR_SHORT = _lfsr(6)   # 短周期模式，带金属音色


def chip_noise(n, rate=16000.0, short=False):
    seq = LFSR_SHORT if short else LFSR_LONG
    idx = (np.arange(n) * (rate / SR)).astype(np.int64)
    return seq[idx % len(seq)]


# ---------------------------------------------------------------- 滤波
def _nfft(n):
    return 1 << int(math.ceil(math.log2(max(n, 16))))


def lp(f, fc, q=0.7071):
    w = np.asarray(f, float) / fc
    return 1.0 / np.sqrt((1 - w * w) ** 2 + (w / q) ** 2)


def hp(f, fc, q=0.7071):
    w = np.maximum(np.asarray(f, float), 1e-9) / fc
    return (w * w) / np.sqrt((1 - w * w) ** 2 + (w / q) ** 2)


def bp(f, fc, q=1.0):
    w = np.maximum(np.asarray(f, float), 1e-9) / fc
    return (w / q) / np.sqrt((1 - w * w) ** 2 + (w / q) ** 2)


def lp4(f, fc):
    return lp(f, fc, 0.5412) * lp(f, fc, 1.3066)


def hp4(f, fc):
    return hp(f, fc, 0.5412) * hp(f, fc, 1.3066)


def bell(f, fc, db, q=1.0):
    g = 10 ** (db / 20)
    x = q * (np.asarray(f, float) / fc - fc / np.maximum(f, 1e-9))
    return 1 + (g - 1) / (1 + x * x)


def lowshelf(f, fc, db):
    g = 10 ** (db / 20)
    w = (np.asarray(f, float) / fc) ** 2
    return np.sqrt((g * g + w) / (1 + w))


def highshelf(f, fc, db):
    g = 10 ** (db / 20)
    w = (np.asarray(f, float) / fc) ** 2
    return np.sqrt((1 + g * g * w) / (1 + w))


def fft_filter(x, H, pad=8192):
    """零相位静态滤波：H(f) → 幅度响应。"""
    x = np.asarray(x, float)
    n = x.shape[-1]
    nf = _nfft(n + pad)
    X = np.fft.rfft(x, nf, axis=-1)
    f = np.fft.rfftfreq(nf, 1 / SR)
    return np.fft.irfft(X * H(f), nf, axis=-1)[..., :n]


def tv_filter(x, G, nfft=2048, hop=512):
    """时变滤波（STFT 加权叠加）。G(t[帧,1], f[1,频点]) → 幅度。"""
    x = np.asarray(x, float)
    if x.ndim == 2:
        return np.stack([tv_filter(c, G, nfft, hop) for c in x])
    n = len(x)
    xp = np.concatenate([np.zeros(nfft), x, np.zeros(nfft + hop)])
    win = np.sqrt(0.5 - 0.5 * np.cos(2 * np.pi * np.arange(nfft) / nfft))
    nfr = (len(xp) - nfft) // hop + 1
    frames = sliding_window_view(xp, nfft)[::hop][:nfr] * win
    X = np.fft.rfft(frames, axis=1)
    tc = (np.arange(nfr) * hop + nfft / 2 - nfft) / SR
    f = np.fft.rfftfreq(nfft, 1 / SR)
    Y = np.fft.irfft(X * G(tc[:, None], f[None, :]), nfft, axis=1) * win
    R = nfft // hop
    out = np.zeros((nfr + R - 1, hop))
    for j in range(R):
        out[j:j + nfr] += Y[:, j * hop:(j + 1) * hop]
    out = out.ravel() / (R / 2.0)
    return out[nfft:nfft + n]


def convolve(x, ir):
    """立体声卷积（x[2,n] 与 ir[2,m]，逐声道），输出截到 x 的长度。"""
    n = x.shape[-1]
    nf = _nfft(n + ir.shape[-1])
    return np.fft.irfft(np.fft.rfft(x, nf, axis=-1) * np.fft.rfft(ir, nf, axis=-1), nf, axis=-1)[:, :n]


def make_ir(rt=1.7, length=2.6, pre=0.016, seed=0, width=1.0):
    """合成混响脉冲：分频段指数衰减的去相关噪声（高频衰减更快）。"""
    n = ns(length)
    t = np.arange(n) / SR
    r = np.random.default_rng(9000 + seed)
    chans = []
    bands = [(None, 450, 1.2), (450, 2600, 1.0), (2600, 7500, 0.6), (7500, None, 0.32)]
    for ch in range(2):
        w = r.standard_normal(n)
        out = np.zeros(n)
        for lo, hi, k in bands:
            def H(f, lo=lo, hi=hi):
                g = np.ones_like(f)
                if lo:
                    g = g * hp4(f, lo)
                if hi:
                    g = g * lp4(f, hi)
                return g
            out += fft_filter(w, H) * np.exp(-6.9078 * t / (rt * k))
        out *= 1 - np.exp(-t / 0.006)
        chans.append(out)
    ir = np.stack(chans)
    mid = ir.mean(axis=0)
    ir = mid + width * (ir - mid)
    ir /= np.sqrt((ir ** 2).sum() / 2)
    return np.concatenate([np.zeros((2, ns(pre))), ir], axis=1)


def pingpong(x, delay, fb=0.38, taps=6, lo=320, hi=3800):
    m = x.mean(axis=0)
    out = np.zeros_like(x)
    d = ns(delay)
    for k in range(1, taps + 1):
        g = fb ** k
        if k * d >= len(m):
            break
        sh = np.zeros_like(m)
        sh[k * d:] = m[:-k * d]
        a, b = (0.95, 0.3) if k % 2 else (0.3, 0.95)
        out[0] += g * a * sh
        out[1] += g * b * sh
    return fft_filter(out, lambda f: lp(f, hi) * hp(f, lo))


# ---------------------------------------------------------------- 振荡器
def phase(freq, ph0=0.0):
    freq = np.asarray(freq, float)
    dt = freq / SR
    ph = np.cumsum(dt) - dt[0] + ph0
    return np.mod(ph, 1.0), dt


def blep(t, dt):
    dt = np.broadcast_to(dt, t.shape)
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    y[m] = x * x + x + x + 1.0
    return y


def saw(ph, dt):
    return 2.0 * ph - 1.0 - blep(ph, dt)


def pulse(ph, dt, duty=0.5):
    y = np.where(ph < duty, 1.0, -1.0)
    y = y + blep(ph, dt) - blep(np.mod(ph - duty, 1.0), dt)
    return y - (2.0 * duty - 1.0)


def tri(ph, steps=0):
    y = 1.0 - 4.0 * np.abs(ph - 0.5)
    if steps:
        y = np.round((y + 1) * 0.5 * (steps - 1)) / (steps - 1) * 2 - 1
    return y


def sine(ph):
    return np.sin(2 * np.pi * ph)


# ---------------------------------------------------------------- 包络与工具
def fade_edges(y, a=0.0004, r=0.004):
    y = np.array(y, float)
    n = y.shape[-1]
    ka, kr = min(n, ns(a)), min(n, ns(r))
    if ka > 1:
        y[..., :ka] *= np.linspace(0, 1, ka)
    if kr > 1:
        y[..., -kr:] *= np.linspace(1, 0, kr)
    return y


def adsr(n, gate, a=0.003, d=0.1, s=0.7, r=0.05):
    t = np.arange(n) / SR
    e = np.minimum(t / max(a, 1e-5), 1.0) * (s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-5)))
    if gate < n:
        g = max(gate, 1)
        e[g:] = e[g - 1] * np.exp(-(t[g:] - t[g - 1]) / max(r, 1e-5))
    return e


def pan2(y, pan):
    th = (np.asarray(pan, float) + 1) * np.pi / 4
    return np.stack([y * np.cos(th) * np.sqrt(2), y * np.sin(th) * np.sqrt(2)])


def stereo(y):
    return y if y.ndim == 2 else np.stack([y, y])


def sample_hold(x, h):
    """时变采样保持（h ≥ 1，单位样本）。"""
    h = np.broadcast_to(np.asarray(h, float), x.shape[-1:])
    s = np.floor(np.cumsum(1.0 / h)).astype(np.int64)
    starts = np.r_[0, np.flatnonzero(np.diff(s)) + 1]
    lens = np.diff(np.r_[starts, x.shape[-1]])
    return np.repeat(x[..., starts], lens, axis=-1)


def crush(x, bits):
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def place(dst, sig, i, gain=1.0):
    sig = stereo(sig)
    if i < 0:
        sig, i = sig[:, -i:], 0
    m = min(sig.shape[1], dst.shape[1] - i)
    if m > 0:
        dst[:, i:i + m] += gain * sig[:, :m]


def peak_norm(y, db=-1.0):
    p = np.abs(y).max()
    return y * (10 ** (db / 20) / p) if p > 0 else y


# ================================================================ 乐器
_CACHE = {}


def cached(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]


def mk_kick(f0=165.0, f1=46.0, tp=0.034, ta=0.23, click=0.4, chip=0.16, drive=1.7, dur=0.5):
    n = ns(dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / tp)
    ph, dt = phase(f)
    amp = np.where(t < 0.025, 1.0, np.exp(-(t - 0.025) / ta)) * np.minimum(t / 0.0007, 1)
    body = np.tanh(drive * sine(ph) * amp) / np.tanh(drive)
    clk = fft_filter(noise(n), lambda fr: hp(fr, 2200) * lp(fr, 9500)) * np.exp(-t / 0.0022) * click
    ph2, _ = phase(2 * f)
    ch = tri(ph2, 16) * np.exp(-t / 0.045) * chip
    return fade_edges(body + clk + ch)


def mk_snare(dur=0.34, tone=205.0, ntau=0.12, clap=False, bright=1.0, chip=0.2):
    n = ns(dur)
    t = np.arange(n) / SR
    nz = fft_filter(noise(n), lambda f: 0.9 * bp(f, 2400 * bright, 0.55) + 0.55 * hp(f, 6500 * bright))
    if clap:
        env = sum(np.where(t >= d, np.exp(-(t - d) / 0.0065), 0.0) for d in (0.0, 0.0095, 0.0195)) * 0.75
        env = env + np.where(t >= 0.028, np.exp(-(t - 0.028) / ntau), 0.0)
        body_amp = 0.25
    else:
        env = np.exp(-t / ntau)
        body_amp = 0.6
    bf = tone * (1 + 0.3 * np.exp(-t / 0.008))
    ph, _ = phase(bf)
    body = sine(ph) * np.exp(-t / 0.05) * body_amp
    cn = fft_filter(chip_noise(n, 11025), lambda f: hp(f, 900)) * np.exp(-t / 0.055) * chip
    y = nz * env * 0.9 + body + cn
    return fade_edges(y * np.minimum(t / 0.0005, 1))


HAT_FREQS = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def mk_metal(n, scale=1.9, detune=1.0):
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in HAT_FREQS * scale * detune:
        ph = np.mod(f * t, 1.0)
        y += pulse(ph, f / SR, 0.5)
    return y / len(HAT_FREQS)


def mk_hat(open_=False):
    dur = 0.55 if open_ else 0.09
    n = ns(dur)
    t = np.arange(n) / SR
    y = 0.65 * mk_metal(n) + 0.55 * noise(n)
    y = fft_filter(y, lambda f: hp4(f, 7000) * lp(f, 14000, 0.7))
    env = np.exp(-t / (0.14 if open_ else 0.017)) * np.minimum(t / 0.0004, 1)
    return fade_edges(y * env)


def mk_crash(dur=2.8, decay=1.0, bright=1.0):
    n = ns(dur)
    t = np.arange(n) / SR
    chans = []
    for c, det in ((0, 1.0), (1, 1.013)):
        y = 0.5 * mk_metal(n, 2.6, det) + 0.7 * noise(n)
        y = fft_filter(y, lambda f: hp4(f, 3600 * bright) * bell(f, 7000, 2, 0.7) * lp(f, 13000, 0.7))
        env = 0.55 * np.exp(-t / 0.05) + 0.45 * np.exp(-t / (0.95 * decay))
        chans.append(y * env * np.minimum(t / 0.0006, 1))
    return fade_edges(np.stack(chans), r=0.05)


def mk_tom(f0=125.0, dur=0.42):
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.55 * np.exp(-t / 0.045))
    ph, _ = phase(f)
    body = sine(ph) * np.exp(-t / 0.2)
    ch = tri(ph, 16) * np.exp(-t / 0.08) * 0.35
    nz = fft_filter(noise(n), lambda fr: bp(fr, 900, 0.8)) * np.exp(-t / 0.025) * 0.35
    return fade_edges(np.tanh(1.4 * (body + ch + nz)) / np.tanh(1.4))


def mk_impact(size=1.0, dur=3.2):
    n = ns(dur)
    t = np.arange(n) / SR
    f = (31 + 14 * max(0.0, 1.0 - size)) + 60 * np.exp(-t / (0.16 * size))
    ph, _ = phase(f)
    boom = sine(ph) * np.exp(-t / (0.62 * size)) * np.minimum(t / 0.0012, 1) * min(1.0, 0.45 + 0.55 * size)
    boom = np.tanh(1.6 * boom) / np.tanh(1.6)
    chans = []
    for c in range(2):
        w = noise(n)
        w = tv_filter(w, lambda tt, fr: lp(fr, 180 + 9500 * np.exp(-np.maximum(tt, 0) / 0.11), 0.9))
        chans.append(w * np.exp(-t / 0.42) * 0.42)
    nz = np.stack(chans)
    crunch = fft_filter(chip_noise(n, 7000), lambda fr: lp(fr, 3800)) * np.exp(-t / 0.07) * 0.22
    y = stereo(boom * 0.95 + crunch) + nz
    return fade_edges(y, r=0.08)


def mk_riser(dur, f_lo=260.0, f_hi=9500.0, pitch=(N('D3'), N('D5')), tone=0.32, curve=1.5):
    n = ns(dur)
    t = np.arange(n) / SR
    u = t / dur
    chans = []
    for c in range(2):
        w = noise(n)
        w = tv_filter(w, lambda tt, fr: bp(fr, f_lo * (f_hi / f_lo) ** np.clip(tt / dur, 0, 1) ** curve, 1.1))
        chans.append(w)
    y = np.stack(chans) * (u ** 2.2)
    if pitch:
        m0, m1 = pitch
        fm = hz(m0) * (hz(m1) / hz(m0)) ** (u ** 1.3)
        lfo = 1 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 14 * u) / SR)
        sw = np.zeros((2, n))
        for k, det in enumerate((-12, -4, 4, 12)):
            ph, dt = phase(fm * 2 ** (det / 1200), ph0=0.17 * k)
            sw += pan2(saw(ph, dt), (-0.7, -0.25, 0.25, 0.7)[k])
        sw = tv_filter(sw, lambda tt, fr: lp(fr, 600 + 7000 * np.clip(tt / dur, 0, 1) ** 2, 1.3))
        y = y + sw * (u ** 1.6) * tone * lfo / 4
    return fade_edges(y, r=0.002)


def mk_reverse_cymbal(dur):
    c = mk_crash(dur + 0.4, decay=1.4)
    c = c[:, :ns(dur)][:, ::-1].copy()
    u = np.linspace(0, 1, c.shape[1])
    return fade_edges(c * (0.25 + 0.75 * u ** 1.5), a=0.01, r=0.002)


def mk_inhale(dur):
    n = ns(dur)
    t = np.arange(n) / SR
    u = t / dur
    chans = []
    for c in range(2):
        w = noise(n)
        w = tv_filter(w, lambda tt, fr: hp(fr, 400 + 7000 * np.clip(tt / dur, 0, 1) ** 2, 0.9))
        chans.append(w)
    y = np.stack(chans) * u ** 3 * 0.9
    ph, _ = phase(140 * (8 ** (u ** 1.5)))
    y = y + stereo(sine(ph) * u ** 2.5 * 0.25)
    rc = mk_reverse_cymbal(dur) * 0.9
    return fade_edges(y + rc, a=0.01, r=0.002)


def mk_stab(notes, dur=0.55, cut0=7500.0, cut1=700.0, tau=0.22, vel=1.0, pulse_amt=0.5):
    gate = ns(dur)
    n = gate + ns(0.35)
    out = np.zeros((2, n))
    for i, m in enumerate(notes):
        for k, det in enumerate((-9, 0, 9)):
            ph, dt = phase(np.full(n, hz(m) * 2 ** (det / 1200)), ph0=0.31 * k + 0.07 * i)
            v = saw(ph, dt)
            if k == 1:
                v = v * 0.6 + pulse(ph, dt, 0.25) * pulse_amt
            out += pan2(v, (-0.6, 0.0, 0.6)[k])
    out /= len(notes) * 2
    out = tv_filter(out, lambda tt, fr: lp(fr, cut1 + (cut0 - cut1) * np.exp(-np.maximum(tt, 0) / tau), 1.1))
    e = adsr(n, gate, 0.002, tau * 1.4, 0.12, 0.12)
    return fade_edges(out * e * vel)


# ---- 旋律类
def lead_tone(m, dur, vel=1.0, duty=0.25, vib=14.0, detune=0.0, ph0=0.0, bright=0.12, slide=35.0, rel=0.07):
    gate = ns(dur)
    n = gate + ns(rel * 5)
    t = np.arange(n) / SR
    depth = vib * np.clip((t - 0.12) / 0.2, 0, 1)
    cents = depth * np.sin(2 * np.pi * 5.6 * t) + detune - slide * np.exp(-t / 0.012)
    f = hz(m) * 2 ** (cents / 1200)
    ph, dt = phase(f, ph0)
    y = pulse(ph, dt, duty)
    if bright:
        ph2, dt2 = phase(2 * f, ph0)
        y = y + bright * pulse(ph2, dt2, 0.125)
    e = adsr(n, gate, 0.004, 0.18, 0.72, rel)
    return fade_edges(y * e * vel * 0.5)


def bass_tone(m, dur, vel=1.0):
    gate = ns(dur)
    n = gate + ns(0.1)
    t = np.arange(n) / SR
    f = hz(m) * 2 ** ((25 * np.exp(-t / 0.01)) / 1200)
    ph, dt = phase(f)
    y = 0.42 * pulse(ph, dt, 0.5) + 0.36 * saw(ph, dt) + 0.8 * sine(ph)
    e = adsr(n, gate, 0.0025, 0.09, 0.62, 0.025)
    return fade_edges(y * e * vel)


def arp_tone(m, dur, vel=1.0, chip=0.0):
    n = ns(dur + 0.3)
    t = np.arange(n) / SR
    ph, dt = phase(np.full(n, hz(m)))
    y = tri(ph, 32)
    if chip:
        y = y + chip * pulse(ph, dt, 0.125)
    e = np.minimum(t / 0.0015, 1) * np.exp(-t / 0.11)
    return fade_edges(y * e * vel)


def pad_chord(notes, dur, vel=1.0):
    gate = ns(dur)
    n = gate + ns(0.6)
    out = np.zeros((2, n))
    r = rng()
    for m in notes:
        for k, det in enumerate((-14, -5, 5, 14)):
            ph, dt = phase(np.full(n, hz(m) * 2 ** (det / 1200)), r.random())
            out += pan2(saw(ph, dt), (-0.75, -0.25, 0.25, 0.75)[k])
    e = adsr(n, gate, 0.09, 0.7, 0.78, 0.3)
    return fade_edges(out * e * vel / (len(notes) * 3))


def ep_tone(m, dur, vel=1.0):
    gate = ns(dur)
    n = gate + ns(0.9)
    t = np.arange(n) / SR
    f = hz(m)
    I = 1.7 * np.exp(-t / 0.38) + 0.25
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
    y += 0.2 * np.exp(-t / 0.07) * np.sin(2 * np.pi * f * t + 1.1 * np.exp(-t / 0.03) * np.sin(2 * np.pi * 14 * f * t))
    e = np.minimum(t / 0.002, 1) * np.exp(-t / 1.4)
    g = gate
    e[g:] *= np.exp(-(t[g:] - t[g]) / 0.16)
    return fade_edges(y * e * vel * 0.5)


def bell_tone(m, dur=2.2, vel=1.0, ratio=3.5, idx=2.2, tau=0.9):
    n = ns(dur)
    t = np.arange(n) / SR
    f = hz(m)
    y = np.sin(2 * np.pi * f * t + idx * np.exp(-t / 0.5) * np.sin(2 * np.pi * ratio * f * t))
    y += 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (tau * 0.4))
    return fade_edges(y * np.minimum(t / 0.001, 1) * np.exp(-t / tau) * vel * 0.5, r=0.05)


def merge_tone(m, vel=1.0):
    """2048 合并音：方波，开头 30 ms 八度/五度芯片琶音，再落到本音。"""
    dur = 0.34
    n = ns(dur)
    t = np.arange(n) / SR
    st = np.where(t < 0.012, 12, np.where(t < 0.024, 7, 0))
    f = hz(m) * 2 ** (st / 12)
    ph, dt = phase(f)
    y = 0.75 * pulse(ph, dt, 0.5) + 0.25 * pulse(np.mod(2 * ph, 1), 2 * dt, 0.25)
    e = adsr(n, ns(0.17), 0.001, 0.09, 0.45, 0.07)
    sub_ph, _ = phase(np.full(n, hz(m - 12)))
    sub = tri(sub_ph, 16) * np.exp(-t / 0.12) * 0.45
    y = fft_filter(y * e + sub, lambda fr: lp(fr, 7500))
    return fade_edges(y * vel * 0.55)


def horn_note(m, dur, vel=1.0):
    gate = ns(dur)
    n = gate + ns(0.25)
    t = np.arange(n) / SR
    vib = 9 * np.clip((t - 0.1) / 0.15, 0, 1) * np.sin(2 * np.pi * 5.8 * t)
    out = np.zeros((2, n))
    for k, det in enumerate((-7, 7)):
        f = hz(m) * 2 ** ((det + vib - 40 * np.exp(-t / 0.02)) / 1200)
        ph, dt = phase(f, 0.3 * k)
        out += pan2(0.6 * saw(ph, dt) + 0.4 * pulse(ph, dt, 0.5), (-0.4, 0.4)[k])
    out = tv_filter(out, lambda tt, fr: lp(fr, 700 + 3200 * (1 - np.exp(-np.maximum(tt, 0) / 0.035)), 1.2))
    e = adsr(n, gate, 0.012, 0.25, 0.8, 0.08)
    return fade_edges(out * e * vel * 0.5)
