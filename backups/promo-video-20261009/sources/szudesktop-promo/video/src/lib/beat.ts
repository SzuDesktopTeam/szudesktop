/**
 * The beat grid. 128 BPM, 4/4, 60 fps:
 *   1 beat = 0.46875 s = 28.125 frames, 1 bar = 1.875 s = 112.5 frames.
 *   60 s = 32 bars = 128 beats; 30 s = 16 bars.
 * Cut points are always round(beatIndex × 28.125) on the *global* timeline, so rounding never
 * accumulates (max error 1/120 s). Shots/components work in local frames; use the helpers
 * below (or useShotClock) to convert beats into local frames without drifting off the grid.
 */
import {createContext, useContext} from 'react';
import {useCurrentFrame} from 'remotion';

export const FPS = 60;
export const BPM = 128;
export const BEAT_SEC = 60 / BPM; // 0.46875
export const BEAT = (FPS * 60) / BPM; // 28.125 frames
export const BAR = BEAT * 4; // 112.5 frames
export const EIGHTH = BEAT / 2;
export const SIXTEENTH = BEAT / 4;

/** Global frame of a 0-based beat index (fractional beats allowed: 2.5 = the "and" of beat 3). */
export const beatFrame = (beatIndex: number) => Math.round(beatIndex * BEAT);
/** Storyboard notation: bar 1-based, beat 1-based, plus optional fraction of a beat. */
export const barBeat = (bar: number, beat = 1, frac = 0) => (bar - 1) * 4 + (beat - 1) + frac;
export const barFrame = (bar: number, beat = 1, frac = 0) => beatFrame(barBeat(bar, beat, frac));
/** Seconds → nearest 16th-note beat index (storyboard times like 0.938 mean 0.9375). */
export const secToBeat = (s: number) => Math.round((s / BEAT_SEC) * 4) / 4;
/** Seconds → global frame, snapped to the 16th-note grid. */
export const secToFrame = (s: number) => beatFrame(secToBeat(s));
/** Duration in frames of n beats, as a float (use for interpolate ranges). */
export const beats = (n: number) => n * BEAT;

/**
 * Shot clock context: lets a component inside a <Shot> convert between local frames and the
 * global beat grid. Provided by <Shot>; defaults to "this sequence starts at beat 0".
 */
export type ShotClockValue = {startBeat: number; fromFrame: number};
export const ShotClock = createContext<ShotClockValue>({startBeat: 0, fromFrame: 0});

export const useShotClock = () => {
  const frame = useCurrentFrame();
  const {startBeat, fromFrame} = useContext(ShotClock);
  const globalFrame = frame + fromFrame;
  const globalBeat = globalFrame / BEAT;
  /** Beat position relative to the shot's nominal start (0 on the shot's first beat). */
  const beat = globalBeat - startBeat;
  /** Local frame at which local beat `b` lands, exact to the global grid. */
  const at = (b: number) => beatFrame(startBeat + b) - fromFrame;
  const bar = Math.floor(globalBeat / 4) + 1;
  const beatInBar = Math.floor(globalBeat % 4) + 1;
  return {frame, globalFrame, globalBeat, beat, at, bar, beatInBar};
};

/** Index of the current step when stepping every `stepBeats` from local beat `fromBeat`. */
export const stepIndex = (beatPos: number, fromBeat: number, stepBeats: number) =>
  Math.floor((beatPos - fromBeat) / stepBeats + 1e-6);
