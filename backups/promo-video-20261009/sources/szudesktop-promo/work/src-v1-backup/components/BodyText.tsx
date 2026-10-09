import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, tween} from '../lib/anim';
import {SIXTEENTH} from '../lib/beat';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';

export type BodyTextProps = {
  text: string;
  size?: number;
  weight?: 500 | 700 | 900;
  color?: string;
  /** Typewriter: first character appears at `typeAt`, one char per `typeStep` frames (16th). */
  typeAt?: number;
  typeStep?: number;
  /** Show a blinking caret while typing. */
  caret?: boolean;
  /** Simple fade/slide-in at this frame (ignored when typing). */
  inAt?: number;
  outAt?: number;
  /** Paper plate behind the text (caption chip). */
  plate?: 'paper' | 'wood' | 'ink' | null;
  /** Thin hard outline for legibility over busy footage. */
  outline?: string | null;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  maxWidth?: number;
  style?: React.CSSProperties;
};

const plates: Record<'paper' | 'wood' | 'ink', React.CSSProperties> = {
  paper: {background: C.paper, color: C.ink, border: `3px solid ${C.line}`, boxShadow: `4px 4px 0 ${alpha(C.woodDark, 0.6)}`},
  wood: {background: C.wood, color: C.gold, border: `3px solid ${C.woodDark}`, boxShadow: `4px 4px 0 ${C.woodDark}`},
  ink: {background: alpha(C.ink, 0.82), color: C.paper, border: `2px solid ${alpha(C.paper, 0.25)}`},
};

/** Noto Sans SC body / caption text, optionally typed out on the 16th-note grid. */
export const BodyText: React.FC<BodyTextProps> = ({
  text,
  size = 44,
  weight = 700,
  color = C.paper,
  typeAt,
  typeStep = SIXTEENTH,
  caret = false,
  inAt,
  outAt,
  plate = null,
  outline = null,
  align = 'left',
  lineHeight = 1.35,
  maxWidth,
  style,
}) => {
  const frame = useCurrentFrame();
  useFontsFor(text, [weight]);
  const chars = Array.from(text);
  let shown = text;
  let opacity = 1;
  let dy = 0;
  if (typeAt !== undefined) {
    const n = frame < typeAt ? 0 : Math.min(chars.length, Math.floor((frame - typeAt) / typeStep) + 1);
    shown = chars.slice(0, n).join('');
    if (n === 0) opacity = 0;
  } else if (inAt !== undefined) {
    opacity = tween(frame, inAt, inAt + 8, 0, 1, ease.out);
    dy = tween(frame, inAt, inAt + 10, 24, 0, ease.outBack);
  }
  if (outAt !== undefined) opacity *= tween(frame, outAt, outAt + 8, 1, 0, ease.in);
  const typing = typeAt !== undefined && shown.length < text.length;
  const caretOn = caret && (typing || Math.floor(frame / 16) % 2 === 0);
  const outlineCss = outline
    ? [-2, 0, 2].flatMap((x) => [-2, 0, 2].map((y) => `${x}px ${y}px 0 ${outline}`)).join(', ')
    : undefined;
  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        color,
        textAlign: align,
        maxWidth,
        opacity,
        transform: dy ? `translateY(${dy}px)` : undefined,
        textShadow: outlineCss,
        whiteSpace: 'pre-wrap',
        ...(plate ? {...plates[plate], padding: `${Math.round(size * 0.22)}px ${Math.round(size * 0.45)}px`, borderRadius: 6, display: 'inline-block'} : {}),
        ...style,
      }}
    >
      {/* Invisible remainder keeps layout stable while typing. */}
      <span>{shown}</span>
      {caretOn ? <span style={{display: 'inline-block', width: Math.max(3, size * 0.08), height: size * 0.95, background: 'currentColor', verticalAlign: 'text-bottom', marginLeft: 2}} /> : null}
      {typeAt !== undefined ? <span style={{visibility: 'hidden'}}>{text.slice(shown.length)}</span> : null}
    </div>
  );
};
