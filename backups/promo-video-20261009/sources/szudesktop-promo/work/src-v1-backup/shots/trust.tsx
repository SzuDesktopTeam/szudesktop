/**
 * 06 放心用 — S26–S28 (46.875–52.500 s): Windows + macOS (preview) windows meet on the beat,
 * three wooden trust badges slam over the real 存档与隐私 settings, then the 324-frame
 * companion action wall pulls back from a single 荔宝 frame → 开源 · MIT.
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Layer} from '../components/Camera';
import {PixelDust, ParticleBurst} from '../components/ParticleBurst';
import {PetSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {BodyText} from '../components/BodyText';
import {CornerTag, WoodBadge} from '../components/PixelUI';
import {BlockDissolve, ImpactRing, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {useSpriteSrc} from '../lib/assets';
import {ease, keyframes, lerp, shake, tween} from '../lib/anim';
import {EIGHTH, SIXTEENTH, useShotClock} from '../lib/beat';
import {C, alpha} from '../theme/palette';
import {HomeWindow, winGeom} from './desktop';
import {At, Drift, WarmBG, footage} from './kit';
import {ShotComponent} from './registry';

/* ------------------------------------------------------------------ S26 */
export const S26: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const gl = winGeom(0, 0, 860);
  const meet = 12;
  const p = tween(f, -4, meet, 0, 1, ease.outBack);
  const lx = lerp(-900, 90, p);
  const rx = lerp(1920 + 200, 970, p);
  const ry = lerp(35, 8, tween(f, -4, meet, 0, 1, ease.out));
  const breathe = Math.sin(f / 20) * 1;
  const top = 250;
  const sh = shake(f, meet, 8, 10, 51, 1);
  return (
    <AbsoluteFill>
      <Camera zoom={tween(f, 0, at(4), 1.0, 1.05)} shake={sh}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_campus_1920x1080" blur={10} tint={0.45} zoom={1.25} />
        </Layer>
        <Layer depth={1}>
          <div style={{position: 'absolute', left: lx, top, transform: `perspective(1800px) rotateY(${ry + breathe}deg)`, transformOrigin: '100% 50%'}}>
            <div style={{position: 'relative', width: gl.w, height: gl.h}}>
              <HomeWindow g={gl} still="ui_home_lake.png" frame={0} />
            </div>
            <div style={{position: 'absolute', left: gl.w - 140, top: 6}}>
              <PetSprite species="libao" frame={f} scale={4} x={0} y={0} anchor="bottom" clips={[{action: 'idle', at: 0, step: 'native', loop: true}]} />
            </div>
          </div>
          <div style={{position: 'absolute', left: rx, top, transform: `perspective(1800px) rotateY(${-ry - breathe}deg)`, transformOrigin: '0% 50%'}}>
            <div style={{position: 'relative', width: gl.w, height: gl.h}}>
              <HomeWindow g={gl} variant="mac" still="ui_home_lake_mac.png" frame={0} />
            </div>
            <div style={{position: 'absolute', left: 150, top: 6}}>
              <PetSprite species="egret" frame={f} scale={7} x={0} y={0} anchor="bottom" flipX clips={[{action: 'idle', at: 0, step: 'native', loop: true}]} />
            </div>
          </div>
          <ImpactRing at={meet} x={960} y={top + gl.h / 2} frames={16} maxR={700} unit={12} />
        </Layer>
      </Camera>
      <At x={90} y={top + gl.h + 40} w={860} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle text={COPY.platforms[0]} size={96} start={at(2)} stagger={2} mode="slam" />
      </At>
      <At x={970} y={top + gl.h + 40} w={860} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle text={COPY.platforms[1]} size={96} start={at(2) + 4} stagger={2} mode="slam" color={C.gold} />
      </At>
      <CornerTag text={COPY.sections[5]} at={2} />
      <WhiteFlash at={meet} frames={1} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S27 */
export const TrustBadges: React.FC<{times: number[]; texts: readonly string[]; icons: string[]; vertical?: boolean}> = ({times, texts, icons, vertical}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const pos = vertical
    ? [
        {x: W / 2, y: 820},
        {x: W / 2, y: 1080},
        {x: W / 2, y: 1340},
      ]
    : [
        {x: 330, y: 720},
        {x: 960, y: 720},
        {x: 1590, y: 720},
      ];
  return (
    <>
      {texts.map((t, i) => {
        const sh = shake(f, times[i] + 5, 8, 10, 60 + i, 1);
        return (
          <React.Fragment key={t}>
            <div style={{position: 'absolute', left: pos[i].x + sh.x, top: pos[i].y + sh.y, transform: 'translate(-50%, -50%)'}}>
              <WoodBadge text={t} icon={icons[i]} at={times[i]} size={vertical ? 72 : 84} />
            </div>
            <PixelDust at={times[i] + 5} origin={{x: pos[i].x, y: pos[i].y + 60}} count={18} seed={`bd${i}`} spread={1.3} />
          </React.Fragment>
        );
      })}
    </>
  );
};

export const S27: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const sh = shake(f, 5, 8, 6, 70, 1);
  return (
    <AbsoluteFill>
      <Camera shake={sh} zoom={tween(f, 0, at(4), 1.04, 1.0)}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1920x1080" blur={10} tint={0.55} zoom={1.25} />
        </Layer>
        <Layer depth={0.8}>
          <div style={{position: 'absolute', left: 60, top: 40, transform: `perspective(1600px) rotateX(${tween(f, 0, at(4), 14, 8)}deg)`, transformOrigin: '50% 0%'}}>
            <Img src={footage('ui_settings_data.png')} style={{width: 1800, borderRadius: 10, boxShadow: `0 30px 60px ${alpha(C.woodDark, 0.5)}`}} />
          </div>
        </Layer>
        <Layer depth={1}>
          <AbsoluteFill style={{background: `linear-gradient(180deg, transparent 30%, ${alpha(C.woodDark, 0.7)} 60%)`}} />
        </Layer>
      </Camera>
      <Drift sprites={['icon_coin', 'icon_heart', 'icon_flower', 'crop_lychee']} count={18} seed="trust" scale={[3, 5]} opacity={0.45} area={{x: 0, y: 500, w: 1920, h: 580}} />
      <TrustBadges times={[0, at(1), at(2)]} texts={COPY.trustBadges} icons={['icon_chest', 'icon_shield', 'icon_book']} />
      <At center bottom={70}>
        <BodyText text={COPY.trustNote} size={40} weight={700} plate="ink" inAt={at(2) + 10} />
      </At>
      <CornerTag text={COPY.sections[5]} at={-30} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S28 */
/** The 324-frame action wall; phase cycles every 8th note so every cell animates. */
export const PetWall: React.FC<{frame: number; pull0: number; pull1: number; s1: number; vertical?: boolean}> = ({frame, pull0, pull1, s1, vertical}) => {
  const src = useSpriteSrc();
  const {width: W, height: H} = useVideoConfig();
  const phase = Math.floor(Math.max(0, frame) / (EIGHTH / 1)) % 6;
  const anchor = {x: 1088 + 52, y: 1082 + 56};
  const s0 = H / 116;
  const t = tween(frame, pull0, pull1, 0, 1, ease.inOut);
  const s = s0 * Math.pow(s1 / s0, t);
  const center = {x: lerp(anchor.x, 1080, t), y: lerp(anchor.y, vertical ? 1080 : 1080 + tween(frame, pull1, pull1 + 80, 0, -200), t)};
  const tilt = tween(frame, pull1, pull1 + 60, 0, vertical ? 6 : 10, ease.inOut);
  return (
    <AbsoluteFill style={{background: C.cellB, perspective: 1800, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: W / 2 - center.x * s, top: H / 2 - center.y * s, width: 2160 * s, height: 2160 * s, transform: `rotateX(${tilt}deg)`, transformOrigin: `${center.x * s}px ${center.y * s}px`}}>
        <Img src={src(`pet_wall_324_phase${phase}`)} style={{width: '100%', height: '100%', imageRendering: 'pixelated'}} />
      </div>
    </AbsoluteFill>
  );
};

export const S28: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const {width: W} = useVideoConfig();
  return (
    <AbsoluteFill>
      <PetWall frame={f} pull0={0} pull1={at(2)} s1={0.92} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, ${alpha(C.woodDark, 0.15)} 0%, ${alpha(C.woodDark, 0.72)} 100%)`, opacity: tween(f, at(1.5), at(2), 0, 1)}} />
      <At x={0} y={330} w={W} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle text={COPY.openSource} size={168} start={at(2)} stagger={3} mode="slam" color={C.gold} />
      </At>
      <At center y={590}>
        <BodyText text={COPY.openSourceSub} size={40} weight={900} color={C.paperHi} outline={C.lycheeDeep} inAt={at(2.5)} />
      </At>
      <ParticleBurst squares={[C.gold, C.paperHi]} count={30} at={at(2)} origin={{x: W / 2, y: 420}} seed="mit" speed={[8, 20]} angle={[-180, 180]} gravity={0.1} drag={0.06} scale={[8, 14]} life={[20, 34]} />
      <CornerTag text={COPY.sections[5]} at={-30} />
      <BlockDissolve at={at(4) - 12} steps={4} step={3} block={120} seed="wall-out">
        <WarmBG sprite="bg_campus_1920x1080" tint={0.35} pixelated />
      </BlockDissolve>
    </AbsoluteFill>
  );
};

export const _u = {SIXTEENTH, keyframes};
