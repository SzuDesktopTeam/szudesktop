import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, hit, jitter as jitterAt, springAt, tween} from '../lib/anim';
import {EIGHTH} from '../lib/beat';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C} from '../theme/palette';

/**
 * Square "pixel" outline built from hard text-shadows (no blur), plus a hard drop shadow of
 * the outlined shape. Square ring offsets keep corners square like the font's pixel grid.
 */
export const pixelOutline = (width: number, color: string | null, shadowColor: string | null, shadowOffset: number) => {
  const out: string[] = [];
  const ring = (w: number, dx: number, dy: number, c: string) => {
    if (w <= 0) {
      out.push(`${dx}px ${dy}px 0 ${c}`);
      return;
    }
    const step = w >= 4 ? 2 : 1;
    for (let x = -w; x <= w; x += step) {
      for (let y = -w; y <= w; y += step) {
        if (Math.max(Math.abs(x), Math.abs(y)) === w) out.push(`${x + dx}px ${y + dy}px 0 ${c}`);
      }
    }
  };
  if (color && width > 0) ring(width, 0, 0, color);
  if (shadowColor && shadowOffset > 0) {
    ring(color ? width : 0, shadowOffset, shadowOffset, shadowColor);
    out.push(`${shadowOffset}px ${shadowOffset}px 0 ${shadowColor}`);
  }
  return out.join(', ');
};

export type TitleSegment = {
  text: string;
  color?: string;
  /** Local frame at which this segment's first character lands (defaults to running order). */
  at?: number;
  /** Optional highlight: from this local frame on, the segment switches to `litColor`. */
  litAt?: number;
  litColor?: string;
};

export type TitleMode = 'drop' | 'pop' | 'slam' | 'type' | 'rise' | 'none';

export type PixelTitleProps = {
  text: string | TitleSegment[];
  /** px; keep to multiples of 12 (Fusion Pixel grid). */
  size?: number;
  color?: string;
  outline?: string | null;
  outlineWidth?: number;
  shadow?: string | null;
  shadowOffset?: number;
  /** Local frame of the first character. */
  start?: number;
  /** Frames between characters (default: an 8th note). */
  stagger?: number;
  mode?: TitleMode;
  /** Drop height (px) for mode 'drop'. */
  dropFrom?: number;
  /** Integer jitter amplitude in px (0 = steady). */
  jitter?: number;
  jitterHold?: number;
  /** Continuous bob amplitude in px after landing. */
  wave?: number;
  /** Flash each character to paper-white as it lands. */
  flash?: boolean;
  /** Exit: characters leave from this local frame. */
  exitAt?: number;
  exitMode?: 'drop' | 'shrink' | 'fade' | 'up';
  exitStagger?: number;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
  style?: React.CSSProperties;
  /** Override the frame (e.g. to freeze); defaults to useCurrentFrame(). */
  frame?: number;
};

type Glyph = {ch: string; t0: number; color: string; seg: TitleSegment; idx: number};

/** Big Fusion Pixel title: per-character slam-in, square pixel outline, hard shadow, jitter. */
export const PixelTitle: React.FC<PixelTitleProps> = ({
  text,
  size = 96,
  color = C.paper,
  outline = C.lycheeDeep,
  outlineWidth = Math.max(4, Math.round(size / 24)),
  shadow = C.woodDark,
  shadowOffset = Math.max(6, Math.round(size / 16)),
  start = 0,
  stagger = EIGHTH,
  mode = 'drop',
  dropFrom = -120,
  jitter = 0,
  jitterHold = 4,
  wave = 0,
  flash = true,
  exitAt,
  exitMode = 'drop',
  exitStagger = 2,
  align = 'center',
  letterSpacing = 0,
  lineHeight = 1.15,
  style,
  frame: frameOverride,
}) => {
  const current = useCurrentFrame();
  const frame = frameOverride ?? current;
  const segments: TitleSegment[] = typeof text === 'string' ? [{text}] : text;
  const fullText = segments.map((s) => s.text).join('');
  useFontsFor(fullText, [700]);

  const glyphs: Glyph[] = [];
  let running = start;
  let idx = 0;
  for (const seg of segments) {
    let t = seg.at ?? running;
    for (const ch of Array.from(seg.text)) {
      const lit = seg.litAt !== undefined && frame >= seg.litAt;
      glyphs.push({ch, t0: t, color: lit ? seg.litColor ?? C.gold : seg.color ?? color, seg, idx});
      if (ch.trim()) t += stagger;
      idx++;
    }
    running = t;
  }
  const shadowCss = pixelOutline(outlineWidth, outline, shadow, shadowOffset);

  const renderGlyph = (g: Glyph) => {
    if (g.ch === '\n') return <br key={g.idx} />;
    const local = frame - g.t0;
    let ty = 0;
    let sc = 1;
    let op = 1;
    let rot = 0;
    if (mode !== 'none' && local < 0) op = 0;
    else if (mode === 'drop') {
      const p = springAt(frame, g.t0, {damping: 9, stiffness: 260, mass: 0.55});
      ty = (1 - p) * dropFrom;
      sc = 1 + (1 - p) * 0.4;
      op = tween(frame, g.t0, g.t0 + 2, 0, 1, ease.linear);
    } else if (mode === 'pop') {
      sc = springAt(frame, g.t0, {damping: 8, stiffness: 240, mass: 0.5});
    } else if (mode === 'slam') {
      sc = tween(frame, g.t0, g.t0 + 5, 3.2, 1, ease.outQuint) - hit(frame, g.t0 + 5, 6) * 0.08;
      op = tween(frame, g.t0, g.t0 + 3, 0, 1, ease.linear);
      rot = tween(frame, g.t0, g.t0 + 5, g.idx % 2 ? 8 : -8, 0, ease.out);
    } else if (mode === 'rise') {
      const p = springAt(frame, g.t0, {damping: 14, stiffness: 200});
      ty = (1 - p) * size * 0.6;
      op = tween(frame, g.t0, g.t0 + 4, 0, 1, ease.linear);
    }
    if (exitAt !== undefined) {
      const e0 = exitAt + g.idx * exitStagger;
      if (frame >= e0) {
        const q = tween(frame, e0, e0 + 10, 0, 1, ease.in);
        if (exitMode === 'drop') ty += q * size * 4;
        if (exitMode === 'up') ty -= q * size * 3;
        if (exitMode === 'shrink') sc *= 1 - q;
        op *= exitMode === 'fade' ? 1 - q : q >= 1 ? 0 : 1;
      }
    }
    let jx = 0;
    let jy = 0;
    if (jitter > 0 && local >= 0) {
      const j = jitterAt(frame, jitter, `${g.idx}`, jitterHold);
      jx = j.x;
      jy = j.y;
    }
    if (wave > 0 && local > 8) jy += Math.round(Math.sin((frame - g.t0) / 9 + g.idx * 0.7) * wave);
    const flashOn = flash && local >= 0 && local < 3 && mode !== 'none';
    const settled = Math.abs(ty) < 0.5 && Math.abs(sc - 1) < 0.005 && rot === 0;
    const y = settled ? Math.round(ty) + jy : ty + jy;
    return (
      <span
        key={g.idx}
        style={{
          display: 'inline-block',
          whiteSpace: 'pre',
          color: flashOn ? C.paperHi : g.color,
          opacity: op,
          transform: settled && !jx && !y ? undefined : `translate(${jx}px, ${y}px) scale(${sc}) rotate(${rot}deg)`,
          transformOrigin: '50% 90%',
          textShadow: shadowCss,
          willChange: 'transform',
        }}
      >
        {g.ch === ' ' ? ' ' : g.ch}
      </span>
    );
  };

  return (
    <div
      style={{
        fontFamily: FONT_PIXEL,
        fontSize: size,
        lineHeight,
        letterSpacing: `${letterSpacing}em`,
        textAlign: align,
        fontWeight: 400,
        WebkitFontSmoothing: 'none',
        fontKerning: 'none',
        ...style,
      }}
    >
      {glyphs.map(renderGlyph)}
    </div>
  );
};
