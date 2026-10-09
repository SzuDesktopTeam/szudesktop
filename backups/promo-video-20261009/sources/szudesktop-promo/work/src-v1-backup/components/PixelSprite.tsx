import React from 'react';
import {Img} from 'remotion';
import {PET_META, PetAction, Species, petFrameKey, spriteSize, useSpriteSrc} from '../lib/assets';
import {FPS} from '../lib/beat';
import {PET_TIMINGS} from '../lib/pet-timings';
import {C, alpha} from '../theme/palette';

export type Anchor = 'top-left' | 'center' | 'bottom' | 'bottom-left' | 'bottom-right' | 'top';

const anchorShift: Record<Anchor, [number, number]> = {
  'top-left': [0, 0],
  top: [-0.5, 0],
  center: [-0.5, -0.5],
  bottom: [-0.5, -1],
  'bottom-left': [0, -1],
  'bottom-right': [-1, -1],
};

export type PixelSpriteProps = {
  /** Sprite key (see lib/assets.ts) — resolved under the current SpriteRoot. */
  sprite?: string;
  /** Or an explicit staticFile() URL (then pass w/h). */
  src?: string;
  w?: number;
  h?: number;
  /** Nearest-neighbour scale. Keep it an integer for even pixel widths. */
  scale?: number;
  /** If given, the sprite is absolutely positioned with its anchor at (x, y). */
  x?: number;
  y?: number;
  anchor?: Anchor;
  flipX?: boolean;
  rotate?: number;
  opacity?: number;
  /** Hard pixel drop shadow (deep wood) offset in screen px; 0 = none. */
  shadow?: number;
  /** Soft ground shadow ellipse under the sprite (like pet.html's drop-shadow). */
  groundShadow?: boolean;
  style?: React.CSSProperties;
};

/** A 1× PNG drawn at an integer scale with nearest-neighbour sampling. */
export const PixelSprite: React.FC<PixelSpriteProps> = ({
  sprite,
  src,
  w,
  h,
  scale = 1,
  x,
  y,
  anchor = 'top-left',
  flipX,
  rotate = 0,
  opacity = 1,
  shadow = 0,
  groundShadow,
  style,
}) => {
  const resolve = useSpriteSrc();
  const size = sprite ? spriteSize(sprite) : {w: w ?? 16, h: h ?? 16};
  const W = (w ?? size.w) * scale;
  const H = (h ?? size.h) * scale;
  const url = src ?? resolve(sprite!);
  const [ax, ay] = anchorShift[anchor];
  const positioned = x !== undefined || y !== undefined;
  const transforms = [
    positioned ? `translate(${ax * 100}%, ${ay * 100}%)` : '',
    rotate ? `rotate(${rotate}deg)` : '',
    flipX ? 'scaleX(-1)' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      style={{
        position: positioned ? 'absolute' : 'relative',
        left: positioned ? x ?? 0 : undefined,
        top: positioned ? y ?? 0 : undefined,
        width: W,
        height: H,
        transform: transforms || undefined,
        transformOrigin: `${-ax * 100}% ${-ay * 100}%`,
        opacity,
        ...style,
      }}
    >
      {groundShadow ? (
        <div
          style={{
            position: 'absolute',
            left: '12%',
            right: '12%',
            bottom: -H * 0.04,
            height: H * 0.08,
            borderRadius: '50%',
            background: alpha(C.woodDark, 0.28),
          }}
        />
      ) : null}
      <Img
        src={url}
        style={{
          position: 'absolute',
          inset: 0,
          width: W,
          height: H,
          imageRendering: 'pixelated',
          filter: shadow ? `drop-shadow(${shadow}px ${shadow}px 0 ${alpha(C.woodDark, 0.85)})` : undefined,
        }}
      />
    </div>
  );
};

export type PetClip = {
  action: PetAction;
  /** Local frame at which this clip starts. */
  at: number;
  /**
   * Frames per art frame (e.g. EIGHTH to "retime to 8th notes"), or 'native' to replay the
   * app's authored per-frame durations (pet-animation.mjs) scaled by the companion's tempo.
   */
  step?: number | 'native';
  loop?: boolean;
};

/** Which of the 6 art frames is showing for `clip` at local `frame`. */
export const petFrameIndex = (species: Species, clip: PetClip, frame: number): number => {
  const elapsed = Math.max(0, frame - clip.at);
  const timing = PET_TIMINGS[species][clip.action];
  const loop = clip.loop ?? timing?.loop ?? false;
  if (clip.step === 'native' || clip.step === undefined) {
    const ms = timing?.ms ?? [120, 120, 120, 120, 120, 120];
    const durs = ms.map((m) => (m / 1000) * FPS);
    const total = durs.reduce((a, b) => a + b, 0);
    let t = loop ? elapsed % total : Math.min(elapsed, total - 1e-6);
    for (let i = 0; i < durs.length; i++) {
      if (t < durs[i]) return i;
      t -= durs[i];
    }
    return durs.length - 1;
  }
  const i = Math.floor(elapsed / clip.step);
  return loop ? i % 6 : Math.min(i, 5);
};

export type PetSpriteProps = Omit<PixelSpriteProps, 'sprite' | 'src' | 'w' | 'h'> & {
  species: Species;
  /** One action, or a chain of clips (the latest clip whose `at` ≤ frame plays). */
  action?: PetAction;
  clips?: PetClip[];
  step?: number | 'native';
  loop?: boolean;
  frame: number;
};

/** A companion (荔宝 / 栗栗 / 小白 only) playing one of its 18 authored actions. */
export const PetSprite: React.FC<PetSpriteProps> = ({species, action = 'idle', clips, step, loop, frame, ...rest}) => {
  const list = clips ?? [{action, at: 0, step, loop}];
  const clip = [...list].reverse().find((c) => frame >= c.at) ?? list[0];
  const index = petFrameIndex(species, clip, frame);
  const meta = PET_META[species];
  return <PixelSprite sprite={petFrameKey(species, clip.action, index)} w={meta.w} h={meta.h} {...rest} />;
};
