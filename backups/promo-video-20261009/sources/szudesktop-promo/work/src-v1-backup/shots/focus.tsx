/**
 * 02 专注奖励 — S08–S12 (11.250–20.625 s): write a todo, 25-minute focus timelapse, claim the
 * reward (coins fountain into a counter), the six farm plots, harvest a radish, darken for the drop.
 * All UI is the real captured app (clip_* at 3200×1800, CSS rects from the capture manifest).
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Card3D, Layer} from '../components/Camera';
import {ParticleBurst, PixelDust, attractArrival} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag, Counter, PixelPanel} from '../components/PixelUI';
import {BlackHold, ImpactRing, Veil, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, hit, keyframes, lerp, shake, tween} from '../lib/anim';
import {useShotClock} from '../lib/beat';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {At, Drift, Footnote, ImgBubble, Rect, UICrop, WarmBG, footage, retime} from './kit';
import {ShotComponent} from './registry';

/** Camera that keeps stage point `c` centred at zoom z. */
export const camAt = (c: {x: number; y: number}, z: number, W = 1920, H = 1080) => ({zoom: z, x: z * (c.x - W / 2), y: z * (c.y - H / 2)});

export const StudyBG: React.FC<{frame: number; sprite?: string}> = ({frame, sprite = 'bg_campus_1920x1080'}) => (
  <>
    <WarmBG sprite={sprite} blur={10} tint={0.5} zoom={1.25 + frame * 0.0006} />
    <Drift sprites={['icon_coin', 'crop_lychee', 'icon_flower', 'icon_seed']} count={16} seed="study" scale={[3, 5]} opacity={0.35} speed={[-0.6, -1.4]} />
  </>
);

/* ------------------------------------------------------------------ S08 */
const TODO_RECT: Rect = {x: 200, y: 80, width: 1200, height: 560};

export const S08: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.3;
  const cw = TODO_RECT.width * k;
  const ch = TODO_RECT.height * k;
  const cx = 960;
  const cy = 470;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const input = {x: ox + (1036 - TODO_RECT.x) * k, y: oy + (197 - TODO_RECT.y) * k};
  const item = {x: ox + (900 - TODO_RECT.x) * k, y: oy + (602 - TODO_RECT.y) * k};
  const z = keyframes(f, [
    [0, 1.0],
    [at(2), 1.3, ease.inOut],
    [at(3), 1.35, ease.out],
    [at(4), 1.22, ease.inOut],
  ]);
  const t = tween(f, 0, at(2), 0, 1, ease.inOut);
  const t2 = tween(f, at(3) + 4, at(4), 0, 1, ease.inOut);
  const cam = camAt({x: lerp(lerp(960, input.x - 120, t), item.x, t2), y: lerp(lerp(540, input.y + 120, t), item.y - 60, t2)}, z);
  const src = f + 28;
  return (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <StudyBG frame={f} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateX={tween(f, 0, 30, 8, 0, ease.out)} rotateY={tween(f, 0, 30, -10, 0, ease.out)} scale={tween(f, 0, 30, 0.9, 1, ease.out)}>
            <UICrop clip="clip_focus_todo_add" frame={src} rect={TODO_RECT} k={k} />
          </Card3D>
          {/* key sparks on each typed character (frames 0,7,…,42) */}
          {[0, 7, 14, 21, 28, 35, 42].map((a, i) => (
            <ParticleBurst key={i} squares={[C.gold, C.paperHi]} count={5} at={a} origin={{x: input.x - 230 + i * 30, y: input.y}} seed={`kt${i}`} speed={[3, 7]} angle={[-160, -20]} gravity={0.25} drag={0.1} scale={[6, 8]} life={[10, 16]} />
          ))}
          <ImpactRing at={at(3)} x={ox + (1336 - TODO_RECT.x) * k} y={input.y} frames={14} maxR={160} unit={8} color={C.gold} />
        </Layer>
      </Camera>
      <At x={70} bottom={70}>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: 24}}>
          <PixelSprite sprite="icon_quill" scale={8} shadow={6} style={{transform: `translateY(${-Math.round(hit(f, at(3), 10) * 30)}px)`}} />
          <PixelTitle text={COPY.todoHeadline} size={120} start={at(0) + 4} stagger={7} mode="drop" align="left" />
        </div>
      </At>
      <CornerTag text={COPY.sections[1]} at={2} />
      <WhiteFlash at={0} frames={2} fadeFrames={6} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S09 */
const FOCUS_RECT: Rect = {x: 209, y: 87, width: 522, height: 440};

const Chips: React.FC<{at: number; vertical?: boolean}> = ({at, vertical}) => {
  const f = useCurrentFrame();
  const chips = COPY.focusChips;
  useFontsFor(chips.join(''), [700]);
  return (
    <div style={{display: 'flex', gap: 14, flexWrap: vertical ? 'wrap' : 'nowrap'}}>
      {chips.map((c, i) => {
        const on = i === 1;
        const s = tween(f, at + i * 4, at + i * 4 + 6, 0, 1, ease.outBack);
        return (
          <div key={c} style={{transform: `scale(${s})`}}>
            <PixelPanel fill={on ? C.green : C.paper} border={on ? C.greenDeep : C.wood} unit={4} shadow={5} padding="8px 18px">
              <div style={{fontFamily: FONT_PIXEL, fontSize: 36, color: on ? C.gold : C.ink, whiteSpace: 'nowrap'}}>{c}</div>
            </PixelPanel>
          </div>
        );
      })}
    </div>
  );
};

export const S09: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.9;
  const cw = FOCUS_RECT.width * k;
  const ch = FOCUS_RECT.height * k;
  const cx = 640;
  const cy = 520;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const clock = {x: ox + (470 - FOCUS_RECT.x) * k, y: oy + (268 - FOCUS_RECT.y) * k};
  const src = retime(f, [
    [0, 46],
    [18, 64],
    [108, 213],
  ], 0);
  const lapse = f >= 18 && f < 108;
  const sh = lapse ? shake(f, 18, 200, 3, 9, 2) : {x: 0, y: 0, rot: 0};
  const z = keyframes(f, [
    [0, 1.25],
    [18, 1.35, ease.out],
    [108, 1.6, ease.inOut],
  ]);
  const cam = camAt({x: clock.x + 260, y: clock.y + 110}, z);
  return (
    <AbsoluteFill>
      <Camera {...cam} shake={sh}>
        <Layer depth={0.3}>
          <StudyBG frame={f + 113} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={-4} glare>
            <UICrop clip="clip_focus_start_timelapse" frame={src} rect={FOCUS_RECT} k={k} />
          </Card3D>
          <ImpactRing at={2} x={clock.x - 6} y={clock.y + 230} frames={14} maxR={140} unit={8} color={C.gold} />
        </Layer>
      </Camera>
      <At x={70} bottom={56}>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: 36}}>
          <PixelTitle text={COPY.focusHeadline} size={120} start={at(0) + 2} stagger={6} mode="slam" align="left" />
          <div style={{paddingBottom: 18}}>
            <Chips at={at(1)} />
          </div>
        </div>
      </At>
      {/* picture-in-picture 荔宝 keeping company */}
      <div style={{position: 'absolute', left: 1660, top: 1050}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}]} shadow={8} />
      </div>
      <ImgBubble id="focus" x={1560} y={590} at={at(1)} scale={0.9} />
      <WhiteFlash at={at(4) - 1} frames={1} fadeFrames={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S10 */
const CLAIM_RECT: Rect = {x: 200, y: 80, width: 760, height: 810};

export const S10: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.15;
  const cw = CLAIM_RECT.width * k;
  const ch = CLAIM_RECT.height * k;
  const cx = 560;
  const cy = 540;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const btn = {x: ox + (415 - CLAIM_RECT.x) * k, y: oy + (404 - CLAIM_RECT.y) * k};
  const counter = {x: 1700, y: 120};
  const attract = {at: 3, stagger: 0.9, flight: 34, seed: 'claim'};
  const N = 72;
  const arrivals = Array.from({length: N}).map((_, i) => attractArrival(i, attract));
  const arrived = arrivals.filter((a) => f >= a).length;
  const value = 40 + Math.round((25 * arrived) / N);
  const bumps = arrivals.filter((_, i) => i % 6 === 0);
  // beat-4 tilt down → whip down to the farm
  const out = tween(f, at(3) + 8, at(4), 0, 1, ease.inQuint);
  const src = f + 26;
  return (
    <AbsoluteFill style={{transform: `translateY(${-out * 1080}px)`}}>
      <Camera zoom={keyframes(f, [[0, 1.08], [at(1), 1.0, ease.out], [at(3), 1.03]])}>
        <Layer depth={0.3}>
          <StudyBG frame={f + 226} />
        </Layer>
        <Layer depth={0.6}>
          <div style={{position: 'absolute', left: 900, top: 520, width: 1100, transform: 'perspective(1400px) rotateY(-14deg) rotateZ(-3deg)', opacity: 0.55}}>
            <Img src={footage('ui_focus_week.png')} style={{width: 1100, borderRadius: 10, boxShadow: `0 20px 40px ${alpha(C.woodDark, 0.5)}`}} />
          </div>
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={-6}>
            <UICrop clip="clip_focus_claim" frame={src} rect={CLAIM_RECT} k={k} />
          </Card3D>
        </Layer>
        <Layer depth={1.8}>
          <ImpactRing at={0} x={btn.x} y={btn.y} frames={16} maxR={420} unit={12} color={C.gold} />
          <ParticleBurst sprites={['icon_coin', 'icon_coin', 'crop_lychee']} count={34} at={0} origin={btn} seed="claim-burst" speed={[14, 30]} angle={[-170, -10]} gravity={0.8} scale={[4, 7]} life={[50, 80]} flip shadow={4} />
          <ParticleBurst sprites={['icon_coin', 'icon_coin', 'icon_coin', 'icon_coin', 'icon_coin', 'crop_lychee']} count={N} mode="attract" target={counter} origin={btn} scale={[4, 6]} flip shadow={3} {...attract} />
        </Layer>
      </Camera>
      <At x={counter.x - 150} y={counter.y - 60}>
        <Counter value={value} size={64} bumpAt={bumps} />
      </At>
      <At x={1060} y={330}>
        <PixelTitle text="+25 荔枝币" size={132} start={at(0) + 2} stagger={4} mode="slam" color={C.gold} align="left" />
        <PixelTitle text="+25 成长" size={132} start={at(1)} stagger={4} mode="slam" color={C.gold} align="left" />
      </At>
      <At x={1066} y={720}>
        <Footnote text={COPY.rewardNote} at={at(1)} size={30} />
      </At>
      <div style={{position: 'absolute', left: 1640, top: tween(f, at(0) + 6, at(1), 1500, 1060, ease.outBack)}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'celebrate', at: at(0) + 6, step: 8}]} shadow={8} />
      </div>
      <CornerTag text={COPY.sections[1]} at={-30} />
      <WhiteFlash at={0} frames={0} fadeFrames={6} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S11 */
const FARM_IMG = {w: 888, h: 801, ox: 203, oy: 84.39};

export const S11: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.12;
  const cw = FARM_IMG.w * k;
  const ch = FARM_IMG.h * k;
  const cx = 860;
  const cy = 560;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const P = (vx: number, vy: number) => ({x: ox + (vx - FARM_IMG.ox) * k, y: oy + (vy - FARM_IMG.oy) * k});
  const radish = P(647, 425);
  const watered = P(1015, 432);
  const enter = tween(f, 0, 16, 1, 0, ease.out);
  const z = keyframes(f, [
    [0, 1.0],
    [at(4), 1.25, ease.inOut],
  ]);
  const cam = camAt({x: lerp(860, radish.x, tween(f, 0, at(4), 0, 1, ease.inOut)), y: lerp(560, radish.y, tween(f, 0, at(4), 0, 0.8, ease.inOut))}, z);
  const flash = f >= at(3) && f < at(3) + 14;
  return (
    <AbsoluteFill style={{transform: `translateY(${enter * 1080}px)`}}>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1920x1080" blur={5} tint={0.3} zoom={1.25} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateX={tween(f, 0, at(2), 22, 6, ease.out)} perspective={1600}>
            <Img src={footage('ui_farm_overview.png')} style={{width: cw, height: ch, display: 'block'}} />
            {flash ? (
              <div
                style={{
                  position: 'absolute',
                  left: watered.x - ox - 70,
                  top: watered.y - oy - 30,
                  width: 140,
                  height: 60,
                  boxShadow: `0 0 0 6px ${C.gold}, 0 0 0 12px ${alpha(C.paperHi, 0.6)}`,
                  opacity: 1 - (f - at(3)) / 14,
                }}
              />
            ) : null}
          </Card3D>
          {/* 荔宝 waters beside the plots */}
          <div style={{position: 'absolute', left: 1540, top: 1000}}>
            <PetSprite species="libao" frame={f} scale={7} x={0} y={0} anchor="bottom" clips={[{action: 'water', at: 6, step: 12}]} shadow={6} groundShadow />
          </div>
          <ParticleBurst sprites={['icon_water']} count={12} at={at(1)} origin={{x: 1400, y: 780}} seed="water" mode="rain" area={{x: 1330, y: 740, w: 90, h: 30}} speed={[14, 20]} gravity={0.5} scale={[3, 4]} life={[30, 40]} stagger={2} />
        </Layer>
        <Layer depth={1.8}>
          {[0, 1, 2, 3, 4].map((i) => (
            <PixelSprite key={i} sprite={i % 2 ? 'flora_berrybush' : 'flora_tallgrass'} scale={14} x={-200 + i * 520 - f * 6} y={1090} anchor="bottom-left" />
          ))}
        </Layer>
      </Camera>
      <At x={70} bottom={60}>
        <PixelTitle text={COPY.farmHeadline} size={96} start={at(0) + 8} stagger={4} mode="drop" align="left" />
      </At>
      <CornerTag text={COPY.sections[1]} at={-30} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S12 */
const HARVEST_RECT: Rect = {x: 200, y: 84, width: 900, height: 806};

export const S12: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.0;
  const cw = HARVEST_RECT.width * k;
  const ch = HARVEST_RECT.height * k;
  const cx = 700;
  const cy = 540;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const plot = {x: ox + (375 - HARVEST_RECT.x) * k, y: oy + (426 - HARVEST_RECT.y) * k};
  const z = keyframes(f, [
    [0, 1.12],
    [at(2), 1.25, ease.out],
    [at(3.5), 1.1, ease.inOut],
  ]);
  const cam = camAt({x: 900, y: 540}, z);
  const sh = shake(f, 4, 10, 10, 21, 1);
  const src = f + 58;
  // two radishes fly at the camera
  const radish = (i: number) => {
    const t = tween(f, 2, 34, 0, 1, ease.in);
    if (f < 2 || t >= 1) return null;
    const dir = i === 0 ? -1 : 1;
    const x = plot.x + dir * t * 900;
    const y = plot.y - Math.sin(t * Math.PI) * 300 + t * 200;
    const s = Math.round(4 + t * 40);
    return (
      <div key={i} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${dir * t * 540}deg)`}}>
        <PixelSprite sprite="crop_radish" scale={s} />
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <Camera {...cam} shake={sh}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1920x1080" blur={5} tint={0.3} zoom={1.25} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={5}>
            <UICrop clip="clip_farm_harvest" frame={src} rect={HARVEST_RECT} k={k} />
          </Card3D>
          <ImpactRing at={0} x={plot.x} y={plot.y} frames={16} maxR={300} unit={10} color={C.gold} />
          <ParticleBurst sprites={['crop_radish', 'icon_seed', 'flora_tallgrass']} count={18} at={0} origin={plot} seed="harv" speed={[10, 22]} angle={[-160, -20]} gravity={0.8} scale={[4, 6]} life={[40, 60]} shadow={3} />
          <PixelDust at={0} origin={plot} count={20} seed="harv-d" spread={1.4} />
        </Layer>
      </Camera>
      <div style={{position: 'absolute', left: 1640, top: 1040}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'harvest', at: 0, step: 10}]} shadow={8} groundShadow />
      </div>
      <ImgBubble id="harvest" x={1540} y={580} at={at(1)} scale={0.85} />
      {radish(0)}
      {radish(1)}
      <At x={1330} y={60}>
        <PixelTitle text={COPY.harvestHeadline.slice(0, 3)} size={120} start={at(0) + 4} stagger={6} mode="drop" align="left" />
        <PixelTitle text={COPY.harvestHeadline.slice(3)} size={120} start={at(0) + 22} stagger={6} mode="drop" align="left" color={C.gold} />
      </At>
      <Veil from={at(2)} to={at(3.5)} max={0.62} color={C.woodDark} />
      <BlackHold from={at(3.5)} to={at(4) + 2} />
      <CornerTag text={COPY.sections[1]} at={-30} />
    </AbsoluteFill>
  );
};

/** Typing glyph helper so useFontsFor sees the 120px digits early. */
export const preloadFocusText = () => <BodyText text="0123456789:+" size={10} />;
