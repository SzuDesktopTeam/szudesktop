/**
 * Shared building blocks for the film's shots: retimed footage, UI crops, real pet-window
 * bubbles, ambient sprite drift, headline / footnote placement, small pixel UI glyphs.
 * Everything renders real captured footage or the app's own pixel art.
 */
import React from 'react';
import {AbsoluteFill, Freeze, Img, OffthreadVideo, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, keyframes, tween} from '../lib/anim';
import {spriteSize, useSpriteSrc} from '../lib/assets';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {PixelSprite} from '../components/PixelSprite';

export type Rect = {x: number; y: number; width: number; height: number};

/** Frame counts of captured clips (manifest.json). */
export const CLIP_FRAMES: Record<string, number> = {
  clip_arcade_claim: 180,
  clip_arcade_merge_2048: 210,
  clip_build_picnic: 180,
  clip_farm_harvest: 210,
  clip_focus_claim: 150,
  clip_focus_start_timelapse: 228,
  clip_focus_todo_add: 180,
  clip_home_lake_live: 240,
  clip_home_skin_switch: 330,
  clip_net_diag: 180,
  clip_net_login: 280,
  clip_note_outline: 180,
  clip_note_to_todo: 172,
  clip_note_write: 238,
  clip_pet_room_care: 340,
  clip_scene_bookshop_dolly: 210,
  clip_scene_bookshop_dolly_v: 210,
  clip_scene_lake_dolly: 210,
  clip_scene_lake_dolly_v: 210,
  clip_scene_terrace_dolly: 210,
  clip_scene_terrace_dolly_v: 210,
};

export const footage = (file: string) => staticFile(`assets/footage/${file}`);

/**
 * Piecewise-linear retime: local frame → source frame. Before the first key the first source
 * frame is held; after the last key playback continues at `tailRate` (default 1×).
 */
export const retime = (f: number, keys: ReadonlyArray<readonly [number, number]>, tailRate = 1) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, s1] = keys[i];
    const [f0, s0] = keys[i - 1];
    if (f <= f1) return s0 + ((f - f0) / (f1 - f0)) * (s1 - s0);
  }
  const [fl, sl] = keys[keys.length - 1];
  return sl + (f - fl) * tailRate;
};

/** A captured clip shown at an explicit source frame (frame-exact; any retime / freeze). */
export const Vid: React.FC<{name: string; frame: number; style?: React.CSSProperties}> = ({name, frame, style}) => {
  const n = CLIP_FRAMES[name] ?? 1;
  const f = Math.max(0, Math.min(n - 1, Math.floor(frame + 1e-6)));
  return (
    <Freeze frame={f}>
      <OffthreadVideo src={footage(`${name}.mp4`)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', ...style}} />
    </Freeze>
  );
};

/**
 * A rectangular crop of a full-viewport capture (1600×900 CSS px, stored at 2×), drawn at `k`
 * screen px per CSS px. Media = a still (footage file name) or a clip at a source frame.
 */
export const UICrop: React.FC<{
  still?: string;
  clip?: string;
  frame?: number;
  rect: Rect;
  k: number;
  /** CSS size of the full media (default 1600×900). */
  full?: {w: number; h: number};
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({still, clip, frame = 0, rect, k, full = {w: 1600, h: 900}, style, children}) => (
  <div style={{position: 'relative', width: rect.width * k, height: rect.height * k, overflow: 'hidden', ...style}}>
    <div style={{position: 'absolute', left: -rect.x * k, top: -rect.y * k, width: full.w * k, height: full.h * k}}>
      {clip ? <Vid name={clip} frame={frame} /> : <Img src={footage(still!)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />}
    </div>
    {children}
  </div>
);

/** Real pet.html bubbles captured from the transparent pet window (2× PNGs). */
export const BUBBLES = {
  greet: {file: '01_libao_greet', w: 670},
  pat: {file: '02_libao_pat', w: 592},
  chestnut: {file: '03_chestnut_signature', w: 708},
  egret: {file: '04_egret_greeting', w: 708},
  focus: {file: '05_libao_focus', w: 670},
  harvest: {file: '06_libao_harvest', w: 748},
  outro: {file: '07_libao_greet2', w: 748},
} as const;
export type BubbleKey = keyof typeof BUBBLES;

/** Real bubble PNG with pet.html's pop (0.6 → 1.08 → 1 over 0.28 s); (x, y) = tail tip. */
export const ImgBubble: React.FC<{id: BubbleKey; x: number; y: number; at: number; outAt?: number; scale?: number}> = ({id, x, y, at, outAt, scale = 1}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  if (outAt !== undefined && frame > outAt + 8) return null;
  const b = BUBBLES[id];
  const w = b.w * scale;
  const h = 174 * scale;
  const pop = keyframes(frame, [
    [at, 0.6],
    [at + 10, 1.08, ease.out],
    [at + 17, 1, ease.inOut],
  ]);
  let op = tween(frame, at, at + 8, 0, 1, ease.out);
  if (outAt !== undefined) op *= tween(frame, outAt, outAt + 8, 1, 0, ease.in);
  return (
    <Img
      src={footage(`ui_pet_window_bubbles/${b.file}.bubble.png`)}
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h * 0.856,
        width: w,
        height: h,
        opacity: op,
        transform: `scale(${pop})`,
        transformOrigin: '50% 85.6%',
      }}
    />
  );
};

/** Slowly drifting real sprites (ambient particles). Deterministic, loops forever. */
export const Drift: React.FC<{
  sprites: ReadonlyArray<string>;
  count: number;
  seed: string;
  area?: {x: number; y: number; w: number; h: number};
  /** px per frame (negative = rising). */
  speed?: [number, number];
  scale?: [number, number];
  opacity?: number;
  sway?: number;
  spin?: boolean;
  frame?: number;
}> = ({sprites, count, seed, area, speed = [-0.8, -1.8], scale = [3, 6], opacity = 0.55, sway = 30, spin = false, frame: fo}) => {
  const cur = useCurrentFrame();
  const frame = fo ?? cur;
  const {width, height} = useVideoConfig();
  const A = area ?? {x: 0, y: 0, w: width, h: height};
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: count}).map((_, i) => {
        const r = (k: string) => random(`${seed}-${i}-${k}`);
        const key = sprites[i % sprites.length];
        const sc = Math.round(scale[0] + r('s') * (scale[1] - scale[0]));
        const v = speed[0] + r('v') * (speed[1] - speed[0]);
        const size = spriteSize(key);
        const span = A.h + size.h * sc * 2;
        const y0 = r('y') * span;
        let y = (y0 + v * frame) % span;
        if (y < 0) y += span;
        const x = A.x + r('x') * A.w + Math.sin(frame / (40 + r('p') * 40) + r('ph') * 6.28) * sway;
        const rot = spin ? Math.sin(frame / 30 + i) * 18 : 0;
        return (
          <div key={i} style={{position: 'absolute', left: Math.round(x), top: Math.round(A.y + y - size.h * sc), opacity: opacity * (0.6 + r('o') * 0.4), transform: rot ? `rotate(${rot}deg)` : undefined}}>
            <PixelSprite sprite={key} scale={sc} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Cover-fit background image (sprite key) with blur / warm tint and slow push. */
export const WarmBG: React.FC<{sprite: string; blur?: number; tint?: number; zoom?: number; x?: number; y?: number; dark?: number; pixelated?: boolean; color?: string}> = ({
  sprite,
  blur = 0,
  tint = 0.35,
  zoom = 1,
  x = 0,
  y = 0,
  dark = 0,
  pixelated = false,
  color = C.woodDark,
}) => {
  const src = useSpriteSrc();
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: C.woodDark}}>
      <Img
        src={src(sprite)}
        style={{
          position: 'absolute',
          left: -blur * 3,
          top: -blur * 3,
          width: `calc(100% + ${blur * 6}px)`,
          height: `calc(100% + ${blur * 6}px)`,
          objectFit: 'cover',
          transform: `translate(${-x}px, ${-y}px) scale(${zoom})`,
          filter: blur ? `blur(${blur}px)` : undefined,
          imageRendering: pixelated ? 'pixelated' : undefined,
        }}
      />
      {tint ? <AbsoluteFill style={{background: color, opacity: tint}} /> : null}
      {dark ? <AbsoluteFill style={{background: '#000', opacity: dark}} /> : null}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 50%, ${alpha(C.woodDark, 0.55)} 100%)`}} />
    </AbsoluteFill>
  );
};

/** Absolutely positioned box (for titles / captions) — integer coordinates. */
export const At: React.FC<{x?: number; y?: number; w?: number; right?: number; bottom?: number; center?: boolean; style?: React.CSSProperties; children: React.ReactNode}> = ({
  x,
  y,
  w,
  right,
  bottom,
  center,
  style,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x !== undefined ? Math.round(x) : center ? 0 : undefined,
      right: right !== undefined ? Math.round(right) : center ? 0 : undefined,
      top: y !== undefined ? Math.round(y) : undefined,
      bottom: bottom !== undefined ? Math.round(bottom) : undefined,
      width: w,
      display: center ? 'flex' : undefined,
      justifyContent: center ? 'center' : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Small ink-plate footnote (Noto Sans SC 500). */
export const Footnote: React.FC<{text: string; at?: number; size?: number; style?: React.CSSProperties}> = ({text, at, size = 26, style}) => {
  const frame = useCurrentFrame();
  useFontsFor(text, [500]);
  const op = at === undefined ? 1 : tween(frame, at, at + 8, 0, 1, ease.out);
  if (op <= 0) return null;
  return (
    <div
      style={{
        display: 'inline-block',
        fontFamily: FONT_BODY,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.3,
        color: C.paper,
        background: alpha(C.ink, 0.78),
        border: `2px solid ${alpha(C.paper, 0.22)}`,
        padding: `${Math.round(size * 0.25)}px ${Math.round(size * 0.55)}px`,
        borderRadius: 4,
        opacity: op,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** 4 pixel signal bars; `lit` bars glow (success green), the rest are dark. */
export const SignalBars: React.FC<{lit: number; unit?: number; color?: string; off?: string; flashAt?: number[]}> = ({lit, unit = 14, color = C.leafLight, off = alpha(C.paper, 0.18), flashAt = []}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: unit, filter: `drop-shadow(${unit / 2}px ${unit / 2}px 0 ${C.woodDark})`}}>
      {[0, 1, 2, 3].map((i) => {
        const on = i < lit;
        const fl = flashAt[i] !== undefined && frame >= flashAt[i] && frame < flashAt[i] + 4;
        return (
          <div
            key={i}
            style={{
              width: unit * 2,
              height: unit * (2 + i * 2),
              background: fl ? C.paperHi : on ? color : off,
              boxShadow: on ? `inset 0 ${unit / 2}px 0 ${alpha(C.paperHi, 0.45)}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
};

const GLYPHS: Record<'ok' | 'fail' | 'dot', string[]> = {
  ok: ['.......X', '......XX', 'X....XX.', 'XX..XX..', '.XXXX...', '..XX....'],
  fail: ['X....X', 'XX..XX', '.XXXX.', '.XXXX.', 'XX..XX', 'X....X'],
  dot: ['......', '......', '..XX..', '..XX..', '......', '......'],
};

/** Pixel ✓ / ✗ / · glyph (UI status mark). */
export const PixelMark: React.FC<{kind: 'ok' | 'fail' | 'dot'; unit?: number; color: string}> = ({kind, unit = 6, color}) => {
  const rows = GLYPHS[kind];
  const w = rows[0].length;
  return (
    <svg width={w * unit} height={rows.length * unit} viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" style={{display: 'block'}}>
      {rows.flatMap((row, y) => Array.from(row).map((ch, x) => (ch === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null)))}
    </svg>
  );
};

/** 2048 tile card (arcade.css style reconstruction with the real tile art), 336×342 at 1×. */
export const TileCard: React.FC<{value: number; size: number; style?: React.CSSProperties}> = ({value, size, style}) => {
  const src = useSpriteSrc();
  return <Img src={src(`tile_card_${value}`)} style={{width: size, height: (size * 342) / 336, display: 'block', imageRendering: 'pixelated', ...style}} />;
};

/** Pixel-art image (sprite key) at an explicit pixel size with nearest-neighbour sampling. */
export const PixImg: React.FC<{sprite: string; w: number; h?: number; style?: React.CSSProperties}> = ({sprite, w, h, style}) => {
  const src = useSpriteSrc();
  const s = spriteSize(sprite);
  return <Img src={src(sprite)} style={{width: w, height: h ?? (w * s.h) / s.w, display: 'block', imageRendering: 'pixelated', ...style}} />;
};

/** Paper-edged screenshot card with soft shadow (no 3D) for stacking / fanning. */
export const PaperCard: React.FC<{children: React.ReactNode; border?: number; radius?: number; style?: React.CSSProperties}> = ({children, border = 6, radius = 12, style}) => (
  <div
    style={{
      position: 'relative',
      background: C.paperHi,
      padding: border,
      borderRadius: radius,
      boxShadow: `0 22px 50px ${alpha(C.woodDark, 0.45)}, 0 4px 12px ${alpha(C.woodDark, 0.3)}`,
      ...style,
    }}
  >
    <div style={{position: 'relative', overflow: 'hidden', borderRadius: Math.max(0, radius - border)}}>{children}</div>
  </div>
);

/** Small helper: value of a decaying sine wobble (for idle floating). */
export const bob = (frame: number, period = 60, amp = 6, phase = 0) => Math.round(Math.sin((frame / period) * Math.PI * 2 + phase) * amp);
