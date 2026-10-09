/**
 * S01–S03 / V01–V02 (0.000–3.750 s, frames 0–225): campus mosaic resolves, a giant pixel
 * lychee slams down, bursts into 荔宝 with real-sprite confetti, the title lands on the motif
 * notes, 栗栗 and 小白 slide in on the toms, tagline types out, whip-pan out.
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Layer} from '../components/Camera';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {ImpactRing, WhiteFlash} from '../components/Transitions';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {COPY} from '../copy';
import {PARTICLES, useSpriteSrc} from '../lib/assets';
import {ease, hit, keyframes, shake, springAt, tween} from '../lib/anim';
import {C, alpha} from '../theme/palette';
import {ShotComponent} from './registry';

// v2: the mosaic resolves to 8 px within 9 frames; the red lychee is on screen from frame 0.
const MOSAIC_STEPS: Array<[number, number]> = [
  [0, 24],
  [3, 16],
  [6, 12],
  [9, 8],
];

const LAND = 56;

/** Foreground flora tufts (real flora sprites) sliding in from one side. */
const FloraRow: React.FC<{side: 'left' | 'right'; y: number; inAt: number; width: number; scale?: number}> = ({side, y, inAt, width, scale = 12}) => {
  const f = useCurrentFrame();
  const p = springAt(f, inAt, {damping: 14, stiffness: 120});
  const off = (1 - p) * 420 * (side === 'left' ? -1 : 1);
  const keys = ['flora_tallgrass', 'flora_berrybush', 'flora_tallgrass', 'flora_tallgrass', 'flora_berrybush', 'flora_tallgrass'];
  return (
    <div style={{position: 'absolute', top: 0, left: 0, width, height: '100%', transform: `translateX(${Math.round(off)}px)`}}>
      {keys.map((k, i) => {
        const x = side === 'left' ? -20 + i * 70 : width - 110 - i * 70;
        const sc = scale + (i % 3 === 0 ? 2 : 0);
        return <PixelSprite key={i} sprite={k} scale={sc} x={x} y={y + (i % 2) * 26} anchor="bottom-left" />;
      })}
    </div>
  );
};

export const Opening: ShotComponent = ({vertical}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const src = useSpriteSrc();
  const cover = vertical ? '1080x1920' : '1920x1080';

  // ---------- S01: mosaic + lychee drop ----------
  if (f < LAND) {
    const block = [...MOSAIC_STEPS].reverse().find(([at]) => f >= at)![1];
    const zoom = tween(f, 0, LAND, 1, 1.04, ease.linear);
    const landY = vertical ? 1240 : 900;
    const y0 = vertical ? 700 : 420;
    const hover = vertical ? 800 : 500;
    // bottom of the lychee: drifts down through the upper third, then drops on beat 3
    const yAt = (t: number) => (t < 40 ? tween(t, 0, 40, y0, hover, ease.linear) : tween(t, 40, LAND, hover, landY, ease.in));
    const scAt = (t: number) => Math.round(tween(t, 0, LAND, 22, 40, ease.in));
    const wob = (t: number) => (t < 40 ? Math.sin(t / 6) * 4 : 0);
    const coinP = tween(f, 28, 46, 0, 1, ease.out);
    const sh = shake(f, 30, 26, 3 + (f / LAND) * 6, 11, 2);
    const lyTop = yAt(f) - 16 * scAt(f);
    return (
      <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
        <AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px) scale(${zoom})`}}>
          <Img src={src(`bg_campus_${cover}_m${String(block).padStart(3, '0')}`)} style={{width: W, height: H, imageRendering: 'pixelated'}} />
        </AbsoluteFill>
        <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 30%, ${alpha(C.woodDark, 0.62)} 100%)`}} />
        {/* coin blip out of the lychee on beat 2 */}
        {f >= 28 && f < 46 ? (
          <div style={{position: 'absolute', left: W / 2 + 120, top: lyTop - 20 - coinP * 90, transform: `translate(-50%, -50%) scaleX(${Math.abs(Math.cos(coinP * Math.PI * 2))})`, opacity: 1 - coinP * coinP}}>
            <PixelSprite sprite="icon_coin" scale={10} shadow={6} />
          </div>
        ) : null}
        {f >= 28 ? <ParticleBurst squares={[C.gold, C.paperHi]} count={14} at={28} origin={{x: W / 2 + 120, y: lyTop - 20}} seed="blip" speed={[6, 14]} angle={[-180, 180]} gravity={0.1} drag={0.12} scale={[8, 14]} life={[12, 20]} /> : null}
        {/* ground shadow of the incoming lychee */}
        {f >= 36 ? (
          <div
            style={{
              position: 'absolute',
              left: W / 2 - 260 * tween(f, 36, LAND, 0.3, 1),
              top: landY - 30,
              width: 520 * tween(f, 36, LAND, 0.3, 1),
              height: 60 * tween(f, 36, LAND, 0.3, 1),
              borderRadius: '50%',
              background: alpha(C.woodDark, 0.5),
            }}
          />
        ) : null}
        {/* motion trail */}
        {[4, 3, 2, 1].map((g) => {
          const t = f - g * (f >= 40 ? 1.5 : 3);
          return t >= 0 ? <PixelSprite key={g} sprite="brand_lychee" scale={scAt(t)} x={W / 2 + wob(t)} y={yAt(t)} anchor="bottom" opacity={0.13 * (5 - g)} /> : null;
        })}
        <PixelSprite sprite="brand_lychee" scale={scAt(f)} x={W / 2 + wob(f)} y={yAt(f)} anchor="bottom" shadow={14} rotate={f < 40 ? Math.sin(f / 9) * 4 : 0} />
      </AbsoluteFill>
    );
  }

  // ---------- S02–S03: hero ----------
  const zoom = keyframes(f, [
    [LAND, 1.0],
    [169, 1.08, ease.out],
    [225, 1.0, ease.inOut],
  ]);
  const roll = keyframes(f, [
    [LAND, 0],
    [169, -1.5, ease.out],
    [225, 0, ease.inOut],
  ]);
  const sh = shake(f, LAND, 8, 14, 3, 1);
  const sh2 = shake(f, 169, 5, 6, 4, 1);
  const sh3 = shake(f, 197, 5, 6, 5, 1);
  const shk = {x: sh.x + sh2.x + sh3.x, y: sh.y + sh2.y + sh3.y, rot: sh.rot};

  const L = vertical
    ? {libaoScale: 14, libaoX: 540, libaoBottom: 1430, catScale: 20, catX: 175, egScale: 12, egX: 905, petBottom: 1470, burstY: 1100}
    : {libaoScale: 14, libaoX: 960, libaoBottom: 1075, catScale: 24, catX: 400, egScale: 16, egX: 1530, petBottom: 1068, burstY: 700};

  const pop = springAt(f, LAND, {damping: 10, stiffness: 200, mass: 0.7});
  const libaoS = 0.25 + 0.75 * pop;
  const catIn = tween(f, 150, 169, vertical ? -500 : -700, 0, ease.out);
  const egIn = tween(f, 179, 197, vertical ? 500 : 700, 0, ease.out);

  // Title shrink (S03): 1 → 0.667 and lift.
  const shrink = tween(f, 169, 186, 0, 1, ease.inOut);

  const hero = (
    <AbsoluteFill style={{background: C.ink}}>
      <Camera zoom={zoom} rotate={roll} shake={shk} origin={{x: W / 2, y: H * 0.62}}>
        <Layer depth={0.35}>
          <Img src={src(`bg_campus_${cover}`)} style={{width: W, height: H, imageRendering: 'pixelated'}} />
          <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(C.woodDark, 0.45)} 0%, transparent 35%, transparent 70%, ${alpha(C.woodDark, 0.35)} 100%)`}} />
        </Layer>
        <Layer depth={1}>
          <ImpactRing at={LAND} x={L.libaoX} y={L.burstY} frames={18} maxR={vertical ? 900 : 1100} unit={14} />
          <ParticleBurst
            sprites={PARTICLES.harvest}
            count={40}
            at={LAND}
            origin={{x: L.libaoX, y: L.burstY}}
            seed="open-burst"
            speed={[16, 38]}
            angle={[-175, -5]}
            gravity={0.75}
            drag={0.02}
            scale={[5, 9]}
            life={[70, 120]}
            shadow={5}
          />
          {/* the three companions */}
          <div style={{position: 'absolute', left: L.libaoX, top: L.libaoBottom, transform: `scale(${libaoS})`, transformOrigin: '0 0'}}>
            <PetSprite
              species="libao"
              frame={f}
              scale={L.libaoScale}
              x={0}
              y={0}
              anchor="bottom"
              shadow={10}
              clips={[
                {action: 'celebrate', at: LAND, step: 7},
                {action: 'signature', at: 99, step: 12},
                {action: 'greet', at: 169, step: 9},
              ]}
            />
          </div>
          <PixelDust at={LAND + 2} origin={{x: L.libaoX, y: L.libaoBottom - 20}} count={26} seed="d0" spread={1.6} />
          {f >= 150 ? (
            <PetSprite
              species="chestnut"
              frame={f}
              scale={L.catScale}
              x={L.catX + catIn}
              y={L.petBottom}
              anchor="bottom"
              shadow={8}
              clips={[
                {action: 'walk', at: 150, step: 5, loop: true},
                {action: 'idle', at: 169, step: 14, loop: true},
              ]}
            />
          ) : null}
          <PixelDust at={169} origin={{x: L.catX, y: L.petBottom - 10}} count={18} seed="d1" />
          {f >= 179 ? (
            <PetSprite
              species="egret"
              frame={f}
              scale={L.egScale}
              x={L.egX + egIn}
              y={L.petBottom}
              anchor="bottom"
              flipX
              shadow={8}
              clips={[
                {action: 'walk', at: 179, step: 5, loop: true},
                {action: 'idle', at: 197, step: 14, loop: true},
              ]}
            />
          ) : null}
          <PixelDust at={197} origin={{x: L.egX, y: L.petBottom - 10}} count={18} seed="d2" />
        </Layer>
        <Layer depth={1.8}>
          <FloraRow side="left" y={H + 30} inAt={LAND + 4} width={W} scale={vertical ? 10 : 12} />
          <FloraRow side="right" y={H + 30} inAt={LAND + 8} width={W} scale={vertical ? 10 : 12} />
        </Layer>
      </Camera>

      {/* Title: szuDesktop lands with the impact, 荔/枝/庭/院 on the motif notes D5 F#5 A5 B5. */}
      {vertical ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: Math.round(150 - shrink * 30), transform: `scale(${1 - shrink * 0.14})`, transformOrigin: '50% 0'}}>
          <PixelTitle text="szuDesktop" size={168} start={LAND + 2} stagger={2} mode="slam" />
          <PixelTitle text="荔枝庭院" size={216} start={70} stagger={14} maxSpread={42} mode="drop" dropFrom={-200} color={C.gold} />
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: Math.round(70 - shrink * 30),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: 36,
            transform: `scale(${1 - shrink * 0.333})`,
            transformOrigin: '50% 0',
          }}
        >
          <PixelTitle text="szuDesktop" size={144} start={LAND + 2} stagger={2} mode="slam" />
          <PixelTitle text="·" size={144} start={LAND + 22} mode="pop" />
          <PixelTitle text="荔枝庭院" size={144} start={70} stagger={14} maxSpread={42} mode="drop" dropFrom={-160} color={C.gold} />
        </div>
      )}
      {/* v2 tagline: word groups pop in from beat 7 (2.813 s), complete by 3.0 s, held to the whip at 3.68 s */}
      {vertical ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 1446, display: 'flex', justifyContent: 'center'}}>
          <TaglinePlate size={56} lines={[[[COPY.vertical.taglineLines[0].slice(0, 4), 169], [COPY.vertical.taglineLines[0].slice(4), 173], [COPY.vertical.taglineLines[1], 177]]]} />
        </div>
      ) : (
        <div style={{position: 'absolute', left: 0, right: 0, top: 200, display: 'flex', justifyContent: 'center'}}>
          <TaglinePlate size={52} lines={[[[COPY.tagline.slice(0, 4), 169], [COPY.tagline.slice(4, 10), 173], [COPY.tagline.slice(10), 177]]]} />
        </div>
      )}
      <WhiteFlash at={LAND} frames={2} fadeFrames={5} />
      <AbsoluteFill style={{background: C.paperHi, opacity: hit(f, LAND + 6, 10) * 0.25, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );

  // v2: the whip into S04 / V03 is done at Film level (compositions/Film.tsx, continuous track).
  return hero;
};

/** Tagline on a 70 % deep-wood plate; each word group pops in (4 frames) at its own frame. */
const TaglinePlate: React.FC<{size: number; lines: Array<Array<[string, number]>>}> = ({size, lines}) => {
  const f = useCurrentFrame();
  const first = lines[0][0][1];
  const all = lines.flat().map(([t]) => t).join('');
  useFontsFor(all, [900]);
  if (f < first) return null;
  const plateIn = tween(f, first, first + 4, 0, 1, ease.out);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round(size * 0.1),
        padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.6)}px`,
        background: alpha(C.woodDark, 0.7 * plateIn),
        borderRadius: 14,
        boxShadow: `6px 6px 0 ${alpha(C.woodDark, 0.45 * plateIn)}`,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{display: 'flex', whiteSpace: 'nowrap'}}>
          {line.map(([text, at]) => {
            const s = f < at ? 0 : keyframes(f, [
              [at, 0.55],
              [at + 3, 1.08, ease.out],
              [at + 5, 1, ease.inOut],
            ]);
            return (
              <span
                key={text}
                style={{
                  display: 'inline-block',
                  fontFamily: FONT_BODY,
                  fontWeight: 900,
                  fontSize: size,
                  lineHeight: 1.25,
                  color: C.paperHi,
                  opacity: f < at ? 0 : tween(f, at, at + 2, 0, 1, ease.linear),
                  transform: s === 1 ? undefined : `scale(${s})`,
                  transformOrigin: '50% 70%',
                  textShadow: `4px 4px 0 ${C.lycheeDeep}`,
                }}
              >
                {text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
