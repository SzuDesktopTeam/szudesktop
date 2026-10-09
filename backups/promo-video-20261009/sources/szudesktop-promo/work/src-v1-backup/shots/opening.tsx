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
import {BodyText} from '../components/BodyText';
import {ImpactRing, WhipPan, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {PARTICLES, useSpriteSrc} from '../lib/assets';
import {ease, hit, keyframes, shake, springAt, tween} from '../lib/anim';
import {C, alpha} from '../theme/palette';
import {ShotComponent} from './registry';

const MOSAIC_STEPS: Array<[number, number]> = [
  [0, 96],
  [10, 64],
  [19, 48],
  [28, 32],
  [37, 16],
  [46, 8],
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
    const lyScale = 40;
    const landY = vertical ? 1240 : 900;
    const yAt = (t: number) => tween(t, 42, LAND, -60, landY, ease.in);
    const coinP = tween(f, 28, 46, 0, 1, ease.out);
    const sh = shake(f, 30, 26, 3 + (f / LAND) * 6, 11, 2);
    return (
      <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
        <AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px) scale(${zoom})`}}>
          <Img src={src(`bg_campus_${cover}_m${String(block).padStart(3, '0')}`)} style={{width: W, height: H, imageRendering: 'pixelated'}} />
        </AbsoluteFill>
        <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 55%, transparent 35%, ${alpha(C.woodDark, 0.6)} 100%)`}} />
        {/* coin blip on beat 2 */}
        {f >= 28 && f < 46 ? (
          <div style={{position: 'absolute', left: W / 2, top: H * 0.42 - coinP * 60, transform: `translate(-50%, -50%) scaleX(${Math.abs(Math.cos(coinP * Math.PI * 2))})`, opacity: 1 - coinP * coinP}}>
            <PixelSprite sprite="icon_coin" scale={10} shadow={6} />
          </div>
        ) : null}
        {f >= 28 ? <ParticleBurst squares={[C.gold, C.paperHi]} count={14} at={28} origin={{x: W / 2, y: H * 0.42}} seed="blip" speed={[6, 14]} angle={[-180, 180]} gravity={0.1} drag={0.12} scale={[8, 14]} life={[12, 20]} /> : null}
        {/* ground shadow of the incoming lychee */}
        {f >= 42 ? (
          <div
            style={{
              position: 'absolute',
              left: W / 2 - 260 * tween(f, 42, LAND, 0.3, 1),
              top: landY - 30,
              width: 520 * tween(f, 42, LAND, 0.3, 1),
              height: 60 * tween(f, 42, LAND, 0.3, 1),
              borderRadius: '50%',
              background: alpha(C.woodDark, 0.5),
            }}
          />
        ) : null}
        {[3, 2, 1].map((g) =>
          f - g * 1.5 >= 42 ? <PixelSprite key={g} sprite="brand_lychee" scale={lyScale} x={W / 2} y={yAt(f - g * 1.5)} anchor="bottom" opacity={0.16 * (4 - g)} /> : null,
        )}
        {f >= 42 ? <PixelSprite sprite="brand_lychee" scale={lyScale} x={W / 2} y={yAt(f)} anchor="bottom" shadow={14} /> : null}
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
          <PixelTitle text="荔枝庭院" size={216} start={70} stagger={14} mode="drop" dropFrom={-200} color={C.gold} />
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
          <PixelTitle text="荔枝庭院" size={144} start={70} stagger={14} mode="drop" dropFrom={-160} color={C.gold} />
        </div>
      )}
      {vertical ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 1500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
          <BodyText text={COPY.vertical.taglineLines[0]} size={60} weight={900} color={C.paperHi} outline={C.lycheeDeep} typeAt={160} typeStep={3} align="center" />
          <BodyText text={COPY.vertical.taglineLines[1]} size={60} weight={900} color={C.paperHi} outline={C.lycheeDeep} typeAt={160 + 30} typeStep={3} align="center" />
        </div>
      ) : (
        <div style={{position: 'absolute', left: 0, right: 0, top: 196, display: 'flex', justifyContent: 'center'}}>
          <BodyText text={COPY.tagline} size={52} weight={900} color={C.paperHi} outline={C.lycheeDeep} typeAt={170} typeStep={3} caret />
        </div>
      )}
      <WhiteFlash at={LAND} frames={2} fadeFrames={5} />
      <AbsoluteFill style={{background: C.paperHi, opacity: hit(f, LAND + 6, 10) * 0.25, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );

  return (
    <WhipPan at={218} frames={7} mode="out" direction="left" distance={W * 1.1} blur={70}>
      {hero}
    </WhipPan>
  );
};
