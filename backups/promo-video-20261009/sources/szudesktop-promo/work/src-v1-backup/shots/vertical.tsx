/**
 * Vertical 9:16 cut (30 s / 16 bars): V03–V13. Same real footage and sprites as the 16:9
 * film, re-framed for 1080×1920 and re-timed to the 9:16 score (assets/audio manifest 9x16).
 */
import React from 'react';
import {AbsoluteFill, Freeze, Img, useCurrentFrame} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Card3D, Layer} from '../components/Camera';
import {DesktopScene} from '../components/Desktop';
import {NativeMenu, petMenuItems} from '../components/NativeMenu';
import {ParticleBurst, PixelDust, attractArrival} from '../components/ParticleBurst';
import {PixelCursor} from '../components/PixelCursor';
import {PetClip, PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {Counter} from '../components/PixelUI';
import {BlackHold, ImpactRing, Veil, WhipPan, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, keyframes, lerp, shake, tween} from '../lib/anim';
import {EIGHTH, useShotClock} from '../lib/beat';
import {C, alpha} from '../theme/palette';
import {HomeWindow, SwitchPet, clampFocus, winGeom} from './desktop';
import {camAt} from './focus';
import {At, Footnote, ImgBubble, Rect, SignalBars, UICrop, Vid, WarmBG, footage, retime} from './kit';
import {DiagList, NetBG, NetFootnote} from './net';
import {nbPoint} from './notes';
import {ShotComponent} from './registry';
import {PetWall, TrustBadges} from './trust';
import {ArcadeClaim, Board2048, BuildPicnic} from './world';
import {EndCard} from './ending';

const VW = 1080;
const VH = 1920;
const camV = (c: {x: number; y: number}, z: number) => ({zoom: z, x: z * (c.x - VW / 2), y: z * (c.y - VH / 2)});

const VBG: React.FC<{frame: number; sprite?: string; tint?: number}> = ({frame, sprite = 'bg_campus_1080x1920', tint = 0.5}) => <WarmBG sprite={sprite} blur={10} tint={tint} zoom={1.25 + frame * 0.0005} />;

const Head: React.FC<{text: string; at: number; y?: number; size?: number; color?: string; mode?: 'drop' | 'slam' | 'pop'}> = ({text, at, y = 150, size = 120, color, mode = 'drop'}) => (
  <At x={0} y={y} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
    <PixelTitle text={text} size={size} start={at} stagger={4} mode={mode} color={color} />
  </At>
);

/* ------------------------------------------------------------------ V03–V04 desktop */
export const VDesktop: ShotComponent = () => {
  const f = useCurrentFrame();
  const g = winGeom(40, 420, 1000);
  const perch = {x: g.x + g.w - 130, y: g.y + 6};
  const rest = {x: 760, y: 1846};
  let petX = perch.x;
  let petY = perch.y;
  if (f < 28) {
    const t = tween(f, 16, 28, 0, 1, ease.out);
    petX = lerp(perch.x - 120, perch.x, t);
    petY = lerp(g.y + 400, perch.y, t) - Math.sin(t * Math.PI) * 160;
  }
  const dT = tween(f, 56, 77, 0, 1, ease.inOut);
  if (f >= 56) {
    petX = lerp(perch.x, rest.x, dT);
    petY = lerp(perch.y, rest.y, dT) - Math.sin(dT * Math.PI) * 200;
  }
  const ticks = [77, 84, 91, 98, 105];
  const nT = ticks.filter((t) => f >= t).length;
  const petScale = 4 * (1 + nT * 0.1);
  const z = keyframes(f, [
    [0, 0.94],
    [40, 1.0, ease.out],
    [100, 1.0],
    [113, 1.45, ease.inOut],
    [225, 1.55],
  ]);
  const focus = f < 100 ? {x: VW / 2, y: VH / 2} : {x: lerp(VW / 2, rest.x - 120, tween(f, 100, 113, 0, 1, ease.inOut)), y: lerp(VH / 2, rest.y - 320, tween(f, 100, 113, 0, 1, ease.inOut))};
  const c = clampFocus(focus, z, VW, VH);
  const cam = {zoom: z, x: c.x, y: c.y};
  const menuState = {name: '荔宝', lv: 3, hunger: 80, mood: 85, energy: 85, food: 3, scalePct: 150};
  const menuX = 380;
  const menuY = 1200;
  const ms = 1.5;
  const libaoClips: PetClip[] = [
    {action: 'greet', at: 16, step: 9},
    {action: 'look', at: 56, step: 7, loop: true},
    {action: 'pat', at: 77, step: 7},
    {action: 'idle', at: 106, step: 'native', loop: true},
    {action: 'pat', at: 113, step: 7},
  ];
  const desktop = (
    <DesktopScene width={VW} height={VH} bezel={f < 60 ? 24 : 0} date="2026/10/13" blur={1.2}>
      <div style={{position: 'absolute', inset: 0, opacity: tween(f, 0, 6, 0, 1), transform: `perspective(1600px) rotateY(${tween(f, 0, 20, -18, 0, ease.outBack)}deg)`, transformOrigin: `${g.x + g.w / 2}px ${g.y + g.h / 2}px`}}>
        <HomeWindow g={g} frame={f + 30} />
      </div>
      {f >= 16 && f < 113 ? <PetSprite species="libao" frame={f} scale={petScale} x={petX} y={petY} anchor="bottom" clips={libaoClips} groundShadow={f >= 77} /> : null}
      {f >= 113 ? (
        <SwitchPet
          frame={f}
          x={rest.x}
          bottom={rest.y}
          seq={[
            {species: 'libao', at: 113, scale: 6, clips: [{action: 'pat', at: 113, step: 7}]},
            {species: 'chestnut', at: 141, scale: 15, clips: [{action: 'signature', at: 141, step: 6}]},
            {species: 'egret', at: 169, scale: 10, clips: [{action: 'signature', at: 169, step: 6}]},
            {species: 'libao', at: 197, scale: 6, clips: [{action: 'celebrate', at: 197, step: 6}]},
          ]}
        />
      ) : null}
      <PixelDust at={28} origin={perch} count={12} seed="vperch" />
      <PixelDust at={77} origin={rest} count={14} seed="vrest" />
      <ParticleBurst sprites={['icon_heart']} count={6} at={113} origin={{x: rest.x, y: rest.y - 300}} seed="vhearts" mode="fountain" speed={[7, 12]} angle={[-120, -60]} gravity={0.12} scale={[4, 5]} life={[40, 56]} shadow={3} />
      <ImgBubble id="greet" x={perch.x - 60} y={perch.y - 232} at={28} outAt={52} scale={0.85} />
      <ImgBubble id="chestnut" x={rest.x - 90} y={rest.y - 350} at={148} outAt={166} scale={0.8} />
      <ImgBubble id="egret" x={rest.x - 90} y={rest.y - 350} at={176} outAt={194} scale={0.8} />
      <NativeMenu items={petMenuItems(menuState)} x={menuX} y={menuY} at={104} closeAt={113} highlight={4} scale={ms} />
      <PixelCursor
        path={[
          [36, 700, 900],
          [54, perch.x, perch.y - 110],
          ...Array.from({length: 7}).map((_, i) => {
            const t = ease.inOut(i / 6);
            return [56 + (i / 6) * 21, lerp(perch.x, rest.x, t), lerp(perch.y, rest.y, t) - Math.sin(t * Math.PI) * 200 - 110] as const;
          }),
          [100, rest.x + 20, rest.y - 160],
          [110, menuX + 110, menuY + 4 * ms + 12 * ms + (24 * 4 + 8.5) * ms],
          [113, menuX + 110, menuY + 4 * ms + 12 * ms + (24 * 4 + 8.5) * ms],
          [140, menuX + 60, menuY + 200],
        ]}
        clicks={[56, 113]}
        scale={4}
        inAt={36}
      />
    </DesktopScene>
  );
  const nameSeg = (txt: string, lit: number) => ({text: txt, litAt: lit, litColor: C.gold, color: alpha(C.paper, 0.55)});
  return (
    <AbsoluteFill style={{background: C.woodDark}}>
      <WhipPan at={0} frames={8} mode="in" direction="left" distance={VW * 1.1} blur={60}>
        <AbsoluteFill>
          <Camera {...cam} tiltX={tween(f, 0, 40, 5, 0, ease.out)} background={C.woodDark}>
            <Layer depth={0.25}>
              <WarmBG sprite="bg_courtyard_1080x1920" blur={14} tint={0.55} zoom={1.3} />
            </Layer>
            <Layer depth={1}>{desktop}</Layer>
          </Camera>
          {f < 113 ? (
            <>
              <At x={0} y={1180} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
                <PixelTitle text={COPY.vertical.pet} size={120} start={8} stagger={5} mode="drop" exitAt={106} exitMode="up" exitStagger={1} />
              </At>
              <At center y={1340}>
                <BodyText text={COPY.vertical.petDrag} size={60} weight={900} plate="paper" inAt={56} outAt={104} />
              </At>
            </>
          ) : (
            <At x={0} y={180} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
              <PixelTitle text={[nameSeg('荔宝', 197), {text: ' · '}, nameSeg('栗栗', 141), {text: ' · '}, nameSeg('小白', 169)]} size={96} start={113} stagger={2} mode="pop" />
            </At>
          )}
        </AbsoluteFill>
      </WhipPan>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V05 focus + reward */
const FOCUS_RECT: Rect = {x: 209, y: 87, width: 522, height: 440};
export const V05: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.95;
  const cw = FOCUS_RECT.width * k;
  const ch = FOCUS_RECT.height * k;
  const cx = VW / 2;
  const cy = 860;
  const claim = f >= at(2);
  const srcT = retime(f, [
    [0, 46],
    [10, 64],
    [at(2) - 2, 213],
  ], 0);
  const srcC = f - at(2) + 26;
  const btn = {x: cx - cw / 2 + (415 - FOCUS_RECT.x) * k, y: cy - ch / 2 + (404 - FOCUS_RECT.y) * k};
  const counter = {x: 860, y: 430};
  const attract = {at: at(2) + 3, stagger: 1, flight: 30, seed: 'vclaim'};
  const N = 48;
  const arrivals = Array.from({length: N}).map((_, i) => attractArrival(i, attract));
  const value = 40 + Math.round((25 * arrivals.filter((a) => f >= a).length) / N);
  const lapse = f >= 10 && f < at(2);
  const sh = lapse ? shake(f, 10, 200, 3, 9, 2) : shake(f, at(2), 10, 12, 4, 1);
  return (
    <AbsoluteFill>
      <Camera zoom={claim ? 1.0 : tween(f, 0, at(2), 1.0, 1.12)} shake={sh}>
        <Layer depth={0.3}>
          <VBG frame={f} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={claim ? -4 : 3}>
            <UICrop clip={claim ? 'clip_focus_claim' : 'clip_focus_start_timelapse'} frame={claim ? srcC : srcT} rect={FOCUS_RECT} k={k} />
          </Card3D>
        </Layer>
      </Camera>
      <ImpactRing at={at(2)} x={btn.x} y={btn.y} frames={16} maxR={420} unit={12} color={C.gold} />
      <ParticleBurst sprites={['icon_coin', 'icon_coin', 'crop_lychee']} count={30} at={at(2)} origin={btn} seed="vclaim-b" speed={[14, 30]} angle={[-170, -10]} gravity={0.8} scale={[4, 7]} life={[50, 70]} flip shadow={4} />
      <ParticleBurst sprites={['icon_coin', 'icon_coin', 'icon_coin', 'crop_lychee']} count={N} mode="attract" target={counter} origin={btn} scale={[4, 6]} flip shadow={3} {...attract} />
      {claim ? (
        <At x={counter.x - 150} y={counter.y - 50}>
          <Counter value={value} size={60} bumpAt={arrivals.filter((_, i) => i % 6 === 0)} />
        </At>
      ) : null}
      {!claim ? <Head text={COPY.vertical.focus} at={2} y={170} size={132} mode="slam" /> : <Head text={COPY.vertical.reward} at={at(2)} y={170} size={144} mode="slam" color={C.gold} />}
      <div style={{position: 'absolute', left: 820, top: 1720}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}, {action: 'celebrate', at: at(2) + 4, step: 8}]} shadow={8} />
      </div>
      {!claim ? <ImgBubble id="focus" x={640} y={1300} at={14} outAt={at(2) - 8} scale={0.95} /> : null}
      {claim ? (
        <At center y={1750}>
          <Footnote text={COPY.rewardNote} size={32} />
        </At>
      ) : null}
      <WhiteFlash at={at(2)} frames={2} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V06 harvest */
const HARVEST_RECT: Rect = {x: 200, y: 84, width: 900, height: 806};
export const V06: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.15;
  const cw = HARVEST_RECT.width * k;
  const ch = HARVEST_RECT.height * k;
  const cx = VW / 2;
  const cy = 920;
  const plot = {x: cx - cw / 2 + (375 - HARVEST_RECT.x) * k, y: cy - ch / 2 + (426 - HARVEST_RECT.y) * k};
  const z = keyframes(f, [
    [0, 1.05],
    [at(2), 1.15, ease.out],
    [at(3.5), 1.0, ease.inOut],
  ]);
  const radish = (i: number) => {
    const t = tween(f, 2, 34, 0, 1, ease.in);
    if (f < 2 || t >= 1) return null;
    const dir = i === 0 ? -1 : 1;
    return (
      <div key={i} style={{position: 'absolute', left: plot.x + dir * t * 600, top: plot.y - Math.sin(t * Math.PI) * 400 + t * 300, transform: `translate(-50%, -50%) rotate(${dir * t * 540}deg)`}}>
        <PixelSprite sprite="crop_radish" scale={Math.round(4 + t * 36)} />
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <Camera zoom={z} shake={shake(f, 4, 10, 10, 21, 1)}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1080x1920" blur={5} tint={0.3} zoom={1.25} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={4}>
            <UICrop clip="clip_farm_harvest" frame={f + 58} rect={HARVEST_RECT} k={k} />
          </Card3D>
          <ImpactRing at={0} x={plot.x} y={plot.y} frames={16} maxR={300} unit={10} color={C.gold} />
          <ParticleBurst sprites={['crop_radish', 'icon_seed', 'flora_tallgrass']} count={18} at={0} origin={plot} seed="vharv" speed={[10, 22]} angle={[-160, -20]} gravity={0.8} scale={[4, 6]} life={[40, 60]} shadow={3} />
        </Layer>
      </Camera>
      {radish(0)}
      {radish(1)}
      <div style={{position: 'absolute', left: 820, top: 1760}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'harvest', at: 0, step: 10}]} shadow={8} groundShadow />
      </div>
      <ImgBubble id="harvest" x={600} y={1330} at={at(1)} scale={0.95} />
      <At x={0} y={110} w={VW} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <PixelTitle text={COPY.harvestHeadline.slice(0, 3)} size={132} start={4} stagger={6} mode="drop" />
        <PixelTitle text={COPY.harvestHeadline.slice(3)} size={132} start={22} stagger={6} mode="drop" color={C.gold} />
      </At>
      <Veil from={at(2)} to={at(3.5)} max={0.62} color={C.woodDark} />
      <BlackHold from={at(3.5)} to={at(4) + 2} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V07 scenes */
export const V07: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const seg = f < at(2) ? 0 : f < at(3) ? 1 : 2;
  const clips = ['clip_scene_lake_dolly_v', 'clip_scene_bookshop_dolly_v', 'clip_scene_terrace_dolly_v'];
  const starts = [0, at(2), at(3)];
  const local = f - starts[seg];
  const z = 1 + Math.max(...starts.map((s) => (f >= s ? Math.exp((-(f - s) / 14) * 4.6) : 0))) * 0.1;
  const sh = shake(f, starts[seg], 8, 10, 31 + seg, 1);
  return (
    <AbsoluteFill>
      <Camera zoom={z} shake={sh}>
        <Layer depth={1}>
          <Vid name={clips[seg]} frame={(seg === 0 ? 0 : 60) + local * 2.2} />
        </Layer>
        <Layer depth={1.8}>
          {[0, 1, 2, 3].map((i) => {
            let x = (i * 330 - f * 14) % 1500;
            if (x < -300) x += 1500;
            return <PixelSprite key={i} sprite={i % 2 ? 'flora_berrybush' : 'flora_tallgrass'} scale={14} x={x} y={VH + 20 + (i % 2) * 18} anchor="bottom-left" />;
          })}
          {seg === 1 ? <ParticleBurst sprites={['icon_water']} count={26} at={at(2)} mode="rain" origin={{x: 0, y: 0}} area={{x: -100, y: -300, w: 1300, h: 200}} seed="vrain" speed={[40, 70]} gravity={0.6} scale={[3, 5]} life={[60, 90]} stagger={1.2} fade={6} /> : null}
          {seg === 2 ? <ParticleBurst sprites={['icon_lantern', 'icon_flower']} count={10} at={at(3)} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: 1950, w: 1080, h: 100}} seed="vlant" speed={[-16, -10]} gravity={-0.04} scale={[5, 7]} life={[80, 100]} stagger={2} /> : null}
        </Layer>
      </Camera>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(C.woodDark, 0.6)} 0%, transparent 22%, transparent 70%, ${alpha(C.woodDark, 0.55)} 100%)`}} />
      <Head text={COPY.vertical.scenes} at={2} y={150} size={96} />
      <At x={0} y={1380} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle key={seg} text={COPY.scenes[seg]} size={168} start={starts[seg]} stagger={3} mode="slam" />
      </At>
      <At center bottom={110}>
        <Footnote text={COPY.sceneNote} size={28} />
      </At>
      <WhiteFlash at={0} frames={2} fadeFrames={6} />
      <WhiteFlash at={at(2)} frames={1} fadeFrames={4} />
      <WhiteFlash at={at(3)} frames={1} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V08 2048 */
export const V08: ShotComponent = () => {
  const {at} = useShotClock();
  const merges = Array.from({length: 8}).map((_, k) => at(k * 0.5));
  return (
    <AbsoluteFill>
      <Board2048 vertical merges={merges} m1024={at(4)} glowAt={at(5)} finalAt={at(6)} titleAt={at(7)} />
      <WhiteFlash at={0} frames={1} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V09 build */
export const V09: ShotComponent = () => {
  const {at} = useShotClock();
  const thuds = Array.from({length: 12}).map((_, i) => 28 + i * 7);
  return (
    <AbsoluteFill>
      <BuildPicnic vertical thuds={thuds} switchAt={at(1)} chipsAt={at(3)} clickAt={0} end={at(4)} firstStep={2} />
      <Head text={COPY.vertical.build} at={2} y={150} size={108} />
      <WhiteFlash at={at(1)} frames={1} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V10 notes */
const PAGES: Rect = {x: 420, y: 89, width: 972, height: 774};
export const V10: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.05;
  const cw = PAGES.width * k;
  const ch = PAGES.height * k;
  const cx = VW / 2;
  const cy = 940;
  const second = f >= at(2);
  const src = second
    ? retime(f, [
        [at(2), 22],
        [at(3), 82],
      ])
    : retime(f, [
        [0, 52],
        [at(1), 100],
      ]);
  const P = nbPoint(k, cx - 210 * k / 2 + 0, cy);
  void P;
  const sel = {x: cx - cw / 2 + (800 - PAGES.x) * k, y: cy - ch / 2 + (698 - PAGES.y) * k};
  const slipT = tween(f, at(3) + 14, at(4), 0, 1, ease.in);
  return (
    <AbsoluteFill>
      <Camera zoom={keyframes(f, [[0, 1.0], [at(1), 1.12, ease.inOut], [at(2), 1.0, ease.inOut], [at(4), 1.06]])}>
        <Layer depth={0.3}>
          <VBG frame={f + 200} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={second ? 6 : -6}>
            <UICrop clip={second ? 'clip_note_to_todo' : 'clip_note_outline'} frame={src} rect={PAGES} k={k} />
          </Card3D>
        </Layer>
      </Camera>
      {f >= at(3) + 14 && slipT < 1 ? (
        <div style={{position: 'absolute', left: lerp(sel.x, 900, slipT), top: lerp(sel.y, 1800, slipT) - Math.sin(slipT * Math.PI) * 300, transform: `translate(-50%, -50%) rotate(${slipT * 30}deg)`}}>
          <PixelSprite sprite="icon_scroll" scale={8} shadow={6} />
        </div>
      ) : null}
      <Head text={COPY.vertical.notes} at={2} y={170} size={96} />
      <div style={{position: 'absolute', left: 860, top: 1800}}>
        <PetSprite species="chestnut" frame={f} scale={12} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}, {action: 'celebrate', at: at(3) + 4, step: 7}]} shadow={8} />
      </div>
      <At center bottom={60}>
        <Footnote text={COPY.notesNote} size={30} at={at(3)} />
      </At>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V11 network */
const DIAG_RECT: Rect = {x: 203, y: 90, width: 1194, height: 290};
export const V11: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const online = f >= at(3);
  const ons = [at(3) + 4, at(3) + 8, at(3) + 12, at(3) + 16];
  const lit = online ? ons.filter((o) => f >= o).length : 0;
  const k = 0.87;
  return (
    <AbsoluteFill>
      <NetBG frame={f} vertical />
      <div style={{position: 'absolute', left: (VW - DIAG_RECT.width * k) / 2 - 6, top: 400}}>
        <Card3D x={(DIAG_RECT.width * k) / 2 + 6} y={(DIAG_RECT.height * k) / 2 + 6} width={DIAG_RECT.width * k + 12} height={DIAG_RECT.height * k + 12} rotateX={4}>
          <UICrop clip="clip_net_diag" frame={f + 50} rect={DIAG_RECT} k={k} />
        </Card3D>
      </div>
      <At x={70} y={760}>
        <DiagList times={[0, at(1), at(2), at(2.5)]} size={40} width={940} />
      </At>
      {online ? (
        <div style={{position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `translateY(${tween(f, at(3), at(3) + 10, 300, 0, ease.outBack)}px)`}}>
          <Card3D x={VW / 2} y={1330} width={1194 * 0.85 + 12} height={227 * 0.85 + 12} rotateX={-3}>
            <Img src={footage('ui_net_online.png')} style={{width: 1194 * 0.85, height: 227 * 0.85, display: 'block'}} />
          </Card3D>
        </div>
      ) : null}
      {online ? (
        <>
          <div style={{position: 'absolute', left: 120, top: 1520}}>
            <SignalBars lit={lit} unit={20} flashAt={ons} />
          </div>
          <div style={{position: 'absolute', left: 760, top: 1720}}>
            <PetSprite species="libao" frame={f} scale={7} x={0} y={0} anchor="bottom" clips={[{action: 'celebrate', at: at(3), step: 7}]} shadow={8} />
          </div>
        </>
      ) : null}
      <Head text={COPY.vertical.net} at={2} y={160} size={120} />
      <NetFootnote vertical />
      <WhiteFlash at={at(3)} frames={1} fadeFrames={5} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V12 trust */
export const V12: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  return (
    <AbsoluteFill>
      <PetWall frame={f + 60} pull0={-100} pull1={-60} s1={0.82} vertical />
      <AbsoluteFill style={{background: alpha(C.woodDark, 0.55)}} />
      <TrustBadges vertical times={[0, at(1), at(2)]} texts={[COPY.trustBadges[0], COPY.trustBadges[1], COPY.openSourceShort]} icons={['icon_chest', 'icon_shield', 'icon_scroll']} />
      <At center y={1560}>
        <BodyText text={COPY.openSourceSub} size={34} weight={900} color={C.paperHi} outline={C.lycheeDeep} inAt={at(2) + 10} />
      </At>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V13 end */
export const V13: ShotComponent = () => {
  const f = useCurrentFrame();
  const content = <EndCard vertical iconAt={0} petsAt={56} moveAt={118} greetAt={225} freezeAt={309} />;
  return f >= 309 ? <Freeze frame={309}>{content}</Freeze> : content;
};

export const _v = {EIGHTH, ArcadeClaim, camAt, camV};
