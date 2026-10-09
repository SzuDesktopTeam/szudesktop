/**
 * 06 放心用 — S26–S28 (46.875–52.500 s): Windows + macOS (preview) windows meet on the beat,
 * three wooden trust badges slam over the real 存档与隐私 settings, then the 324-frame
 * companion action wall pulls back from a single 荔宝 frame → 开源 · MIT.
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Layer} from '../components/Camera';
import {PixelDust, ParticleBurst} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {BodyText} from '../components/BodyText';
import {CornerTag, WoodBadge} from '../components/PixelUI';
import {BlockDissolve, ImpactRing, SoftFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {Species, useSpriteSrc} from '../lib/assets';
import {ease, keyframes, lerp, shake, tween} from '../lib/anim';
import {EIGHTH, SIXTEENTH, useShotClock} from '../lib/beat';
import {C, alpha} from '../theme/palette';
import {HomeWindow, winGeom} from './desktop';
import {At, Drift, PaperCard, Rect, UICrop, WarmBG, footage} from './kit';
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
      <SoftFlash at={meet} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S27 */
export const TrustBadges: React.FC<{times: number[]; texts: readonly string[]; icons: string[]; vertical?: boolean; size?: number; y?: number}> = ({times, texts, icons, vertical, size, y = 560}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  // 16:9 (v2): 0.85× badges in one centred row, 60 px apart, inside the x 96–1824 title-safe area
  const pos = vertical
    ? [
        {x: W / 2, y: 820},
        {x: W / 2, y: 1060},
        {x: W / 2, y: 1300},
      ]
    : [
        {x: 960 - 580, y},
        {x: 960, y},
        {x: 960 + 580, y},
      ];
  return (
    <>
      {texts.map((t, i) => {
        const sh = shake(f, times[i] + 5, 8, 8, 60 + i, 1);
        return (
          <React.Fragment key={t}>
            <div style={{position: 'absolute', left: pos[i].x + sh.x, top: pos[i].y + sh.y, transform: 'translate(-50%, -50%)'}}>
              <WoodBadge text={t} icon={icons[i]} at={times[i]} size={size ?? (vertical ? 72 : 60)} from={vertical ? 2.4 : 1.8} />
            </div>
            <PixelDust at={times[i] + 5} origin={{x: pos[i].x, y: pos[i].y + 50}} count={22} seed={`bd${i}`} spread={1.3} />
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Settings → 存档与隐私: only the row of real buttons (导出庭院与待办 / 备份课程笔记 / 删除已保存凭据). */
const SETTINGS_FULL = {w: 1198, h: 288};
const SET_BTNS_L: Rect = {x: 24, y: 152, width: 300, height: 62};
const SET_BTNS_R: Rect = {x: 666, y: 194, width: 192, height: 60};

export const S27: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const sh = shake(f, 5, 8, 6, 70, 1);
  const times = [0, at(1), at(2)];
  const pets: Array<{sp: Species; s: number; prop: string; x: number}> = [
    {sp: 'libao', s: 6, prop: 'icon_chest', x: 380},
    {sp: 'egret', s: 9, prop: 'icon_shield', x: 960},
    {sp: 'chestnut', s: 13, prop: 'icon_book', x: 1540},
  ];
  return (
    <AbsoluteFill>
      <Camera shake={sh} zoom={tween(f, 0, at(4), 1.04, 1.0)}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1920x1080" blur={10} tint={0.55} zoom={1.25} />
        </Layer>
        <Layer depth={0.6}>
          {/* the whole 设置 page section, tilted, softened and darkened as a backdrop */}
          <div style={{position: 'absolute', left: -60, top: -40, width: 2040, transform: `perspective(1600px) rotateX(14deg)`, transformOrigin: '50% 0%', filter: 'blur(5px) brightness(0.62)'}}>
            <Img src={footage('ui_settings_data.viewport.png')} style={{width: 2040, display: 'block'}} />
          </div>
        </Layer>
      </Camera>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(C.woodDark, 0.15)} 0%, ${alpha(C.woodDark, 0.5)} 100%)`}} />
      {/* sharp: the real button row */}
      <div style={{position: 'absolute', left: 960, top: 210, transform: `translate(-50%, -50%) perspective(1400px) rotateX(${tween(f, 0, 16, 18, 6, ease.out)}deg)`}}>
        <PaperCard>
          <div style={{display: 'flex', alignItems: 'center', gap: 36, padding: '10px 26px'}}>
            <UICrop still="ui_settings_data.png" rect={SET_BTNS_L} k={2} full={SETTINGS_FULL} />
            <UICrop still="ui_settings_data.png" rect={SET_BTNS_R} k={2} full={SETTINGS_FULL} />
          </div>
        </PaperCard>
      </div>
      <Drift sprites={['icon_coin', 'icon_heart', 'icon_flower', 'crop_lychee']} count={14} seed="trust" scale={[3, 5]} opacity={0.4} area={{x: 0, y: 360, w: 1920, h: 720}} />
      <TrustBadges times={times} texts={COPY.trustBadges} icons={['icon_chest', 'icon_shield', 'icon_book']} />
      {/* one companion under each badge, holding that badge's prop */}
      {pets.map((p, i) => {
        if (f < times[i] + 4) return null;
        const up = tween(f, times[i] + 4, times[i] + 14, 160, 0, ease.outBack);
        return (
          <div key={p.sp} style={{position: 'absolute', left: p.x, top: 958 + up}}>
            <PetSprite species={p.sp} frame={f} scale={p.s} x={0} y={0} anchor="bottom" flipX={p.sp === 'egret'} clips={[{action: 'celebrate', at: times[i] + 4, step: 8}, {action: 'idle', at: times[i] + 52, step: 'native', loop: true}]} shadow={6} groundShadow />
            <PixelSprite sprite={p.prop} scale={6} x={(p.sp === 'libao' ? 150 : 130)} y={-30} anchor="bottom" shadow={5} />
          </div>
        );
      })}
      <At center bottom={28}>
        <BodyText text={COPY.trustNote} size={36} weight={700} plate="ink" inAt={at(2) + 10} />
      </At>
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
