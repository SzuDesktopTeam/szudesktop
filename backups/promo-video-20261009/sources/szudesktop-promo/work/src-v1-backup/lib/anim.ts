/**
 * Small deterministic animation helpers. Everything is a pure function of the frame so that
 * Remotion's parallel tabs render identical frames.
 */
import {Easing, interpolate, random, spring} from 'remotion';
import {FPS} from './beat';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const ease = {
  linear: (t: number) => t,
  inOut: Easing.inOut(Easing.cubic),
  out: Easing.out(Easing.cubic),
  outQuint: Easing.out(Easing.poly(5)),
  in: Easing.in(Easing.cubic),
  inQuint: Easing.in(Easing.poly(5)),
  outBack: Easing.out(Easing.back(1.7)),
  outBackStrong: Easing.out(Easing.back(3)),
  outExpo: Easing.out(Easing.exp),
  inExpo: Easing.in(Easing.exp),
  inOutExpo: Easing.inOut(Easing.exp),
} as const;
export type EaseFn = (t: number) => number;

/** Clamped 2-point tween: value goes a→b between frames f0..f1. */
export const tween = (frame: number, f0: number, f1: number, a: number, b: number, easing: EaseFn = ease.inOut) =>
  interpolate(frame, [f0, f1], [a, b], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

/**
 * Multi-keyframe tween: keys = [[frame, value], ...] (frames ascending). Each segment can
 * have its own easing via keys[i][2] (applied to the segment that *ends* at key i).
 */
export const keyframes = (frame: number, keys: ReadonlyArray<readonly [number, number, EaseFn?]>, fallback: EaseFn = ease.inOut) => {
  if (keys.length === 0) return 0;
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, e] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (frame <= f1) return f1 === f0 ? v1 : lerp(v0, v1, (e ?? fallback)((frame - f0) / (f1 - f0)));
  }
  return keys[keys.length - 1][1];
};

/** Spring that starts at `at` (local frame); 0 before. Default = snappy with a small overshoot. */
export const springAt = (
  frame: number,
  at: number,
  config: Partial<{damping: number; mass: number; stiffness: number; overshootClamping: boolean}> = {},
  durationInFrames?: number,
) =>
  frame < at
    ? 0
    : spring({frame: frame - at, fps: FPS, config: {damping: 11, mass: 0.6, stiffness: 170, ...config}, durationInFrames});

/** Exponential decay envelope: 1 at `at`, falling to ~0 after `frames`. 0 before `at`. */
export const hit = (frame: number, at: number, frames = 12) => (frame < at ? 0 : Math.exp((-(frame - at) / Math.max(1, frames)) * 4.6));

/** Sum of hits for a list of hit frames (e.g. every beat). */
export const hits = (frame: number, ats: ReadonlyArray<number>, frames = 12) => ats.reduce((s, a) => s + hit(frame, a, frames), 0);

/**
 * Decaying screen shake, quantised to whole pixels and to `hold` frames per position so it
 * reads as a pixel-game shake rather than video jitter. Returns {x, y, rot(deg)}.
 */
export const shake = (frame: number, at: number, frames: number, amp: number, seed = 1, hold = 1) => {
  if (frame < at || frame > at + frames) return {x: 0, y: 0, rot: 0};
  const k = Math.floor((frame - at) / hold);
  const decay = 1 - (frame - at) / frames;
  const a = amp * decay * decay;
  return {
    x: Math.round((random(`sx${seed}-${k}`) * 2 - 1) * a),
    y: Math.round((random(`sy${seed}-${k}`) * 2 - 1) * a),
    rot: (random(`sr${seed}-${k}`) * 2 - 1) * a * 0.02,
  };
};

/** Integer jitter that changes every `hold` frames (for "抖动" titles). */
export const jitter = (frame: number, amp: number, seed: string | number, hold = 4) => {
  const k = Math.floor(frame / hold);
  return {
    x: Math.round((random(`jx${seed}-${k}`) * 2 - 1) * amp),
    y: Math.round((random(`jy${seed}-${k}`) * 2 - 1) * amp),
  };
};

/** Quantise a value to a step (e.g. stepped zoom for a chunky pixel feel). */
export const quantize = (v: number, step: number) => Math.round(v / step) * step;

/** Seeded random in [lo, hi). */
export const rand = (seed: string | number, lo = 0, hi = 1) => lo + random(seed) * (hi - lo);
