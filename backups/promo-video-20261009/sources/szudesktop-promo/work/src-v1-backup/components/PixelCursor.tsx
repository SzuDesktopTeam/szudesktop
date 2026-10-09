import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, keyframes, tween} from '../lib/anim';
import {C} from '../theme/palette';

/**
 * 12×19 pixel arrow cursor (the only non-app art in the film; storyboard sprite cursor_pixel).
 * X = ink outline, O = paper fill. Pressed state swaps the fill to the paper line colour.
 */
const ARROW = [
  'X...........',
  'XX..........',
  'XOX.........',
  'XOOX........',
  'XOOOX.......',
  'XOOOOX......',
  'XOOOOOX.....',
  'XOOOOOOX....',
  'XOOOOOOOX...',
  'XOOOOOOOOX..',
  'XOOOOOOOOOX.',
  'XOOOOOOXXXXX',
  'XOOOXOOX....',
  'XOOXXOOX....',
  'XOX..XOOX...',
  'XX...XOOX...',
  'X.....XOOX..',
  '......XOOX..',
  '.......XX...',
];

export const CursorGlyph: React.FC<{scale?: number; pressed?: boolean}> = ({scale = 4, pressed = false}) => {
  const rects: React.ReactNode[] = [];
  ARROW.forEach((row, y) =>
    Array.from(row).forEach((ch, x) => {
      if (ch === '.') return;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === 'X' ? C.ink : pressed ? C.line : C.paper} />);
    }),
  );
  return (
    <svg width={12 * scale} height={19 * scale} viewBox="0 0 12 19" shapeRendering="crispEdges" style={{display: 'block', filter: `drop-shadow(${scale}px ${scale}px 0 rgba(63,56,41,.35))`}}>
      {rects}
    </svg>
  );
};

export type CursorKey = readonly [frame: number, x: number, y: number];

/**
 * Animated cursor following keyframed positions (ease in-out between keys). `clicks` are
 * local frames where the button goes down for 6 frames and a pixel ring pops at the tip.
 */
export const PixelCursor: React.FC<{path: ReadonlyArray<CursorKey>; clicks?: ReadonlyArray<number>; scale?: number; inAt?: number}> = ({path, clicks = [], scale = 4, inAt}) => {
  const frame = useCurrentFrame();
  if (inAt !== undefined && frame < inAt) return null;
  const x = keyframes(frame, path.map(([f, px]) => [f, px] as const));
  const y = keyframes(frame, path.map(([f, , py]) => [f, py] as const));
  const pressed = clicks.some((c) => frame >= c && frame < c + 6);
  const ring = clicks.find((c) => frame >= c && frame < c + 14);
  return (
    <>
      {ring !== undefined ? <ClickRing x={x} y={y} t={(frame - ring) / 14} unit={scale} /> : null}
      <div style={{position: 'absolute', left: Math.round(x), top: Math.round(y), transform: pressed ? `scale(0.9)` : undefined, transformOrigin: '0 0'}}>
        <CursorGlyph scale={scale} pressed={pressed} />
      </div>
    </>
  );
};

/** Expanding square pixel ring (click feedback). */
const ClickRing: React.FC<{x: number; y: number; t: number; unit: number}> = ({x, y, t, unit}) => {
  const r = Math.round(tween(t, 0, 1, 4, 18, ease.out)) * unit;
  const op = 1 - t;
  const u = unit;
  return (
    <div style={{position: 'absolute', left: Math.round(x - r), top: Math.round(y - r), width: r * 2, height: r * 2, opacity: op}}>
      {[
        {left: u * 2, right: u * 2, top: 0, height: u},
        {left: u * 2, right: u * 2, bottom: 0, height: u},
        {top: u * 2, bottom: u * 2, left: 0, width: u},
        {top: u * 2, bottom: u * 2, right: 0, width: u},
        {left: u, top: u, width: u, height: u},
        {right: u, top: u, width: u, height: u},
        {left: u, bottom: u, width: u, height: u},
        {right: u, bottom: u, width: u, height: u},
      ].map((s, i) => (
        <div key={i} style={{position: 'absolute', background: C.gold, boxShadow: `0 0 0 ${Math.max(1, u / 2)}px ${C.woodDark}`, ...s}} />
      ))}
    </div>
  );
};
