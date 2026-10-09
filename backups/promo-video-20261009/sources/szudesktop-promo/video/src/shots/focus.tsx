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
import {BlackHold, ImpactRing, SoftFlash, Veil} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, hit, keyframes, lerp, shake, tween} from '../lib/anim';
import {useShotClock} from '../lib/beat';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {At, Drift, Footnote, ImgBubble, Plate, Rect, UICrop, WarmBG, footage, retime} from './kit';
import {ShotComponent} from './registry';

/** Camera that keeps stage point `c` centred at zoom z. */
export const camAt = (c: {x: number; y: number}, z: number, W = 1920, H = 1080) => ({zoom: z, x: z * (c.x - W / 2), y: z * (c.y - H / 2)});

/**
 * v3 title plates in this section: 88 % deep wood plus a backdrop blur that fades in with the
 * plate, so captured UI behind a plate never reads through as ghost text.
 */
const PLATE_OPACITY = 0.88;
const frost = (f: number, at?: number): React.CSSProperties => {
  const b = at === undefined ? 10 : 10 * tween(f, at, at + 6, 0, 1, ease.out);
  return b > 0.05 ? {backdropFilter: `blur(${b.toFixed(2)}px)`} : {};
};

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
  const cy = 500;
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
      {/* v3: title bottom-right. At every zoom of this shot the left half of the frame is the
          timer panel / list text, while the bottom-right only ever shows the list's empty right
          half (typing push-in) or the wallpaper (pan down to the new item). */}
      <At right={96} bottom={56}>
        <Plate at={at(0) + 2} opacity={PLATE_OPACITY} style={frost(f, at(0) + 2)}>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: 24}}>
            <PixelSprite sprite="icon_quill" scale={7} shadow={6} style={{transform: `translateY(${-Math.round(hit(f, at(3), 10) * 30)}px)`}} />
            <PixelTitle text={COPY.todoHeadline} size={108} start={at(0) + 4} stagger={6} mode="drop" align="left" />
          </div>
        </Plate>
      </At>
      <CornerTag text={COPY.sections[1]} at={2} outAt={at(3)} />
      <SoftFlash at={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S09 */
// v3: the crop ends just under the 完成并领取奖励 / 结束本次专注 row (CSS y 424 of 437), so the
// 「每完成 1 分钟…学习行为。」paragraph is no longer in the card — it sat exactly behind the title
// plate at every zoom. Below the card is the wallpaper.
const FOCUS_RECT: Rect = {x: 209, y: 87, width: 522, height: 350};

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
  const cy = 52 + ch / 2; // card top stays at stage y 52
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
  // aim 74 px under the clock: at 1.6× the button labels still end ≈ 20 px above the title plate
  const cam = camAt({x: clock.x + 260, y: clock.y + 74}, z);
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
      {/* wallpaper shade under the title only (transparent above y 886, clear of the button row) */}
      <AbsoluteFill style={{background: `linear-gradient(0deg, ${alpha(C.woodDark, 0.55)} 0%, ${alpha(C.woodDark, 0.55)} 8%, transparent 18%)`}} />
      <At x={96} bottom={44}>
        <Plate opacity={PLATE_OPACITY} style={frost(f)}>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: 36}}>
            <PixelTitle text={COPY.focusHeadline} size={108} start={at(0) + 2} stagger={6} mode="slam" align="left" />
            <div style={{paddingBottom: 14}}>
              <Chips at={at(1)} />
            </div>
          </div>
        </Plate>
      </At>
      {/* picture-in-picture 荔宝 keeping company */}
      <div style={{position: 'absolute', left: 1660, top: 1050}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}]} shadow={8} />
      </div>
      <ImgBubble id="focus" x={1560} y={590} at={at(1)} scale={0.9} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S10 */
const CLAIM_RECT: Rect = {x: 200, y: 80, width: 760, height: 810};

export const S10: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.06;
  const cw = CLAIM_RECT.width * k;
  const ch = CLAIM_RECT.height * k;
  const cx = 520;
  const cy = 488;
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
  // beat 4: the tilt down to the farm is done at Film level (continuous track + falling coins)
  const src = f + 26;
  return (
    <AbsoluteFill>
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
          <ParticleBurst sprites={['icon_coin', 'icon_coin', 'crop_lychee']} count={24} at={0} origin={btn} seed="claim-burst" speed={[16, 30]} angle={[-150, -30]} gravity={0.55} scale={[4, 7]} life={[30, 44]} flip shadow={4} />
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
      <At x={96} y={966}>
        <Footnote text={COPY.rewardNote} at={at(1)} size={30} />
      </At>
      <div style={{position: 'absolute', left: 1700, top: tween(f, at(0) + 6, at(1), 1500, 1060, ease.outBack)}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'celebrate', at: at(0) + 6, step: 8}]} shadow={8} />
      </div>
      <SoftFlash at={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S11 */
const FARM_IMG = {w: 888, h: 801, ox: 203, oy: 84.39};
// v3: the card shows the still down to just under the farm scene (image y 752 of 801); the
// 「▸ 种植小贴士」footer below it used to slide out from under the title plate at 1.22×.
const FARM_CROP_H = 752;

export const S11: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.12;
  const cw = FARM_IMG.w * k;
  const ch = FARM_CROP_H * k;
  const cx = 860;
  const ox = cx - cw / 2;
  const oy = 101; // card top (stage px)
  const cy = oy + ch / 2;
  const P = (vx: number, vy: number) => ({x: ox + (vx - FARM_IMG.ox) * k, y: oy + (vy - FARM_IMG.oy) * k});
  const watered = P(1015, 432);
  // v3: push in 1.0 → 1.22 while the aim eases 56 px down (it used to drift up to the radish
  // row and drove the bottom-row labels 还需 13:58 / 可以播种 under the title). Now every UI line
  // stays above the plate (top ≈ 907) for the whole shot: the scene's tip bar「成熟后不会枯萎，
  // 忙完再来收也没关系。」rides at y ≈ 882–890, the plot labels ≤ 860; only the farm header
  // leaves through the top edge near the end.
  const e = tween(f, 0, at(4), 0, 1, ease.inOut);
  const z = 1 + 0.22 * e;
  const cam = camAt({x: cx, y: oy + 455 + 56 * e}, z);
  const flash = f >= at(3) && f < at(3) + 14;
  return (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <WarmBG sprite="bg_courtyard_1920x1080" blur={5} tint={0.3} zoom={1.45} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateX={tween(f, 0, at(2), 22, 6, ease.out)} perspective={1600}>
            <div style={{width: cw, height: ch, overflow: 'hidden'}}>
              <Img src={footage('ui_farm_overview.png')} style={{width: cw, height: FARM_IMG.h * k, display: 'block'}} />
            </div>
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
          {/* water drops (fx_waterdrop, the app's own drop pixels) from 荔宝's can spout */}
          <ParticleBurst sprites={['fx_waterdrop']} count={8} at={at(1)} origin={{x: 1540 + 20 * 7, y: 1000 - 16 * 7}} seed="water" mode="rain" area={{x: 1540 + 18 * 7, y: 1000 - 17 * 7, w: 14, h: 6}} speed={[6, 9]} gravity={0.55} scale={[5, 6]} life={[16, 20]} stagger={3} fade={4} />
        </Layer>
        <Layer depth={1.8}>
          {[0, 1, 2, 3, 4].map((i) => (
            <PixelSprite key={i} sprite={i % 2 ? 'flora_berrybush' : 'flora_tallgrass'} scale={14} x={-200 + i * 520 - f * 6} y={1090} anchor="bottom-left" />
          ))}
        </Layer>
      </Camera>
      <At x={96} bottom={44}>
        <Plate at={at(0) + 6} opacity={PLATE_OPACITY} style={frost(f, at(0) + 6)}>
          <PixelTitle text={COPY.farmHeadline} size={84} start={at(0) + 8} stagger={3} mode="drop" align="left" />
        </Plate>
      </At>
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
    </AbsoluteFill>
  );
};

/** Typing glyph helper so useFontsFor sees the 120px digits early. */
export const preloadFocusText = () => <BodyText text="0123456789:+" size={10} />;
