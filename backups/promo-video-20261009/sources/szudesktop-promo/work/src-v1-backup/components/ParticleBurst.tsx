import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, rand} from '../lib/anim';
import {spriteSize} from '../lib/assets';
import {C} from '../theme/palette';
import {PixelSprite} from './PixelSprite';

type Vec = {x: number; y: number};

export type ParticleMode =
  /** Radial explosion biased by `angle`, with gravity (default). */
  | 'burst'
  /** Narrow upward fountain. */
  | 'fountain'
  /** Particles fall from the top of `area` (confetti / coin rain). */
  | 'rain'
  /** Particles fly from origin along an arc into `target` (coins into a counter). */
  | 'attract';

export type ParticleBurstProps = {
  /** Sprite keys used round-robin (real app art: crops, coins, hearts…). */
  sprites?: ReadonlyArray<string>;
  /** Or plain pixel squares (dust / sparks) in these colours. */
  squares?: ReadonlyArray<string>;
  count: number;
  /** Local frame of the burst. */
  at: number;
  origin: Vec;
  mode?: ParticleMode;
  seed?: string | number;
  /** Initial speed range in px/frame. */
  speed?: [number, number];
  /** Emission angle range in degrees (0 = right, -90 = up). */
  angle?: [number, number];
  gravity?: number;
  /** Fraction of velocity lost per frame. */
  drag?: number;
  /** Integer scale range for sprites, or px size range for squares. */
  scale?: [number, number];
  /** Max spin in deg/frame (0 keeps pixels axis-aligned and crisp). */
  spin?: number;
  /** Coin-style flip (scaleX oscillation) instead of rotation. */
  flip?: boolean;
  life?: [number, number];
  /** Frames over which particles fade at the end of their life. */
  fade?: number;
  /** Frames between successive spawns (rain / attract). */
  stagger?: number;
  /** attract: destination and flight time. */
  target?: Vec;
  flight?: number;
  /** rain: spawn area. */
  area?: {x: number; y: number; w: number; h: number};
  /** Hard drop shadow on sprites. */
  shadow?: number;
  style?: React.CSSProperties;
};

type P = {key?: string; color?: string; x: number; y: number; scale: number; rot: number; flipX: number; opacity: number};

/** Precomputed spawn parameters for particle i (deterministic). */
const spawn = (i: number, p: ParticleBurstProps) => {
  const s = `${p.seed ?? 'pb'}-${i}`;
  const [a0, a1] = p.angle ?? (p.mode === 'fountain' ? [-110, -70] : [-180, 0]);
  const [v0, v1] = p.speed ?? (p.mode === 'fountain' ? [18, 32] : [10, 30]);
  const [s0, s1] = p.scale ?? (p.squares ? [6, 12] : [4, 8]);
  const [l0, l1] = p.life ?? [50, 90];
  return {
    angle: (rand(`${s}a`, a0, a1) * Math.PI) / 180,
    speed: rand(`${s}v`, v0, v1),
    scale: p.squares ? Math.round(rand(`${s}s`, s0, s1) / 2) * 2 : Math.round(rand(`${s}s`, s0, s1 + 0.999) - 0.5),
    life: rand(`${s}l`, l0, l1),
    spin: rand(`${s}r`, -1, 1) * (p.spin ?? 0),
    delay: (p.stagger ?? 0) * i + (p.stagger ? rand(`${s}d`, 0, p.stagger * 0.8) : 0),
    jx: rand(`${s}x`, 0, 1),
    jy: rand(`${s}y`, 0, 1),
    arc: rand(`${s}c`, -1, 1),
    phase: rand(`${s}p`, 0, Math.PI * 2),
  };
};

/** Frame (local) at which attract-particle i lands on the target — drive counters with this. */
export const attractArrival = (i: number, p: Pick<ParticleBurstProps, 'at' | 'stagger' | 'flight' | 'seed'>) => {
  const s = `${p.seed ?? 'pb'}-${i}`;
  const delay = (p.stagger ?? 0) * i + (p.stagger ? rand(`${s}d`, 0, p.stagger * 0.8) : 0);
  return p.at + delay + (p.flight ?? 30);
};

/** Particle explosion / fountain / rain / attract made only of real sprites or pixel squares. */
export const ParticleBurst: React.FC<ParticleBurstProps> = (props) => {
  const frame = useCurrentFrame();
  const {count, at, origin, mode = 'burst', gravity = mode === 'rain' ? 0.35 : 0.9, drag = 0.03, fade = 12, sprites, squares} = props;
  if (frame < at) return null;
  const parts: P[] = [];
  const k = 1 - drag;
  for (let i = 0; i < count; i++) {
    const sp = spawn(i, props);
    const t = frame - at - sp.delay;
    if (t < 0) continue;
    const key = sprites ? sprites[i % sprites.length] : undefined;
    const color = squares ? squares[i % squares.length] : undefined;
    let x = origin.x;
    let y = origin.y;
    let opacity = 1;
    let scaleMul = 1;
    if (mode === 'attract') {
      const flight = props.flight ?? 30;
      const q = Math.min(1, t / flight);
      if (t > flight + 1) continue;
      const e = ease.in(q);
      const tg = props.target ?? origin;
      const mx = (origin.x + tg.x) / 2;
      const my = (origin.y + tg.y) / 2;
      const dx = tg.x - origin.x;
      const dy = tg.y - origin.y;
      // Control point: lifted and pushed sideways so each coin takes its own arc.
      const cx = mx - dy * 0.35 * sp.arc + (sp.jx - 0.5) * 220;
      const cy = my - Math.abs(dx) * 0.45 - sp.jy * 260;
      const ox = origin.x + (sp.jx - 0.5) * 90;
      const oy = origin.y + (sp.jy - 0.5) * 50;
      x = (1 - e) * (1 - e) * ox + 2 * (1 - e) * e * cx + e * e * tg.x;
      y = (1 - e) * (1 - e) * oy + 2 * (1 - e) * e * cy + e * e * tg.y;
      scaleMul = 1 - 0.35 * e;
    } else {
      if (t > sp.life) continue;
      let vx = Math.cos(sp.angle) * sp.speed;
      let vy = Math.sin(sp.angle) * sp.speed;
      if (mode === 'rain') {
        const a = props.area ?? {x: 0, y: -200, w: 1920, h: 100};
        x = a.x + sp.jx * a.w;
        y = a.y + sp.jy * a.h;
        vx = (sp.jx - 0.5) * 4;
        vy = sp.speed * 0.3;
      }
      // Integrate (closed loops are cheap: ≤ ~120 frames × count).
      const steps = Math.floor(t);
      for (let s = 0; s < steps; s++) {
        x += vx;
        y += vy;
        vx *= k;
        vy = vy * k + gravity;
      }
      const fr = t - steps;
      x += vx * fr;
      y += vy * fr;
      opacity = t > sp.life - fade ? Math.max(0, (sp.life - t) / fade) : 1;
    }
    const rot = sp.spin * t;
    const flipX = props.flip ? Math.max(0.15, Math.abs(Math.cos(sp.phase + t * 0.35))) : 1;
    parts.push({key, color, x, y, scale: sp.scale * scaleMul, rot, flipX, opacity});
  }
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', ...props.style}}>
      {parts.map((p, i) => {
        if (p.color) {
          const s = Math.max(2, Math.round(p.scale));
          return (
            <div
              key={i}
              style={{position: 'absolute', left: Math.round(p.x - s / 2), top: Math.round(p.y - s / 2), width: s, height: s, background: p.color, opacity: p.opacity}}
            />
          );
        }
        const size = spriteSize(p.key!);
        const sc = props.mode === 'attract' ? p.scale : Math.max(1, Math.round(p.scale));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: Math.round(p.x - (size.w * sc) / 2),
              top: Math.round(p.y - (size.h * sc) / 2),
              opacity: p.opacity,
              transform: p.rot || p.flipX !== 1 ? `rotate(${p.rot}deg) scaleX(${p.flipX})` : undefined,
            }}
          >
            <PixelSprite sprite={p.key} scale={sc} shadow={props.shadow} />
          </div>
        );
      })}
    </div>
  );
};

/** Paper-coloured 2×2 pixel dust puff (landings, slams). */
export const PixelDust: React.FC<{at: number; origin: Vec; count?: number; seed?: string | number; spread?: number; colors?: ReadonlyArray<string>}> = ({
  at,
  origin,
  count = 18,
  seed = 'dust',
  spread = 1,
  colors = [C.paper, C.paperHi, C.line],
}) => (
  <ParticleBurst
    squares={colors}
    count={count}
    at={at}
    origin={origin}
    seed={seed}
    angle={[-175, -5]}
    speed={[4 * spread, 13 * spread]}
    gravity={0.55}
    drag={0.08}
    scale={[6, 12]}
    life={[18, 34]}
    fade={10}
  />
);
