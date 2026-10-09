import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, keyframes, tween} from '../lib/anim';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C} from '../theme/palette';

/**
 * Companion speech bubble, styled 1:1 after desktop/electron/pet.html #bubble
 * (#FFFDF6 fill, 2px #6E1F35 border, 12px radius, 8/10px padding, 13px text #4A1A28,
 * shadow 0 4px 10px rgba(74,26,40,.28), 10×8 tail) multiplied by `scale`, and the
 * same bubble-pop keyframes (0.6 → 1.08 @60% → 1 over 0.28 s ≈ 17 frames).
 * Position: (x, y) is the tip of the tail.
 */
export const SpeechBubble: React.FC<{
  text: string;
  x: number;
  y: number;
  at?: number;
  outAt?: number;
  scale?: number;
  maxWidth?: number;
  /** Horizontal position of the tail along the bubble (0..1). */
  tail?: number;
}> = ({text, x, y, at = 0, outAt, scale = 2.5, maxWidth = 232, tail = 0.5}) => {
  const frame = useCurrentFrame();
  useFontsFor(text, [500]);
  if (frame < at) return null;
  const pop = keyframes(frame, [
    [at, 0.6],
    [at + 10, 1.08, ease.out],
    [at + 17, 1, ease.inOut],
  ]);
  let opacity = tween(frame, at, at + 11, 0, 1, ease.out);
  if (outAt !== undefined) opacity *= tween(frame, outAt, outAt + 8, 1, 0, ease.in);
  const s = scale;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-${tail * 100}%, -100%) translateY(${-8 * s}px) scale(${pop})`,
        transformOrigin: `${tail * 100}% 100%`,
        opacity,
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: maxWidth * s,
          width: 'max-content',
          boxSizing: 'border-box',
          background: C.bubble,
          border: `${2 * s * 0.75}px solid ${C.lycheeDeep}`,
          borderRadius: 12 * s,
          padding: `${8 * s}px ${10 * s}px`,
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize: 13 * s,
          lineHeight: 1.4,
          color: C.bubbleText,
          boxShadow: `0 ${4 * s}px ${10 * s}px rgba(74, 26, 40, .28)`,
          wordBreak: 'break-word',
        }}
      >
        {text}
        <div
          style={{
            position: 'absolute',
            left: `${tail * 100}%`,
            bottom: -8 * s,
            marginLeft: -5 * s,
            width: 10 * s,
            height: 8 * s,
            background: C.bubble,
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
          }}
        />
        <svg
          width={10 * s}
          height={8 * s + 2}
          viewBox="0 0 10 8"
          preserveAspectRatio="none"
          style={{position: 'absolute', left: `${tail * 100}%`, bottom: -8 * s - 1, marginLeft: -5 * s, overflow: 'visible'}}
        >
          <polyline points="0,0 5,8 10,0" fill="none" stroke={C.lycheeDeep} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{strokeWidth: 2 * s * 0.75}} />
        </svg>
      </div>
    </div>
  );
};
