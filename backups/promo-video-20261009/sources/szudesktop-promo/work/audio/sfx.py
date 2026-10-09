# -*- coding: utf-8 -*-
"""界面与拟音音效库（全部程序合成）。

每个音效返回 (信号, hit_offset_s)：hit_offset 是“落点”在文件中的位置，
排到时间轴上时用 落点时间 - hit_offset 作为起点（whoosh、下落哨音这类有前奏的音效）。
"""
from __future__ import annotations

import numpy as np

from dsp import (SR, N, hz, ns, noise, phase, pulse, saw, tri, sine, adsr, fade_edges, pan2, stereo,
                 fft_filter, tv_filter, lp, hp, bp, hp4, highshelf, chip_noise, sample_hold, crush,
                 bell_tone, mk_crash, mk_impact, mk_kick, mk_riser, mk_reverse_cymbal, mk_stab, merge_tone,
                 horn_note, place, mk_inhale)

PENTA = [N(x) for x in ('D6', 'E6', 'F#6', 'A6', 'B6', 'D7', 'E7')]


def _t(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------- 基础件
def coin():
    a, b = 0.055, 0.45
    n = ns(a + b)
    t = _t(n)
    f = np.where(t < a, hz(N('B5')), hz(N('E6')))
    ph, dt = phase(f)
    y = 0.55 * pulse(ph, dt, 0.5) + 0.14 * pulse(np.mod(2 * ph, 1), 2 * dt, 0.25)
    e = np.where(t < a, 1.0, np.exp(-(t - a) / 0.13)) * np.minimum(t / 0.001, 1)
    y = fft_filter(y * e, lambda fr: lp(fr, 9000) * hp(fr, 220))
    return fade_edges(y), 0.0


def coin_tinkle(m):
    n = ns(0.16)
    t = _t(n)
    ph, dt = phase(np.full(n, hz(m)))
    y = 0.6 * tri(ph, 16) + 0.25 * pulse(ph, dt, 0.125)
    y = y * np.minimum(t / 0.0008, 1) * np.exp(-t / 0.045)
    return fade_edges(y * 0.8), 0.0


def pop(f0=320.0, f1=1150.0, tau=0.045, chip=0.12):
    n = ns(0.18)
    t = _t(n)
    f = f0 + (f1 - f0) * (1 - np.exp(-t / 0.016))
    ph, dt = phase(f)
    y = sine(ph) * np.exp(-t / tau) * np.minimum(t / 0.0012, 1)
    y += chip * pulse(ph, dt, 0.25) * np.exp(-t / (tau * 0.6))
    y += fft_filter(noise(n), lambda fr: hp(fr, 3000)) * np.exp(-t / 0.0018) * 0.18
    return fade_edges(y * 0.9), 0.0


def click(bright=1.0, body=1.0):
    n = ns(0.06)
    t = _t(n)
    nz = fft_filter(noise(n), lambda fr: bp(fr, 3600 * bright, 1.3)) * np.exp(-t / 0.0016)
    tone = np.sin(2 * np.pi * 2000 * bright * t) * np.exp(-t / 0.005) * 0.35
    low = np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.011) * 0.4 * body
    return fade_edges(0.9 * nz + tone + low), 0.0


def key_tick(v):
    n = ns(0.05)
    t = _t(n)
    fc = (3000, 3500, 2700, 3900)[v % 4]
    nz = fft_filter(noise(n), lambda fr: bp(fr, fc, 1.5)) * np.exp(-t / 0.0022)
    body = np.sin(2 * np.pi * (520 + 60 * v) * t) * np.exp(-t / 0.007) * 0.3
    return fade_edges((0.8 * nz + body) * 0.7), 0.0


def hover_tick():
    y, o = click(1.4, 0.2)
    return y * 0.35, o


def scroll_tick(m):
    n = ns(0.07)
    t = _t(n)
    ph, dt = phase(np.full(n, hz(m)))
    y = pulse(ph, dt, 0.125) * np.exp(-t / 0.018) * 0.55
    y += fft_filter(noise(n), lambda fr: bp(fr, 4200, 2)) * np.exp(-t / 0.0015) * 0.5
    return fade_edges(y), 0.0


def clock_tick(level):
    """时钟 tick：level 0–3 越来越亮（配合滤波打开）。"""
    n = ns(0.05)
    t = _t(n)
    f = (1800, 2200, 2700, 3300)[level]
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) * 0.45
    y += fft_filter(noise(n), lambda fr: bp(fr, f * 1.8, 2.0)) * np.exp(-t / 0.002) * (0.4 + 0.15 * level)
    return fade_edges(y), 0.0


def menu_open():
    n = ns(0.16)
    t = _t(n)
    f = np.where(t < 0.035, hz(N('A5')), hz(N('D6')))
    ph, dt = phase(f)
    y = pulse(ph, dt, 0.25) * np.exp(-t / 0.05) * 0.4
    c, _ = click(1.1)
    out = np.zeros(n)
    out[:len(c)] += c * 0.7
    return fade_edges(out + y), 0.0


def chime3(notes=('D6', 'F#6', 'A6'), step=0.1171875, tau=0.35):
    n = ns(step * (len(notes) - 1) + 1.4)
    out = np.zeros(n)
    for i, nm in enumerate(notes):
        b = bell_tone(N(nm), 1.3, 0.55, ratio=2.0, idx=1.2, tau=tau)
        out[ns(i * step):ns(i * step) + len(b)] += b
    return fade_edges(out), 0.0


def pat_chime():
    n = ns(0.6)
    out = np.zeros(n)
    for i, nm in enumerate(('D6', 'F#6', 'A6')):
        m = N(nm)
        k = ns(0.18)
        t = _t(k)
        ph, _ = phase(np.full(k, hz(m)))
        y = tri(ph, 16) * np.exp(-t / 0.07) * np.minimum(t / 0.001, 1) * 0.6
        out[ns(i * 0.1171875):ns(i * 0.1171875) + k] += y
    sp, _ = sparkle(7, 0.035, seed_pitch=3)
    out = stereo(out)
    place(out, sp * 0.5, ns(0.2))
    return fade_edges(out), 0.0


def sparkle(count=8, spacing=0.03, seed_pitch=0, spread=0.8):
    r = np.random.default_rng(500 + seed_pitch)
    n = ns(spacing * count + 0.5)
    out = np.zeros((2, n))
    for i in range(count):
        m = PENTA[r.integers(0, len(PENTA))] + (12 if r.random() < 0.25 else 0)
        k = ns(0.2)
        t = _t(k)
        ph, _ = phase(np.full(k, hz(m)))
        y = (0.7 * sine(ph) + 0.3 * tri(ph, 16)) * np.exp(-t / 0.05) * np.minimum(t / 0.0008, 1)
        place(out, pan2(y * (0.5 + 0.5 * r.random()), r.uniform(-spread, spread)), ns(i * spacing))
    return fade_edges(out * 0.55), 0.0


def sparkle_burst():
    sp, _ = sparkle(18, 0.022, 11, 0.95)
    n = sp.shape[1] + ns(0.3)
    out = np.zeros((2, n))
    place(out, sp, 0)
    t = _t(ns(0.25))
    pf = fft_filter(noise(len(t)), lambda fr: hp(fr, 2500)) * np.exp(-t / 0.05) * 0.35
    place(out, pf, 0)
    for k, d in enumerate((0.0, 0.045, 0.08, 0.13)):
        p, _ = pop(300 + 120 * k, 900 + 200 * k, 0.03)
        place(out, pan2(p * 0.4, (-0.6, 0.5, -0.2, 0.7)[k]), ns(d))
    return fade_edges(out), 0.0


def bloop(name):
    m = N(name)
    n = ns(0.26)
    t = _t(n)
    f = hz(m) * 2 ** (12 * np.exp(-t / 0.012) / 12)
    ph, dt = phase(f)
    y = (0.7 * pulse(ph, dt, 0.5) + 0.3 * tri(ph, 16)) * adsr(n, ns(0.12), 0.001, 0.08, 0.5, 0.05)
    y = sample_hold(crush(y, 6), 3)
    y = fft_filter(y, lambda fr: lp(fr, 8000))
    cr = fft_filter(chip_noise(n, 9000, True), lambda fr: hp(fr, 1500)) * np.exp(-t / 0.03) * 0.25
    return fade_edges((y * 0.55 + cr)), 0.0


def whoosh(dur=0.32, peak=0.55, f0=450.0, f1=4200.0, pan0=-0.7, pan1=0.7, q=0.9, gain=1.0, tone=0.0):
    n = ns(dur)
    t = _t(n)
    u = t / dur
    a = np.where(u < peak, (u / peak) ** 2, (1 - (u - peak) / (1 - peak + 1e-9)) ** 1.6)
    a = np.clip(a, 0, 1)
    w = noise(n)

    def G(tt, fr):
        uu = np.clip(tt / dur, 0, 1)
        aa = np.where(uu < peak, (uu / peak), np.clip(1 - (uu - peak) / (1 - peak + 1e-9), 0, 1))
        fc = f0 * (f1 / f0) ** aa
        return bp(fr, fc, q) + 0.25 * hp(fr, fc * 1.5)
    y = tv_filter(w, G) * a
    if tone:
        ph, _ = phase(f0 * 0.5 * (f1 / f0) ** (0.5 * a))
        y = y + tone * sine(ph) * a
    pan = pan0 + (pan1 - pan0) * u
    return fade_edges(pan2(y * gain * 0.6, pan), a=0.003, r=0.006), peak * dur


def whoosh_pair():
    l, o = whoosh(0.42, 0.95, 400, 3800, -0.9, -0.1)
    r, _ = whoosh(0.42, 0.95, 380, 3500, 0.9, 0.1)
    th, _ = thump()
    out = np.zeros((2, l.shape[1] + ns(0.4)))
    place(out, l, 0)
    place(out, r, 0)
    place(out, th * 0.8, ns(o))
    return out, o


def whoosh_inhale(dur=0.4688):
    y = mk_inhale(dur) * 0.55
    return y, dur


def fall_whistle(dur=0.2375):
    n = ns(dur)
    t = _t(n)
    u = t / dur
    f = 1900 * (420 / 1900) ** (u ** 1.15) * (1 + 0.012 * np.sin(2 * np.pi * 18 * t))
    ph, dt = phase(f)
    y = (0.75 * sine(ph) + 0.25 * tri(ph, 16)) * (0.25 + 0.75 * u ** 1.2)
    w = fft_filter(noise(n), lambda fr: bp(fr, 2500, 0.8)) * u ** 2 * 0.25
    return fade_edges((y + w) * 0.5, r=0.002), dur


def hop():
    n = ns(0.14)
    t = _t(n)
    f = 260 * (3.4 ** (1 - np.exp(-t / 0.04)))
    ph, dt = phase(f)
    y = pulse(ph, dt, 0.5) * np.exp(-t / 0.05) * 0.3
    y = fft_filter(y, lambda fr: lp(fr, 5000))
    return fade_edges(y), 0.0


def thump(f0=95.0):
    n = ns(0.32)
    t = _t(n)
    ph, _ = phase(f0 * (1 + 0.6 * np.exp(-t / 0.02)))
    y = sine(ph) * np.exp(-t / 0.09)
    y += fft_filter(noise(n), lambda fr: lp(fr, 900)) * np.exp(-t / 0.03) * 0.5
    return fade_edges(np.tanh(1.5 * y) / np.tanh(1.5) * 0.8), 0.0


def land_soft():
    th, _ = thump(120)
    p, _ = pop(500, 800, 0.025, 0.0)
    out = th * 0.6
    out[:len(p)] += p * 0.3
    return out, 0.0


def dust():
    n = ns(0.32)
    t = _t(n)
    y = fft_filter(noise(n), lambda fr: lp(fr, 1800) * hp(fr, 150)) * (np.minimum(t / 0.008, 1) * np.exp(-t / 0.08))
    return fade_edges(y * 0.6), 0.0


def water():
    dur = 0.75
    n = ns(dur)
    t = _t(n)
    r = np.random.default_rng(77)
    walk = np.cumsum(r.standard_normal(200)) * 0.15
    cen = 1500 * 2 ** np.interp(np.linspace(0, 1, 200), np.linspace(0, 1, 200), walk - walk.mean())

    def G(tt, fr):
        idx = np.clip((tt / dur * 199).astype(int), 0, 199)
        return bp(fr, cen[idx], 1.6)
    y = tv_filter(noise(n), G)
    am = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 23 * t + 3 * np.sin(2 * np.pi * 3 * t)))
    env = np.minimum(t / 0.05, 1) * np.where(t > dur - 0.2, (dur - t) / 0.2, 1)
    y = y * am * env * 0.5
    out = stereo(y)
    for k in range(6):
        d = 0.05 + k * 0.11 + r.uniform(-0.02, 0.02)
        kk = ns(0.06)
        tt = _t(kk)
        f = (700 + 150 * r.random()) * (2.1 ** (1 - np.exp(-tt / 0.012)))
        ph, _ = phase(f)
        drop = sine(ph) * np.exp(-tt / 0.02) * 0.35
        place(out, pan2(drop, r.uniform(-0.5, 0.5)), ns(d))
    return fade_edges(out), 0.0


def notify():
    """提示音：两声 FM 铃（A5 → E6，纯五度，配哪个和弦都协和）。"""
    n = ns(1.2)
    out = np.zeros(n)
    for i, nm in enumerate(('A5', 'E6')):
        b = bell_tone(N(nm), 1.0, 0.6, ratio=2.0, idx=1.0, tau=0.3)
        out[ns(i * 0.085):ns(i * 0.085) + len(b)] += b
    return fade_edges(out), 0.0


def success():
    """成功音：芯片琶音 D5 F#5 A5 D6（32 分音符）+ D6 铃。"""
    step = 0.05859375
    n = ns(1.6)
    out = np.zeros(n)
    for i, nm in enumerate(('D5', 'F#5', 'A5', 'D6')):
        k = ns(0.2)
        t = _t(k)
        ph, dt = phase(np.full(k, hz(N(nm))))
        y = pulse(ph, dt, 0.25) * adsr(k, ns(0.06), 0.001, 0.05, 0.5, 0.04) * 0.35
        out[ns(i * step):ns(i * step) + k] += y
    b = bell_tone(N('D6'), 1.3, 0.6, ratio=2.0, idx=1.4, tau=0.45)
    out[ns(3 * step):ns(3 * step) + len(b)] += b
    out = fft_filter(out, lambda fr: lp(fr, 9000))
    return fade_edges(out), 0.0


def harvest_pop():
    p, _ = pop(180, 700, 0.06, 0.2)
    n = ns(0.6)
    out = np.zeros((2, n))
    place(out, p * 1.1, 0)
    t = _t(ns(0.08))
    thock = fft_filter(noise(len(t)), lambda fr: bp(fr, 1100, 1.2)) * np.exp(-t / 0.015) * 0.6
    place(out, thock, 0)
    for i, nm in enumerate(('G5', 'B5', 'D6', 'G6')):
        k = ns(0.14)
        tt = _t(k)
        ph, dt = phase(np.full(k, hz(N(nm))))
        y = pulse(ph, dt, 0.25) * np.exp(-tt / 0.05) * 0.22
        place(out, y, ns(0.04 + i * 0.03))
    return fade_edges(out), 0.0


def flip(v=0):
    n = ns(0.11)
    t = _t(n)
    y = tv_filter(noise(n), lambda tt, fr: bp(fr, 1800 * (3.5 ** np.clip(tt / 0.07, 0, 1)) * (1 + 0.08 * v), 1.4))
    y = y * np.minimum(t / 0.004, 1) * np.exp(-t / 0.03) * 0.7
    c, _ = click(1.3 + 0.1 * v, 0.3)
    y[:len(c)] += c * 0.4
    return fade_edges(y), 0.0


def build_thud(i):
    steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26]
    f0 = hz(N('G3') + steps[i % len(steps)])
    n = ns(0.22)
    t = _t(n)
    ph, _ = phase(f0 * (1 + 0.4 * np.exp(-t / 0.01)))
    y = sine(ph) * np.exp(-t / 0.06) * 0.7
    y += fft_filter(noise(n), lambda fr: bp(fr, 950 + 40 * i, 1.6)) * np.exp(-t / 0.014) * 0.55
    ph2, _ = phase(np.full(n, f0 * 2))
    y += tri(ph2, 16) * np.exp(-t / 0.03) * 0.2
    return fade_edges(y), 0.0


def tile_clack():
    n = ns(0.12)
    t = _t(n)
    y = fft_filter(noise(n), lambda fr: bp(fr, 1900, 2.2)) * np.exp(-t / 0.01) * 0.7
    y += np.sin(2 * np.pi * 980 * t) * np.exp(-t / 0.018) * 0.35
    y2 = np.zeros(n)
    y2[ns(0.012):] = y[:n - ns(0.012)] * 0.5
    return fade_edges(y + y2), 0.0


def page_flip():
    dur = 0.32
    n = ns(dur)
    t = _t(n)
    r = np.random.default_rng(31)
    flutter = np.interp(t, np.linspace(0, dur, 40), r.random(40))
    y = fft_filter(noise(n), lambda fr: bp(fr, 3500, 0.7)) * (0.4 + 0.6 * flutter)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return fade_edges(pan2(y * env * 0.55, np.linspace(-0.4, 0.4, n))), 0.12


def paper_land():
    c, _ = click(0.8, 0.5)
    d, _ = dust()
    n = len(d)
    out = d * 0.35
    out[:len(c)] += c * 0.7
    return out, 0.0


def glitch(dur=0.14):
    n = ns(dur)
    t = _t(n)
    r = np.random.default_rng(13)
    y = np.zeros(n)
    k = 0
    while k < n:
        L = int(r.integers(ns(0.008), ns(0.025)))
        f = r.choice([180, 360, 1440, 2880, 90])
        ph, dt = phase(np.full(L, f))
        seg = pulse(ph, dt, r.choice([0.125, 0.5])) * r.uniform(0.3, 0.8)
        if r.random() < 0.35:
            seg = chip_noise(L, r.uniform(3000, 15000)) * 0.6
        y[k:k + L] = seg[:max(0, min(L, n - k))]
        k += L
    y = sample_hold(crush(y, 4), 4)
    y = y - y.mean()
    st = np.stack([y, np.roll(y, ns(0.004))])
    return fade_edges(st * 0.45, r=0.002), dur


def power_down(dur=0.24):
    n = ns(dur)
    t = _t(n)
    u = t / dur
    ratio = 2 ** (-2.6 * u ** 1.1)
    y = np.zeros(n)
    for m in (N('B2'), N('F#3'), N('B3'), N('D4'), N('F#4')):
        ph, dt = phase(hz(m) * ratio)
        y += saw(ph, dt)
    y /= 5
    y = sample_hold(y, 1 + 22 * u ** 1.3)
    y = crush(y, 5) * (1 - u) ** 0.6
    y = fft_filter(y, lambda fr: lp(fr, 7000))
    th, _ = thump(60)
    out = np.zeros(n + len(th))
    out[:n] += y * 0.8
    out[ns(dur * 0.85):ns(dur * 0.85) + len(th)] += th * 0.35
    return fade_edges(out[:n + ns(0.12)]), 0.0


def signal_blip(name, down=True):
    m = N(name)
    n = ns(0.12)
    t = _t(n)
    f = hz(m) * 2 ** ((-3 if down else 3) * (t / 0.12) / 12)
    ph, dt = phase(f)
    y = pulse(ph, dt, 0.25) * adsr(n, ns(0.06), 0.001, 0.04, 0.5, 0.03) * 0.42
    return fade_edges(fft_filter(y, lambda fr: lp(fr, 7000))), 0.0


def diag_ok():
    n = ns(0.45)
    out = np.zeros(n)
    for i, (nm, L) in enumerate((('A5', 0.07), ('E6', 0.3))):
        k = ns(L + 0.12)
        t = _t(k)
        ph, dt = phase(np.full(k, hz(N(nm))))
        y = (0.55 * pulse(ph, dt, 0.5) + 0.45 * sine(ph)) * adsr(k, ns(L), 0.001, 0.08, 0.55, 0.05) * 0.4
        out[ns(i * 0.07):ns(i * 0.07) + k] += y[:n - ns(i * 0.07)]
    return fade_edges(fft_filter(out, lambda fr: lp(fr, 6500))), 0.0


def diag_fail():
    n = ns(0.36)
    t = _t(n)
    y = np.zeros(n)
    for f in (92.0, 97.5, 184.0):
        ph, dt = phase(np.full(n, f))
        y += pulse(ph, dt, 0.5)
    gate = ((t < 0.13) | ((t > 0.16) & (t < 0.3))).astype(float)
    gate = fft_filter(gate, lambda fr: lp(fr, 120))
    y = fft_filter(y / 3 * gate, lambda fr: lp(fr, 1600) * hp(fr, 70)) * 0.6
    return fade_edges(y), 0.0


def diag_neutral():
    n = ns(0.16)
    t = _t(n)
    ph, _ = phase(np.full(n, hz(N('F#5'))))
    y = (0.6 * sine(ph) + 0.4 * tri(ph, 16)) * np.minimum(t / 0.001, 1) * np.exp(-t / 0.04) * 0.45
    return fade_edges(y), 0.0


def scan_sweep(dur=0.45):
    n = ns(dur)
    t = _t(n)
    u = t / dur
    f = 420 * (2600 / 420) ** u
    ph, dt = phase(f)
    trem = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 28 * t))
    y = (0.6 * sine(ph) + 0.25 * pulse(ph, dt, 0.125)) * trem * np.sin(np.pi * u) ** 0.6 * 0.4
    y = crush(y, 7)
    w = tv_filter(noise(n), lambda tt, fr: bp(fr, 900 * (5 ** np.clip(tt / dur, 0, 1)), 2.0)) * 0.12 * np.sin(np.pi * u)
    return fade_edges(pan2(y + w, np.linspace(-0.6, 0.6, n))), 0.0


def connect_success():
    s, _ = success()
    p, _ = pop(500, 1300, 0.03, 0.1)
    out = s.copy()
    out[:len(p)] += p * 0.35
    return out, 0.0


def badge_slam():
    th, _ = thump(85)
    cl, _ = tile_clack()
    d, _ = dust()
    n = len(th) + ns(0.2)
    out = np.zeros((2, n))
    place(out, th, 0)
    place(out, cl * 0.7, 0)
    place(out, pan2(d * 0.7, -0.5), ns(0.02))
    place(out, pan2(d * 0.7, 0.5), ns(0.03))
    return fade_edges(out), 0.0


def zoom_whoosh():
    return whoosh(0.42, 0.72, 380, 5200, 0.0, 0.0, 0.8, 1.1, tone=0.15)


# ---------------------------------------------------------------- 音乐件也单独导出（便于剪辑时补用）
def impact():
    return mk_impact(1.0) * 0.8, 0.0


def impact_max():
    out = np.zeros((2, ns(3.6)))
    place(out, mk_impact(1.45, 3.6), 0)
    place(out, mk_kick(180, 40, 0.04, 0.3, 0.5, 0.2, 2.2), 0, 0.8)
    place(out, mk_crash(2.8) * 0.5, 0)
    place(out, mk_stab([N(x) for x in ('D3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'F#5')], 0.9, 9000, 900, 0.35), 0, 0.8)
    return peak_norm_local(out, 0.95), 0.0


def peak_norm_local(y, p):
    m = np.abs(y).max()
    return y * (p / m) if m > 0 else y


def riser_2beat():
    return mk_riser(0.9375) * 0.8, 0.9375


def riser_1bar():
    return mk_riser(1.875) * 0.8, 1.875


def reverse_cymbal():
    return mk_reverse_cymbal(0.46875) * 0.6, 0.46875


def coin_chord():
    """金币和弦：方波 D6 F#6 A6 D7 快速琶音 + 铃。"""
    step = 0.05859375 / 2
    n = ns(1.6)
    out = np.zeros(n)
    for i, nm in enumerate(('D6', 'F#6', 'A6', 'D7')):
        k = ns(0.3)
        t = _t(k)
        ph, dt = phase(np.full(k, hz(N(nm))))
        y = pulse(ph, dt, 0.5) * adsr(k, ns(0.08), 0.001, 0.08, 0.4, 0.06) * 0.22
        out[ns(i * step):ns(i * step) + k] += y
    for nm in ('D6', 'A6'):
        b = bell_tone(N(nm), 1.4, 0.35, ratio=3.5, idx=1.6, tau=0.5)
        out[:len(b)] += b
    c, _ = coin()
    out[:len(c)] += c * 0.5
    return fade_edges(fft_filter(out, lambda fr: lp(fr, 11000))), 0.0


def horn_harvest():
    """收获三音号角：D5–G5–B5（16 分、16 分、附点 8 分）。"""
    n = ns(0.9)
    out = np.zeros((2, n))
    for nm, s, L in (('D5', 0, 0.1), ('G5', 0.1171875, 0.1), ('B5', 0.234375, 0.36)):
        for octv, g in ((0, 1.0), (-12, 0.55)):
            place(out, horn_note(N(nm) + octv, L, g), ns(s))
    return fade_edges(out), 0.0


def ding():
    c, _ = coin()
    n = ns(2.6)
    out = np.zeros(n)
    out[:len(c)] += c
    for nm, g in (('E6', 0.5), ('B6', 0.25)):
        b = bell_tone(N(nm), 2.5, g, ratio=3.5, idx=1.8, tau=0.9)
        out[ns(0.055):ns(0.055) + len(b)] += b[:n - ns(0.055)]
    return fade_edges(out), 0.0


def levelup_2048():
    """「合成升级」总音效：上行五声合并音串 + 最大冲击（独立文件，便于单独使用）。"""
    notes = ('D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6')
    step = 0.234375 / 2
    n = ns(step * len(notes) + 3.6)
    out = np.zeros((2, n))
    for i, nm in enumerate(notes):
        place(out, merge_tone(N(nm)), ns(i * step))
    im, _ = impact_max()
    place(out, im * 0.8, ns(step * len(notes) + 0.06))
    return peak_norm_local(out, 0.95), step * len(notes) + 0.06


# ---------------------------------------------------------------- 注册表
LIB = {}


def reg(name, fn, desc, group='ui'):
    LIB[name] = dict(fn=fn, desc=desc, group=group)


reg('coin', coin, '金币 blip：方波 B5→E6（55 ms + 450 ms 衰减）', 'reward')
for _i, _m in enumerate(('E6', 'F#6', 'A6', 'B6', 'D7', 'E7')):
    reg(f'coin_tinkle_{_i + 1}', (lambda m=_m: coin_tinkle(N(m))), f'金币叮当（{_m}，三角波+12.5% 脉冲，160 ms）', 'reward')
reg('coin_chord', coin_chord, '金币和弦：方波 D6 F#6 A6 D7 64 分琶音 + FM 铃 + 金币', 'reward')
reg('ding', ding, '结尾金币「叮」：金币 + E6/B6 长尾铃', 'reward')
reg('pop', pop, '气泡 pop：正弦上滑 320→1150 Hz', 'ui')
reg('click', click, '点击：带通噪声 + 2 kHz 衰减正弦 + 330 Hz 低频体', 'ui')
for _v in range(4):
    reg(f'key_tick_{_v + 1}', (lambda v=_v: key_tick(v)), '键盘 tick（4 个随机变体，轮换使用）', 'ui')
reg('hover_tick', hover_tick, '光标划过的轻 tick', 'ui')
for _i, _m in enumerate(('D6', 'E6', 'F#6', 'A6', 'B6')):
    reg(f'scroll_tick_{_i + 1}', (lambda m=_m: scroll_tick(N(m))), f'滚轮 tick（{_m}，逐档升高）', 'ui')
for _i in range(4):
    reg(f'clock_tick_{_i + 1}', (lambda i=_i: clock_tick(i)), '时钟 tick（1→4 越来越亮）', 'ui')
reg('menu_open', menu_open, '菜单展开：点击 + 方波 A5→D6', 'ui')
reg('pat_chime', pat_chime, '摸摸头：三角波 D6 F#6 A6 上行 + 爱心闪光', 'ui')
reg('sparkle', sparkle, '闪光：五声音阶高音粒子', 'ui')
reg('sparkle_burst', sparkle_burst, '粒子爆发：闪光 + 多个小 pop', 'ui')
for _nm in ('D5', 'F#5', 'A5'):
    reg(f'bloop_{_nm.replace("#", "s")}', (lambda nm=_nm: bloop(nm)), f'换伙伴 bloop（{_nm}，像素化 6-bit）', 'ui')
reg('whoosh_whip', lambda: whoosh(0.30, 0.55, 500, 4800, -0.75, 0.75, 0.9, 1.0), '甩镜 whoosh（左→右，落点在 55%）', 'whoosh')
reg('whoosh_soft', lambda: whoosh(0.45, 0.4, 320, 2400, -0.3, 0.3, 0.8, 0.7), '柔和 whoosh（窗口飞入）', 'whoosh')
reg('whoosh_drag', lambda: whoosh(0.94, 0.5, 260, 1700, 0.0, 0.8, 0.8, 0.6), '拖动 whoosh（0.94 s，向右下）', 'whoosh')
reg('whoosh_inhale', whoosh_inhale, '吸入 whoosh（反向镲 + 上行噪声，落点在末尾）', 'whoosh')
reg('whoosh_zoom', zoom_whoosh, '冲镜头 whoosh（带音高）', 'whoosh')
reg('whoosh_down', lambda: whoosh(0.42, 0.4, 3400, 380, 0.0, 0.0, 0.9, 0.8), '下摇 whoosh（高→低）', 'whoosh')
reg('whoosh_up', lambda: whoosh(0.4, 0.6, 380, 3600, 0.0, 0.0, 0.9, 0.7), '上滑 whoosh（低→高）', 'whoosh')
reg('whoosh_pullback', lambda: whoosh(0.9, 0.12, 6000, 300, 0.0, 0.0, 0.8, 0.9, tone=0.1), '急速后拉 whoosh（0.9 s）', 'whoosh')
reg('whoosh_pair', whoosh_pair, '两扇窗对向飞入并交汇（落点 = 交汇）', 'whoosh')
reg('paper_whoosh', lambda: whoosh(0.5, 0.45, 1500, 6500, -0.2, 0.6, 1.2, 0.55), '纸条飞出 whoosh', 'whoosh')
reg('select_swish', lambda: whoosh(0.2, 0.35, 2500, 7500, -0.3, 0.3, 1.4, 0.5), '选中文字 swish', 'whoosh')
reg('fall_whistle', fall_whistle, '下落哨音 1900→420 Hz（0.2375 s，落点在末尾）', 'foley')
reg('hop', hop, '伙伴跳起 boing', 'foley')
reg('thump', thump, '低频落地 thump', 'foley')
reg('land_soft', land_soft, '轻落地', 'foley')
reg('dust', dust, '像素尘 puff', 'foley')
reg('water', water, '浇水：调制带通噪声 + 6 颗水滴', 'foley')
reg('notify', notify, '提示音：FM 铃 A5 → E6', 'ui')
reg('success', success, '成功音：脉冲波 D5 F#5 A5 D6 + D6 铃', 'ui')
reg('harvest_pop', harvest_pop, '收获 pop：大 pop + 木质 thock + G5 B5 D6 G6 小琶音', 'reward')
for _v in range(4):
    reg(f'flip_{_v + 1}', (lambda v=_v: flip(v)), '卡片翻转 fwip', 'ui')
for _i in range(12):
    reg(f'build_thud_{_i + 1}', (lambda i=_i: build_thud(i)), '搭建「咚」（G3 起五声音阶逐个升高）', 'foley')
reg('tile_clack', tile_clack, '2048 棋子相撞 clack', 'foley')
reg('page_flip', page_flip, '翻页', 'foley')
reg('paper_land', paper_land, '纸条落入', 'foley')
reg('chime3', chime3, '三音 chime：D6 F#6 A6（D 和弦）', 'ui')
reg('chime3_A', lambda: chime3(('C#6', 'E6', 'A6')), '三音 chime：C#6 E6 A6（A 和弦）', 'ui')
reg('glitch', glitch, '故障转场：4-bit 断续方波 + LFSR 噪声（落点在末尾）', 'ui')
reg('power_down', power_down, '断电：Bm 和弦 2.6 个八度下滑 + 递增 bitcrush', 'music')
for _i, _m in enumerate(('A5', 'F#5', 'D5', 'A4')):
    reg(f'signal_off_{_i + 1}', (lambda m=_m: signal_blip(m, True)), f'信号柱熄灭（{_m}，下滑）', 'ui')
for _i, _m in enumerate(('D5', 'F#5', 'A5', 'D6')):
    reg(f'signal_on_{_i + 1}', (lambda m=_m: signal_blip(m, False)), f'信号柱亮起（{_m}，上滑）', 'ui')
reg('diag_ok', diag_ok, '诊断 ✓：A5→E6 上行双音', 'ui')
reg('diag_fail', diag_fail, '诊断 ✗：低频双 buzz', 'ui')
reg('diag_neutral', diag_neutral, '诊断 ·：中性 F#5 blip', 'ui')
reg('scan_sweep', scan_sweep, '区域扫描 sweep 420→2600 Hz', 'ui')
reg('connect_success', connect_success, '上线成功（成功音 + pop）', 'ui')
reg('badge_slam', badge_slam, '徽章砸下：thump + clack + 双侧像素尘', 'foley')
for _i, _m in enumerate(('D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6')):
    reg(f'merge_{_i + 1}', (lambda m=_m: (merge_tone(N(m)), 0.0)), f'2048 合并音 {_i + 1}（{_m}，方波 + 芯片琶音起头）', 'music')
reg('levelup_2048', levelup_2048, '合成升级：9 个合并音串 + 最大冲击（落点 = 冲击）', 'music')
reg('impact', impact, '冲击：31–91 Hz 下滑 boom + 扫频噪声 + LFSR crunch', 'music')
reg('impact_max', impact_max, '最大冲击：大 boom + 硬底鼓 + 镲 + D 大和弦 stab', 'music')
reg('riser_2beat', riser_2beat, 'riser 2 拍：带通噪声上扫 + 失谐锯齿 D3→D5（落点在末尾）', 'music')
reg('riser_1bar', riser_1bar, 'riser 1 小节（落点在末尾）', 'music')
reg('reverse_cymbal', reverse_cymbal, '反向镲 1 拍（落点在末尾）', 'music')
reg('horn_harvest', horn_harvest, '收获号角 D5–G5–B5', 'music')

_BUILT = {}


def get(name):
    if name not in _BUILT:
        sig, off = LIB[name]['fn']()
        _BUILT[name] = (np.asarray(sig, float), float(off))
    return _BUILT[name]
