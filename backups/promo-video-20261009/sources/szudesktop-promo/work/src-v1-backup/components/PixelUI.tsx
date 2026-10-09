import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, hit, springAt, tween} from '../lib/anim';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C} from '../theme/palette';
import {PixelSprite} from './PixelSprite';

/** clip-path polygon with stepped (2-step) pixel corners of unit `u` px. */
export const steppedCorners = (u: number) => {
  const a = `${u}px`;
  const b = `${u * 2}px`;
  const R = (v: string) => `calc(100% - ${v})`;
  return `polygon(${b} 0, ${R(b)} 0, ${R(b)} ${a}, ${R(a)} ${a}, ${R(a)} ${b}, 100% ${b}, 100% ${R(b)}, ${R(a)} ${R(b)}, ${R(a)} ${R(a)}, ${R(b)} ${R(a)}, ${R(b)} 100%, ${b} 100%, ${b} ${R(a)}, ${a} ${R(a)}, ${a} ${R(b)}, 0 ${R(b)}, 0 ${b}, ${a} ${b}, ${a} ${a}, ${b} ${a})`;
};

export type PixelPanelProps = {
  /** Fill colour. */
  fill?: string;
  /** Border colour (drawn as a stepped pixel frame). */
  border?: string;
  /** Inner highlight line colour (1 unit inside the border); null for none. */
  highlight?: string | null;
  /** Pixel unit in px (border thickness and corner step). */
  unit?: number;
  /** Hard shadow offset in px (deep wood). */
  shadow?: number;
  shadowColor?: string;
  padding?: number | string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** A pixel-art panel: stepped corners, solid border, inner highlight, hard shadow. */
export const PixelPanel: React.FC<PixelPanelProps> = ({
  fill = C.paper,
  border = C.wood,
  highlight = C.paperHi,
  unit = 6,
  shadow = 8,
  shadowColor = C.woodDark,
  padding = 24,
  style,
  children,
}) => {
  const clip = steppedCorners(unit);
  return (
    <div style={{position: 'relative', display: 'inline-block', ...style}}>
      {shadow ? <div style={{position: 'absolute', inset: 0, transform: `translate(${shadow}px, ${shadow}px)`, background: shadowColor, clipPath: clip}} /> : null}
      <div style={{position: 'absolute', inset: 0, background: border, clipPath: clip}} />
      <div style={{position: 'absolute', inset: unit, background: fill, clipPath: steppedCorners(unit)}} />
      {highlight ? (
        <div style={{position: 'absolute', left: unit * 2, right: unit * 2, top: unit, height: Math.max(2, unit / 2), background: highlight, opacity: 0.7}} />
      ) : null}
      <div style={{position: 'relative', padding}}>{children}</div>
    </div>
  );
};

/** Wooden sign with gold pixel text — section tags ("01 桌面伙伴"), download board. */
export const WoodSign: React.FC<{
  text: string;
  size?: number;
  color?: string;
  icon?: string;
  unit?: number;
  style?: React.CSSProperties;
}> = ({text, size = 48, color = C.gold, icon, unit = 6, style}) => {
  useFontsFor(text);
  return (
    <PixelPanel fill={C.wood} border={C.woodDark} highlight={C.woodLight} unit={unit} shadow={unit + 2} padding={`${Math.round(size * 0.28)}px ${Math.round(size * 0.5)}px`} style={style}>
      <div style={{display: 'flex', alignItems: 'center', gap: size * 0.3, fontFamily: FONT_PIXEL, fontSize: size, lineHeight: 1, color, whiteSpace: 'pre', textShadow: `${Math.max(2, unit / 2)}px ${Math.max(2, unit / 2)}px 0 ${C.woodDark}`}}>
        {icon ? <PixelSprite sprite={icon} scale={Math.max(2, Math.round(size / 16))} /> : null}
        <span>{text}</span>
      </div>
    </PixelPanel>
  );
};

/**
 * Section corner tag: slides in from the left on `at` with a wood "clack", stays put.
 * Storyboard: wood sign at top-left, gold Fusion Pixel 48px.
 */
export const CornerTag: React.FC<{text: string; at?: number; x?: number; y?: number; size?: number}> = ({text, at = 0, x = 56, y = 48, size = 48}) => {
  const frame = useCurrentFrame();
  const p = springAt(frame, at, {damping: 13, stiffness: 220});
  const tx = (1 - p) * -520;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translateX(${Math.round(tx)}px) rotate(${(1 - p) * -6}deg)`, transformOrigin: '0 50%'}}>
      <WoodSign text={text} size={size} />
    </div>
  );
};

/**
 * Wood-framed badge that slams down (trust badges, platform tiles):
 * scale 2.4 → 1 with a 4-frame rebound, icon on the left, pixel text.
 */
export const WoodBadge: React.FC<{
  text: string;
  icon?: string;
  at?: number;
  size?: number;
  fill?: string;
  textColor?: string;
  style?: React.CSSProperties;
}> = ({text, icon, at = 0, size = 72, fill = C.paper, textColor = C.ink, style}) => {
  const frame = useCurrentFrame();
  useFontsFor(text);
  if (frame < at) return null;
  const s = tween(frame, at, at + 6, 2.4, 1, ease.outQuint) - hit(frame, at + 6, 5) * 0.06;
  const op = tween(frame, at, at + 3, 0, 1, ease.linear);
  return (
    <div style={{display: 'inline-block', transform: `scale(${s})`, opacity: op, ...style}}>
      <PixelPanel fill={fill} border={C.wood} highlight={C.paperHi} unit={Math.round(size / 12)} shadow={Math.round(size / 8)} padding={`${Math.round(size * 0.3)}px ${Math.round(size * 0.45)}px`}>
        <div style={{display: 'flex', alignItems: 'center', gap: size * 0.3, fontFamily: FONT_PIXEL, fontSize: size, lineHeight: 1, color: textColor, whiteSpace: 'pre'}}>
          {icon ? <PixelSprite sprite={icon} scale={Math.round(size / 12)} /> : null}
          <span>{text}</span>
        </div>
      </PixelPanel>
    </div>
  );
};

/** Coin counter plaque (icon + rolling number) — bumps 2 px whenever the value increments. */
export const Counter: React.FC<{value: number; icon?: string; label?: string; size?: number; bumpAt?: number[]}> = ({value, icon = 'icon_coin', label, size = 60, bumpAt = []}) => {
  const frame = useCurrentFrame();
  const bump = bumpAt.reduce((m, a) => Math.max(m, hit(frame, a, 6)), 0);
  const text = `${label ?? ''}${Math.round(value)}`;
  useFontsFor(text);
  return (
    <div style={{display: 'inline-block', transform: `translateY(${-Math.round(bump * 4)}px) scale(${1 + bump * 0.05})`}}>
      <PixelPanel fill={C.woodDark} border={C.wood} highlight={null} unit={5} shadow={6} padding={`${size * 0.2}px ${size * 0.4}px`}>
        <div style={{display: 'flex', alignItems: 'center', gap: size * 0.25, fontFamily: FONT_PIXEL, fontSize: size, lineHeight: 1, color: C.gold}}>
          <PixelSprite sprite={icon} scale={Math.round(size / 14)} />
          <span>{text}</span>
        </div>
      </PixelPanel>
    </div>
  );
};
