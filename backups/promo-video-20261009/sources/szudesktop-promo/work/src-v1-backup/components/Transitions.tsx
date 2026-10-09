import React, {useId, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, hit, rand, tween} from '../lib/anim';
import {SIXTEENTH} from '../lib/beat';
import {useSpriteSrc} from '../lib/assets';
import {C} from '../theme/palette';

/** React useId() → a string usable inside url(#…). */
const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** Full-frame flash (default: 2 frames of paper-white #FFFDF5). */
export const WhiteFlash: React.FC<{at: number; frames?: number; color?: string; fadeFrames?: number}> = ({at, frames = 2, color = C.paperHi, fadeFrames = 4}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + frames + fadeFrames) return null;
  const op = frame < at + frames ? 1 : 1 - (frame - at - frames + 1) / (fadeFrames + 1);
  return <AbsoluteFill style={{background: color, opacity: op, pointerEvents: 'none'}} />;
};

/** Black hold (e.g. the 1/8-beat silence before the drop). */
export const BlackHold: React.FC<{from: number; to: number; color?: string}> = ({from, to, color = '#000'}) => {
  const frame = useCurrentFrame();
  return frame >= from && frame < to ? <AbsoluteFill style={{background: color}} /> : null;
};

/**
 * Exact mosaic of a bitmap (canvas: box-downsample, nearest-neighbour upsample).
 * Use for the opening campus.png 96 → 32 → 8 px reveal. `block` ≤ 1 draws the image as is.
 */
export const MosaicImage: React.FC<{sprite?: string; src?: string; block: number; width?: number; height?: number; zoom?: number}> = ({sprite, src, block, width, height, zoom = 1}) => {
  const cfg = useVideoConfig();
  const W = width ?? cfg.width;
  const H = height ?? cfg.height;
  const resolve = useSpriteSrc();
  const url = src ?? resolve(sprite!);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender(`mosaic ${url}`));
  const released = useRef(false);
  useLayoutEffect(() => {
    const im = new Image();
    im.onload = () => {
      setImg(im);
    };
    im.onerror = (e) => cancelRender(new Error(`MosaicImage failed to load ${url}: ${String(e)}`));
    im.src = url;
  }, [url]);
  useLayoutEffect(() => {
    if (!img || !canvas.current) return;
    const ctx = canvas.current.getContext('2d')!;
    // object-fit: cover with zoom about the centre.
    const s = Math.max(W / img.width, H / img.height) * zoom;
    const dw = img.width * s;
    const dh = img.height * s;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    ctx.clearRect(0, 0, W, H);
    if (block <= 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      const sw = Math.max(1, Math.ceil(W / block));
      const sh = Math.max(1, Math.ceil(H / block));
      const small = document.createElement('canvas');
      small.width = sw;
      small.height = sh;
      const sc = small.getContext('2d')!;
      sc.imageSmoothingEnabled = true;
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(img, dx / block, dy / block, dw / block, dh / block);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw * block, sh * block);
    }
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
  }, [img, block, W, H, zoom, handle]);
  return <canvas ref={canvas} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: W, height: H}} />;
};

/**
 * Pixelate any DOM subtree with an SVG filter (one sample per block, dilated).
 * `block` is rounded to the next odd size (2r+1) so blocks never overlap.
 */
export const Pixelate: React.FC<{block: number; children: React.ReactNode; style?: React.CSSProperties}> = ({block, children, style}) => {
  const id = useSvgId('px');
  const r = Math.max(0, Math.round((block - 1) / 2));
  if (r === 0) return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  const b = 2 * r + 1;
  return (
    <AbsoluteFill style={style}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id={id} x={0} y={0} width="100%" height="100%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood x={r} y={r} width={1} height={1} floodColor="#000" floodOpacity={1} />
          <feComposite width={b} height={b} />
          <feTile result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" />
          <feMorphology operator="dilate" radius={r} />
        </filter>
      </svg>
      <AbsoluteFill style={{filter: `url(#${id})`}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Storyboard "像素块溶解": A pixelates 8→16→32→64 on 16th notes, cuts to B at the midpoint,
 * B resolves 64→32→16→8→sharp. `at` = local frame of the cut (B's first sharp-ish frame is
 * at + 4 steps). Render both shots as children functions.
 */
export const MosaicCut: React.FC<{at: number; step?: number; from: React.ReactNode; to: React.ReactNode; sizes?: number[]}> = ({at, step = SIXTEENTH, from, to, sizes = [9, 17, 33, 65]}) => {
  const frame = useCurrentFrame();
  const k = Math.floor((frame - at) / step);
  if (frame < at - sizes.length * step) return <AbsoluteFill>{from}</AbsoluteFill>;
  if (frame < at) {
    const i = Math.min(sizes.length - 1, sizes.length + Math.floor((frame - at) / step));
    return <Pixelate block={sizes[Math.max(0, i)]}>{from}</Pixelate>;
  }
  if (k < sizes.length) return <Pixelate block={sizes[sizes.length - 1 - k]}>{to}</Pixelate>;
  return <AbsoluteFill>{to}</AbsoluteFill>;
};

/**
 * Random block reveal: `children` (the incoming shot) appears block by block over whatever is
 * underneath, stepping on 16th notes. Blocks are square, in screen px.
 */
export const BlockDissolve: React.FC<{at: number; steps?: number; step?: number; block?: number; seed?: string; reverse?: boolean; children: React.ReactNode}> = ({
  at,
  steps = 4,
  step = SIXTEENTH,
  block = 120,
  seed = 'bd',
  reverse = false,
  children,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const id = useSvgId('bd');
  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  const k = (frame - at) / step;
  if (!reverse && k < 0) return null;
  if (reverse && k >= steps) return null;
  if (!reverse && k >= steps) return <AbsoluteFill>{children}</AbsoluteFill>;
  if (reverse && k < 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const shown = Math.floor(k) + 1; // number of steps revealed so far
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slot = Math.floor(random(`${seed}-${r}-${c}`) * steps);
      const visible = reverse ? slot >= shown : slot < shown;
      if (visible) rects.push(<rect key={`${r}-${c}`} x={c * block} y={r * block} width={block} height={block} />);
    }
  }
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          {rects}
        </clipPath>
      </svg>
      <AbsoluteFill style={{clipPath: `url(#${id})`}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Stair-stepped diagonal wipe revealing `children` (pixel staircase edge).
 * direction: 'right' reveals left→right, 'left' right→left, 'down', 'up'.
 */
export const PixelWipe: React.FC<{at: number; frames?: number; direction?: 'right' | 'left' | 'down' | 'up'; stair?: number; edgeColor?: string | null; children: React.ReactNode}> = ({
  at,
  frames = 14,
  direction = 'right',
  stair = 60,
  edgeColor = C.gold,
  children,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  if (frame < at) return null;
  const p = tween(frame, at, at + frames, 0, 1, ease.inOut);
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  const horizontal = direction === 'right' || direction === 'left';
  const span = horizontal ? width : height;
  const cross = horizontal ? height : width;
  const slope = 0.35; // stair lead per step
  const nSteps = Math.ceil(cross / stair);
  const front = p * (span + nSteps * stair * slope);
  const pts: string[] = [];
  // Build polygon in "progress space" then map to screen.
  const map = (a: number, b: number) => {
    // a: along wipe direction (0 = start edge), b: across
    if (direction === 'right') return `${a}px ${b}px`;
    if (direction === 'left') return `${width - a}px ${b}px`;
    if (direction === 'down') return `${b}px ${a}px`;
    return `${b}px ${height - a}px`;
  };
  pts.push(map(0, 0));
  for (let i = 0; i < nSteps; i++) {
    const a = Math.max(0, front - i * stair * slope);
    pts.push(map(a, i * stair));
    pts.push(map(a, (i + 1) * stair));
  }
  pts.push(map(0, cross));
  const poly = `polygon(${pts.join(', ')})`;
  return (
    <AbsoluteFill>
      {edgeColor ? <AbsoluteFill style={{clipPath: poly, background: edgeColor, transform: `translate(${horizontal ? (direction === 'right' ? 10 : -10) : 0}px, ${horizontal ? 0 : direction === 'down' ? 10 : -10}px)`}} /> : null}
      <AbsoluteFill style={{clipPath: poly}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Scale impulse on a hit ("缩放冲击"): 1 → 1+amp, decaying. Wraps any content. */
export const ZoomPunch: React.FC<{at: number | number[]; amp?: number; frames?: number; children: React.ReactNode; origin?: string}> = ({at, amp = 0.08, frames = 10, children, origin = '50% 50%'}) => {
  const frame = useCurrentFrame();
  const ats = Array.isArray(at) ? at : [at];
  const s = 1 + ats.reduce((m, a) => Math.max(m, hit(frame, a, frames)), 0) * amp;
  return <AbsoluteFill style={{transform: `scale(${s})`, transformOrigin: origin}}>{children}</AbsoluteFill>;
};

/**
 * Whip pan: the content slides out ('out') or in ('in') horizontally over `frames` with a
 * directional motion blur (SVG feGaussianBlur on the X axis only).
 */
export const WhipPan: React.FC<{at: number; frames?: number; mode: 'in' | 'out'; direction?: 'left' | 'right'; distance?: number; blur?: number; children: React.ReactNode}> = ({
  at,
  frames = 7,
  mode,
  direction = 'left',
  distance = 1920,
  blur = 60,
  children,
}) => {
  const frame = useCurrentFrame();
  const id = useSvgId('wp');
  const sign = direction === 'left' ? -1 : 1;
  let x = 0;
  let b = 0;
  if (mode === 'out') {
    if (frame >= at + frames) return null;
    const p = tween(frame, at, at + frames, 0, 1, ease.inQuint);
    x = sign * distance * p;
    b = blur * Math.sin(Math.min(1, p) * Math.PI * 0.5);
  } else {
    if (frame < at) return null;
    const p = tween(frame, at, at + frames, 0, 1, ease.outQuint);
    x = -sign * distance * (1 - p);
    b = blur * (1 - p);
  }
  return (
    <AbsoluteFill>
      {b > 0.5 ? (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id={id} x="-10%" y="0" width="120%" height="100%">
            <feGaussianBlur stdDeviation={`${b} 0`} />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{transform: `translateX(${x}px)`, filter: b > 0.5 ? `url(#${id})` : undefined}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Glitch (only for "断网了？"): RGB split, horizontal slice displacement, scanlines, and an
 * optional black-frame dropout. Active between `at` and `at + frames`.
 */
export const Glitch: React.FC<{at: number; frames: number; split?: number; slices?: number; blackFrames?: number[]; seed?: string; children: React.ReactNode}> = ({
  at,
  frames,
  split = 6,
  slices = 5,
  blackFrames = [],
  seed = 'gl',
  children,
}) => {
  const frame = useCurrentFrame();
  const id = useSvgId('gl');
  const active = frame >= at && frame < at + frames;
  if (!active) return <AbsoluteFill>{children}</AbsoluteFill>;
  if (blackFrames.includes(frame - at)) return <AbsoluteFill style={{background: '#000'}} />;
  const k = Math.floor((frame - at) / 2);
  const d = Math.round(split * (0.6 + random(`${seed}-d-${k}`) * 0.8));
  const bands = Array.from({length: slices}).map((_, i) => {
    const y0 = rand(`${seed}-y-${k}-${i}`, 0, 0.92);
    const h = rand(`${seed}-h-${k}-${i}`, 0.02, 0.09);
    const dx = Math.round(rand(`${seed}-x-${k}-${i}`, -1, 1) * split * 6);
    return {y0, h, dx};
  });
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id={id} x="-2%" y="0" width="104%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={-d} dy={0} result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={d} dy={0} result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>
      <AbsoluteFill style={{filter: `url(#${id})`}}>{children}</AbsoluteFill>
      {bands.map((b, i) => (
        <AbsoluteFill key={i} style={{clipPath: `inset(${b.y0 * 100}% 0 ${Math.max(0, 100 - (b.y0 + b.h) * 100)}% 0)`, transform: `translateX(${b.dx}px)`}}>
          {children}
        </AbsoluteFill>
      ))}
      <Scanlines opacity={0.22} />
    </AbsoluteFill>
  );
};

/** CRT-ish scanlines overlay (also usable on its own at low opacity). */
export const Scanlines: React.FC<{opacity?: number; gap?: number}> = ({opacity = 0.15, gap = 4}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,.9) 0px, rgba(0,0,0,.9) ${gap / 2}px, transparent ${gap / 2}px, transparent ${gap}px)`,
    }}
  />
);

/** Expanding square pixel shock ring on impacts. */
export const ImpactRing: React.FC<{at: number; x: number; y: number; frames?: number; maxR?: number; unit?: number; color?: string}> = ({at, x, y, frames = 16, maxR = 700, unit = 12, color = C.paperHi}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + frames) return null;
  const p = tween(frame, at, at + frames, 0, 1, ease.outExpo);
  const r = Math.round((p * maxR) / unit) * unit;
  const th = Math.max(unit, Math.round(((1 - p) * unit * 3) / unit) * unit);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        boxShadow: `inset 0 0 0 ${th}px ${color}`,
        clipPath: `polygon(${unit * 2}px 0, calc(100% - ${unit * 2}px) 0, 100% ${unit * 2}px, 100% calc(100% - ${unit * 2}px), calc(100% - ${unit * 2}px) 100%, ${unit * 2}px 100%, 0 calc(100% - ${unit * 2}px), 0 ${unit * 2}px)`,
        opacity: (1 - p) * (1 - p),
        pointerEvents: 'none',
      }}
    />
  );
};

/** Darkening veil that ramps in (e.g. "拍 3–4 画面压暗蓄力"). */
export const Veil: React.FC<{from: number; to: number; max?: number; color?: string}> = ({from, to, max = 0.55, color = '#000'}) => {
  const frame = useCurrentFrame();
  const o = tween(frame, from, to, 0, max, ease.in);
  return o > 0 ? <AbsoluteFill style={{background: color, opacity: o, pointerEvents: 'none'}} /> : null;
};
