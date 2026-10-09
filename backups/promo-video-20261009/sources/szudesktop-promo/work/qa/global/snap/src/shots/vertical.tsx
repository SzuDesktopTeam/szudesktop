/**
 * Vertical 9:16 cut (30 s / 16 bars): V03–V13. Same real footage and sprites as the 16:9
 * film, re-framed for 1080×1920 and re-timed to the 9:16 score (assets/audio manifest 9x16).
 *
 * v2 (review): every UI beat is re-composed for a phone screen — one column of the real UI,
 * cropped and enlarged (body text ≥ ~26–28 px), the companions big in the lower third; every
 * compliance / footnote line sits in the y 1440–1560, x 60–900 safe band (clear of the
 * platforms' caption, account and button overlays); V11 now has two bars and V13 3.75 s.
 *
 * v3 (review): V03 drops 荔宝 above the platform footnote; V09 beat 1 is its own two-block
 * phone layout of the ready card (ready → click on beat 1½ → real toast in the button's place);
 * V10 clicks 选中 → 待办 on beat 3½ so the slip lands on beat 4, and the capture's own toast is
 * patched out of the note column; V12's sub-line is broken by hand into two 36 px lines.
 */
import React from 'react';
import {AbsoluteFill, Freeze, useCurrentFrame} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Card3D, Layer} from '../components/Camera';
import {DesktopScene, WindowFrame} from '../components/Desktop';
import {NativeMenu, petMenuItems} from '../components/NativeMenu';
import {ParticleBurst, PixelDust, attractArrival} from '../components/ParticleBurst';
import {PixelCursor} from '../components/PixelCursor';
import {PetClip, PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {Counter} from '../components/PixelUI';
import {BlackHold, ImpactRing, SoftFlash, Veil, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, hit, keyframes, lerp, shake, springAt, tween} from '../lib/anim';
import {EIGHTH, useShotClock} from '../lib/beat';
import {C, alpha} from '../theme/palette';
import {SCENE_CARD, SwitchPet, menuItemY} from './desktop';
import {camAt} from './focus';
import {At, Footnote, ImgBubble, PaperCard, Plate, Rect, SignalBars, UICrop, Vid, WarmBG, retime} from './kit';
import {DiagList, NetBG} from './net';
import {TodoCard} from './notes';
import {ShotComponent} from './registry';
import {PetWall, TrustBadges} from './trust';
import {ArcadeClaim, Board2048, BuildPicnic, SCENE_GRADE, SceneFlora} from './world';
import {EndCard} from './ending';

const VW = 1080;
const VH = 1920;
const camV = (c: {x: number; y: number}, z: number) => ({zoom: z, x: z * (c.x - VW / 2), y: z * (c.y - VH / 2)});

const VBG: React.FC<{frame: number; sprite?: string; tint?: number}> = ({frame, sprite = 'bg_campus_1080x1920', tint = 0.5}) => <WarmBG sprite={sprite} blur={10} tint={tint} zoom={1.25 + frame * 0.0005} />;

const Head: React.FC<{text: string; at: number; y?: number; size?: number; color?: string; mode?: 'drop' | 'slam' | 'pop'; exitAt?: number}> = ({text, at, y = 150, size = 120, color, mode = 'drop', exitAt}) => (
  <At x={0} y={y} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
    <PixelTitle text={text} size={size} start={at} stagger={4} mode={mode} color={color} exitAt={exitAt} exitMode="fade" exitStagger={0} />
  </At>
);

/** Compliance / footnote line in the vertical safe band (y 1440–1560, x 60–900). */
const SafeNote: React.FC<{text: string; at?: number; size?: number; y?: number}> = ({text, at, size = 30, y = 1452}) => (
  <div style={{position: 'absolute', left: 60, width: 840, top: y, display: 'flex', justifyContent: 'center'}}>
    <Footnote text={text} at={at} size={size} />
  </div>
);

/* ------------------------------------------------------------------ V03–V04 desktop */
/**
 * V03 (local 0–112): the scenery card of the real home page in a window at the top, 荔宝 hops out,
 * is dragged down (≈ 450 px tall at 100 %) and scrolled up to 150 % (≈ 700 px tall).
 * v3: the drop point is 300 px higher, so even at 150 % (camera 1.04) 荔宝's feet and ground
 * shadow end at y ≈ 1435 on screen, above the platform footnote (y 1452) — the note never
 * crosses its face and the cursor stays on its belly, not on the note.
 * V04 (113–225): full-screen wallpaper, the window only as a blurred backdrop, a big companion in
 * the middle: menu → 摸摸头 on the downbeat, then 栗栗 / 小白 / 荔宝 on beats 2–4.
 */
export const VDesktop: ShotComponent = () => {
  const f = useCurrentFrame();
  const k = 1.25;
  const winW = Math.round(SCENE_CARD.width * k) + 2;
  const winH = Math.round(SCENE_CARD.height * k) + 36;
  const wx = (VW - winW) / 2;
  const wy = 560;
  const perch = {x: wx + winW - 150, y: wy + 6};
  const rest = {x: 740, y: 1390};
  let petX = perch.x;
  let petY = perch.y;
  if (f < 28) {
    const t = tween(f, 16, 28, 0, 1, ease.out);
    petX = lerp(perch.x - 40, perch.x, t);
    petY = lerp(wy + winH - 60, perch.y, t) - Math.sin(t * Math.PI) * 160;
  }
  const dT = tween(f, 56, 77, 0, 1, ease.inOut);
  if (f >= 56) {
    petX = lerp(perch.x, rest.x, dT);
    petY = lerp(perch.y, rest.y, dT) - Math.sin(dT * Math.PI) * 200;
  }
  const ticks = [77, 84, 91, 98, 105];
  const nT = ticks.filter((t) => f >= t).length;
  const petScale = f < 56 ? 5 : lerp(5, 8, dT) * (1 + nT * 0.1);
  const v04 = f >= 113;
  const soft = v04 ? tween(f, 113, 119, 0, 1) : 0;
  const ms = 1.6;
  const items = petMenuItems({name: '荔宝', lv: 3, hunger: 80, mood: 85, energy: 85, food: 3, scalePct: 150});
  const menuX = 70;
  const menuY = 330;
  const libaoClips: PetClip[] = [
    {action: 'greet', at: 16, step: 9},
    {action: 'look', at: 56, step: 7, loop: true},
    {action: 'pat', at: 77, step: 7},
    {action: 'idle', at: 106, step: 'native', loop: true},
  ];
  const nameSeg = (txt: string, lit: number) => ({text: txt, litAt: lit, litColor: C.gold, color: alpha(C.paper, 0.55)});
  const punchZ = 1 + Math.max(hit(f, 141, 10), hit(f, 169, 10), hit(f, 197, 10)) * 0.08;
  return (
    <AbsoluteFill style={{background: C.woodDark}}>
      <Camera zoom={v04 ? 1.06 : tween(f, 0, 112, 1.0, 1.04)} tiltX={tween(f, 0, 30, 5, 0, ease.out)}>
        <Layer depth={1}>
          <DesktopScene width={VW} height={VH} date="2026/10/13" blur={2.4} dim={0.15}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: tween(f, 0, 6, 0, 1),
                transform: `perspective(1600px) rotateY(${tween(f, 0, 20, -18, 0, ease.outBack)}deg)`,
                transformOrigin: `${VW / 2}px ${wy + winH / 2}px`,
                filter: soft > 0 ? `blur(${(soft * 9).toFixed(1)}px) brightness(${1 - soft * 0.2})` : undefined,
              }}
            >
              <WindowFrame variant="win" width={winW} height={winH} x={wx} y={wy}>
                <UICrop clip="clip_home_lake_live" frame={(f + 30) % 240} rect={SCENE_CARD} k={k} />
              </WindowFrame>
            </div>
            {f >= 16 && !v04 ? <PetSprite species="libao" frame={f} scale={petScale} x={petX} y={petY} anchor="bottom" clips={libaoClips} groundShadow={f >= 77} /> : null}
            <PixelDust at={28} origin={perch} count={12} seed="vperch" />
            <PixelDust at={77} origin={rest} count={16} seed="vrest" />
          </DesktopScene>
        </Layer>
      </Camera>
      {!v04 ? (
        <>
          <ImgBubble id="greet" x={perch.x - 330} y={perch.y - 60} at={28} outAt={52} scale={0.8} />
          <PixelCursor
            path={[
              [36, 700, 1000],
              [54, perch.x, perch.y - 120],
              ...Array.from({length: 7}).map((_, i) => {
                const t = ease.inOut(i / 6);
                return [56 + (i / 6) * 21, lerp(perch.x, rest.x, t), lerp(perch.y, rest.y, t) - Math.sin(t * Math.PI) * 200 - 160] as const;
              }),
              // scroll-wheel ticks: the tip rides up with the growing body, ending on its belly
              [100, rest.x + 60, rest.y - 260],
              [112, rest.x + 60, rest.y - 260],
            ]}
            clicks={[56]}
            scale={4}
            inAt={36}
          />
          <Head text={COPY.vertical.pet} at={6} y={110} size={120} exitAt={101} />
          <At x={60} y={1190}>
            <BodyText text={COPY.vertical.petDrag} size={52} weight={900} plate="paper" inAt={56} outAt={103} />
          </At>
        </>
      ) : (
        <>
          {/* V04 hero: big companion, dissolving between the three originals on beats 2–4 */}
          <AbsoluteFill style={{transform: `scale(${punchZ})`, transformOrigin: '540px 1420px'}}>
            <SwitchPet
              frame={f}
              x={540}
              bottom={1420}
              box={{w: 760, h: 720}}
              block={32}
              punch={0}
              seq={[
                {species: 'libao', at: 113, scale: 12, clips: [{action: 'pat', at: 113, step: 7}]},
                {species: 'chestnut', at: 141, scale: 28, clips: [{action: 'signature', at: 141, step: 6}]},
                {species: 'egret', at: 169, scale: 20, clips: [{action: 'signature', at: 169, step: 6}]},
                {species: 'libao', at: 197, scale: 12, clips: [{action: 'celebrate', at: 197, step: 6}]},
              ]}
            />
          </AbsoluteFill>
          <ParticleBurst sprites={['icon_heart']} count={7} at={116} origin={{x: 540, y: 760}} seed="vhearts" mode="fountain" speed={[8, 13]} angle={[-120, -60]} gravity={0.12} scale={[5, 6]} life={[40, 56]} shadow={3} />
          <NativeMenu items={items} x={menuX} y={menuY} at={113} closeAt={130} highlight={4} scale={ms} />
          {f < 134 ? <PixelCursor path={[[113, menuX + 10, menuItemY(items, 4, menuY, ms) - 6], [134, menuX + 10, menuItemY(items, 4, menuY, ms) - 6]]} clicks={[116]} scale={4} inAt={113} /> : null}
          <ImgBubble id="chestnut" x={420} y={700} at={148} outAt={166} scale={0.8} />
          <ImgBubble id="egret" x={430} y={700} at={176} outAt={194} scale={0.8} />
          <At x={0} y={150} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
            <PixelTitle text={[nameSeg('荔宝', 197), {text: ' · '}, nameSeg('栗栗', 141), {text: ' · '}, nameSeg('小白', 169)]} size={96} start={113} stagger={2} mode="pop" />
          </At>
        </>
      )}
      <SafeNote text={COPY.petPlatformNote} at={8} size={28} />
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
  const cy = 820;
  const claim = f >= at(2);
  const srcT = retime(f, [
    [0, 46],
    [10, 64],
    [at(2) - 2, 213],
  ], 0);
  const srcC = f - at(2) + 26;
  const btn = {x: cx - cw / 2 + (415 - FOCUS_RECT.x) * k, y: cy - ch / 2 + (404 - FOCUS_RECT.y) * k};
  const counter = {x: 860, y: 400};
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
      {!claim ? <Head text={COPY.vertical.focus} at={2} y={150} size={132} mode="slam" /> : <Head text={COPY.vertical.reward} at={at(2)} y={150} size={144} mode="slam" color={C.gold} />}
      <div style={{position: 'absolute', left: 800, top: 1420}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}, {action: 'celebrate', at: at(2) + 4, step: 8}]} shadow={8} />
      </div>
      {!claim ? <ImgBubble id="focus" x={560} y={1240} at={14} outAt={at(2) - 8} scale={0.9} /> : null}
      {claim ? <SafeNote text={COPY.rewardNote} size={32} /> : null}
      <SoftFlash at={at(2)} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V06 harvest */
/** Only the six plots (+ the real toast) of clip_farm_harvest, enlarged for the phone. */
const HARVEST_COL: Rect = {x: 205, y: 190, width: 700, height: 690};
export const V06: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.45;
  const cw = HARVEST_COL.width * k;
  const ch = HARVEST_COL.height * k;
  const cx = VW / 2;
  const cy = 900;
  const plot = {x: cx - cw / 2 + (375 - HARVEST_COL.x) * k, y: cy - ch / 2 + (426 - HARVEST_COL.y) * k};
  const z = keyframes(f, [
    [0, 1.05],
    [at(2), 1.12, ease.out],
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
            <UICrop clip="clip_farm_harvest" frame={f + 58} rect={HARVEST_COL} k={k} />
          </Card3D>
          <ImpactRing at={0} x={plot.x} y={plot.y} frames={16} maxR={300} unit={10} color={C.gold} />
          <ParticleBurst sprites={['crop_radish', 'icon_seed', 'flora_tallgrass']} count={18} at={0} origin={plot} seed="vharv" speed={[10, 22]} angle={[-160, -20]} gravity={0.8} scale={[4, 6]} life={[40, 60]} shadow={3} />
        </Layer>
      </Camera>
      {radish(0)}
      {radish(1)}
      <div style={{position: 'absolute', left: 800, top: 1700}}>
        <PetSprite species="libao" frame={f} scale={8} x={0} y={0} anchor="bottom" clips={[{action: 'harvest', at: 0, step: 10}]} shadow={8} groundShadow />
      </div>
      <ImgBubble id="harvest" x={640} y={1300} at={at(1)} scale={0.9} />
      <At x={0} y={96} w={VW} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
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
  const clips = ['clip_scene_lake_v7', 'clip_scene_bookshop_v7', 'clip_scene_terrace_v7'];
  const starts = [0, at(2), at(3)];
  const local = f - starts[seg];
  const z = 1 + Math.max(...starts.map((s) => (f >= s ? Math.exp((-(f - s) / 6) * 4.6) : 0))) * 0.08 + tween(local, 0, 56, 0, 0.04);
  const sh = shake(f, starts[seg], 8, 10, 31 + seg, 1);
  return (
    <AbsoluteFill>
      <Camera zoom={z} shake={sh}>
        <Layer depth={1}>
          <AbsoluteFill style={{filter: SCENE_GRADE}}>
            <Vid name={clips[seg]} frame={local} />
          </AbsoluteFill>
        </Layer>
        <Layer depth={1.8}>
          {seg === 1 ? <ParticleBurst sprites={['fx_waterdrop']} count={30} at={at(2) - 30} mode="rain" origin={{x: 0, y: 0}} area={{x: -100, y: -260, w: 1300, h: 260}} seed="vrain" speed={[52, 70]} gravity={0.5} scale={[4, 5]} life={[40, 60]} stagger={1.5} fade={4} /> : null}
          {seg === 2 ? <ParticleBurst sprites={['icon_lantern', 'icon_flower']} count={10} at={at(3)} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: 1950, w: 1080, h: 100}} seed="vlant" speed={[-16, -10]} gravity={-0.04} scale={[5, 7]} life={[80, 100]} stagger={2} /> : null}
          <SceneFlora frame={f} y={VH + 40} speed={24} scale={22} count={5} />
        </Layer>
      </Camera>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(C.woodDark, 0.55)} 0%, transparent 20%, transparent 72%, ${alpha(C.woodDark, 0.5)} 100%)`}} />
      <Head text={COPY.vertical.scenes} at={2} y={150} size={96} />
      <At x={0} y={1200} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle key={seg} text={COPY.scenes[seg]} size={168} start={starts[seg]} stagger={3} mode="slam" />
      </At>
      <SafeNote text={COPY.sceneNote} size={28} />
      <WhiteFlash at={0} frames={2} fadeFrames={5} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V08 2048 */
export const V08: ShotComponent = () => {
  const {at} = useShotClock();
  const merges = Array.from({length: 8}).map((_, k) => at(k * 0.5));
  return (
    <AbsoluteFill>
      <Board2048 vertical merges={merges} m1024={at(4)} glowAt={at(5)} finalAt={at(6)} titleAt={at(6)} />
      <SoftFlash at={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V09 build */
/**
 * v3 beat 1, re-composed for the phone: two crops of the ready card in clip_build_picnic
 * (CSS px), stacked and enlarged 2× — the name + description + requirements (小萝卜 4/4 ·
 * 草莓 2/2 · 荔枝币 60/60), then the 「布置湖畔野餐角 →」 button — with 荔宝 hammering
 * (build) in the lower third. The ready state holds for half a beat, the cursor clicks on the
 * "and" of beat 1, and the real toast (1.8×) takes the button's place; it rides over the cut into
 * the row-by-row build (still empty above y ≈ 960 then) and fades on beat 2¾. The capture's own
 * toast (y 783–881) is outside both crops, so it never shows twice.
 */
const READY_INFO: Rect = {x: 404, y: 258, width: 346, height: 118};
const READY_BTN: Rect = {x: 1204, y: 418, width: 176, height: 62};
const BUILD_TOAST_V: Rect = {x: 570, y: 783, width: 465, height: 98};
const V09_K = 2;
/** Centre of the button block — the toast pops in exactly here. */
const V09_BTN = {x: VW / 2, y: 640};

const ReadyCardV: React.FC<{click: number; end: number}> = ({click, end}) => {
  const f = useCurrentFrame();
  const k = V09_K;
  const iw = READY_INFO.width * k;
  const ih = READY_INFO.height * k;
  const bw = READY_BTN.width * k;
  const bh = READY_BTN.height * k;
  const info = {x: VW / 2, y: 300 + (ih + 12) / 2};
  const btn = V09_BTN;
  // the real button states of the capture: idle (src 0) → hover (src 20) → pressed (src 28)
  const btnSrc = f < click - 5 ? 0 : f < click ? 20 : 28;
  // both blocks are already on screen on the cut (springs started 4 frames before it)
  const enter = springAt(f, -4, {damping: 14, stiffness: 320});
  const btnIn = springAt(f, -4, {damping: 12, stiffness: 300});
  const btnOp = tween(f, click + 1, click + 5, 1, 0, ease.in);
  const sh = shake(f, click, 8, 8, 91, 1);
  return (
    <AbsoluteFill>
      <WarmBG sprite="bg_courtyard_1080x1920" blur={8} tint={0.45} zoom={1.2 + f * 0.0012} />
      <AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px)`}}>
        <Card3D x={info.x} y={info.y - Math.round((1 - enter) * 60)} width={iw + 12} height={ih + 12} rotateX={3} rotateY={tween(f, 0, end, -3, 2)} opacity={Math.min(1, enter * 2)}>
          <UICrop clip="clip_build_picnic" frame={0} rect={READY_INFO} k={k} />
        </Card3D>
        {btnOp > 0 ? (
          <Card3D x={btn.x} y={btn.y} width={bw + 12} height={bh + 12} rotateX={3} scale={(0.7 + 0.3 * btnIn) * (f >= click && f < click + 4 ? 0.95 : 1)} opacity={btnOp * Math.min(1, btnIn * 2)}>
            <UICrop clip="clip_build_picnic" frame={btnSrc} rect={READY_BTN} k={k} />
          </Card3D>
        ) : null}
      </AbsoluteFill>
      <ImpactRing at={click} x={btn.x} y={btn.y} frames={14} maxR={380} unit={10} color={C.gold} />
      {/* what the toast says was spent: 小萝卜, 草莓 and 荔枝币 splash out sideways (never over the requirements) */}
      <ParticleBurst sprites={['crop_radish', 'crop_strawberry', 'icon_coin']} count={9} at={click} origin={{x: btn.x - 150, y: btn.y}} seed="v9-spend-l" speed={[12, 22]} angle={[-178, -150]} gravity={0.9} scale={[5, 7]} life={[34, 48]} flip shadow={3} />
      <ParticleBurst sprites={['icon_coin', 'crop_strawberry', 'crop_radish']} count={9} at={click} origin={{x: btn.x + 150, y: btn.y}} seed="v9-spend-r" speed={[12, 22]} angle={[-30, -2]} gravity={0.9} scale={[5, 7]} life={[34, 48]} flip shadow={3} />
      <PetSprite species="libao" frame={f} scale={12} x={500} y={1490} anchor="bottom" clips={[{action: 'build', at: 0, step: 7, loop: true}]} shadow={8} groundShadow />
      <PixelDust at={click} origin={{x: 500, y: 1490}} count={12} seed="v9-hammer" />
      <PixelCursor
        path={[
          [0, 980, 1250],
          [click - 5, btn.x + 80, btn.y + 10],
          [click, btn.x + 80, btn.y + 10],
          [end, btn.x + 190, btn.y + 150],
        ]}
        clicks={[click]}
        scale={4}
        inAt={0}
      />
    </AbsoluteFill>
  );
};

/** The real toast of clip_build_picnic at 1.8×, popped where the button was. */
const BuildToastV: React.FC<{at: number; outAt: number}> = ({at, outAt}) => {
  const f = useCurrentFrame();
  if (f < at || f >= outAt + 8) return null;
  const s = springAt(f, at, {damping: 12, stiffness: 260});
  const out = tween(f, outAt, outAt + 8, 0, 1, ease.in);
  return (
    <div
      style={{
        position: 'absolute',
        left: V09_BTN.x,
        top: V09_BTN.y - Math.round(out * 40),
        transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * s})`,
        opacity: Math.min(1, s * 1.5) * (1 - out),
        filter: `drop-shadow(8px 8px 0 ${alpha(C.woodDark, 0.5)})`,
      }}
    >
      <UICrop clip="clip_build_picnic" frame={70} rect={BUILD_TOAST_V} k={1.8} />
    </div>
  );
};

export const V09: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const thuds = Array.from({length: 12}).map((_, i) => 28 + i * 7);
  const click = at(0.5);
  const sw = at(1);
  return (
    <AbsoluteFill>
      {f < sw ? <ReadyCardV click={click} end={sw} /> : <BuildPicnic vertical thuds={thuds} switchAt={sw} chipsAt={at(3)} clickAt={0} end={at(4)} firstStep={2} />}
      <BuildToastV at={click + 1} outAt={at(1.75)} />
      <Head text={COPY.vertical.build} at={2} y={150} size={108} />
      <SoftFlash at={sw} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V10 notes */
/** One column of the note page (the paper only), enlarged so body text reads at ~27 px. */
const NOTE_COL_OUTLINE: Rect = {x: 690, y: 330, width: 606, height: 560};
const NOTE_COL_WRITE: Rect = {x: 690, y: 300, width: 606, height: 560};
const NOTE_TOAST: Rect = {x: 668, y: 814, width: 266, height: 66};
/**
 * Bottom-left corner of NOTE_COL_WRITE where the capture's own toast slides in (src ≥ 84, CSS
 * x 672–931, y ≥ 816). It is patched with the same corner of src 82 (identical to src 22–82:
 * paper + 「117 字词」), so only the enlarged toast is ever on screen.
 */
const NOTE_TOAST_PATCH: Rect = {x: 690, y: 806, width: 246, height: 54};
/** 「选中 → 待办」 in the toolbar of clip_note_to_todo (CSS px). */
const NOTE_TO_TODO_BTN = {x: 967, y: 350};
export const V10: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.74;
  const cw = NOTE_COL_OUTLINE.width * k;
  const ch = NOTE_COL_OUTLINE.height * k;
  const cx = VW / 2;
  const cy = 830;
  const second = f >= at(2);
  // v3: 选中 → 待办 is clicked on the "and" of beat 3 (src 82 at 70), the card comes in at 72,
  // the slip flies 74 → 84 and lands on beat 4, so row 4 of 我的小事 is lit for the last 29
  // frames (≈ 0.48 s; fully revealed ≈ 0.35 s) before the cut
  const clickAt = at(2.5);
  const cardIn = 72;
  const slip0 = 74;
  const landAt = at(3);
  const src = second
    ? retime(f, [
        [at(2), 30],
        [clickAt, 82],
      ])
    : retime(f, [
        [0, 52],
        [at(1), 100],
      ]);
  const rect = second ? NOTE_COL_WRITE : NOTE_COL_OUTLINE;
  const P = (vx: number, vy: number) => ({x: cx - cw / 2 + (vx - rect.x) * k, y: cy - ch / 2 + (vy - rect.y) * k});
  const sel = P(800, 698);
  const btn = P(NOTE_TO_TODO_BTN.x, NOTE_TO_TODO_BTN.y);
  const slipT = tween(f, slip0, landAt, 0, 1, ease.inOut);
  return (
    <AbsoluteFill>
      <Camera zoom={keyframes(f, [[0, 1.0], [at(1), 1.06, ease.inOut], [at(2), 1.0, ease.inOut], [at(4), 1.03]])}>
        <Layer depth={0.3}>
          <VBG frame={f + 200} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={second ? 4 : -4}>
            <UICrop clip={second ? 'clip_note_to_todo' : 'clip_note_outline'} frame={src} rect={rect} k={k}>
              {second ? (
                <div style={{position: 'absolute', left: (NOTE_TOAST_PATCH.x - rect.x) * k, top: (NOTE_TOAST_PATCH.y - rect.y) * k}}>
                  <UICrop clip="clip_note_to_todo" frame={82} rect={NOTE_TOAST_PATCH} k={k} />
                </div>
              ) : null}
            </UICrop>
          </Card3D>
        </Layer>
      </Camera>
      {second && f < clickAt + 6 ? (
        <PixelCursor
          path={[
            [at(2), sel.x + 130, sel.y + 12],
            [at(2) + 4, sel.x + 130, sel.y + 12],
            [clickAt - 3, btn.x + 4, btn.y + 2],
            [clickAt, btn.x + 4, btn.y + 2],
            // drifts along the toolbar and leaves before the enlarged toast (y ≥ 457) pops below it
            [clickAt + 6, btn.x + 70, btn.y - 16],
          ]}
          clicks={[clickAt]}
          scale={4}
          inAt={at(2)}
        />
      ) : null}
      <ImpactRing at={clickAt} x={btn.x} y={btn.y} frames={12} maxR={130} unit={6} color={C.gold} />
      {/* last beat: the real 我的小事 card (4th row lights up when the slip lands) + the real toast */}
      <TodoCard x={150} y={620} at={cardIn} landAt={landAt} k={1.2} />
      {f >= slip0 && slipT < 1 ? (
        <div style={{position: 'absolute', left: lerp(sel.x, 420, slipT), top: lerp(sel.y, 1420, slipT) - Math.sin(slipT * Math.PI) * 260, transform: `translate(-50%, -50%) rotate(${slipT * 30}deg)`}}>
          <PixelSprite sprite="icon_scroll" scale={8} shadow={6} />
        </div>
      ) : null}
      {f >= cardIn ? (
        <div style={{position: 'absolute', left: 540, top: 530, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * springAt(f, cardIn, {damping: 12, stiffness: 220})})`, filter: `drop-shadow(8px 8px 0 ${alpha(C.woodDark, 0.5)})`}}>
          <UICrop clip="clip_note_to_todo" frame={100} rect={NOTE_TOAST} k={2.2} />
        </div>
      ) : null}
      <Head text={COPY.vertical.notes} at={2} y={110} size={96} />
      <At x={0} y={240} w={VW} style={{display: 'flex', justifyContent: 'center'}}>
        <Footnote text={COPY.notesNote} size={28} at={4} />
      </At>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V11 network (2 bars) */
/** The two status cells of 当前连接 (CSS px of ui_net_offline / ui_net_online), shown stacked at 1.8×. */
const NET_FULL = {w: 1194, h: 227};
const CELL_L: Rect = {x: 28, y: 86, width: 566, height: 76};
const CELL_R: Rect = {x: 605, y: 86, width: 567, height: 76};
const StatusCells: React.FC<{still: string; at: number; k?: number}> = ({still, at, k = 1.78}) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const s = springAt(f, at, {damping: 12, stiffness: 220});
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 330, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, transform: `translateY(${(1 - s) * 120}px)`, opacity: Math.min(1, s * 2)}}>
      {[CELL_L, CELL_R].map((r, i) => (
        <PaperCard key={i} border={5} radius={10}>
          <UICrop still={still} rect={r} k={k} full={NET_FULL} />
        </PaperCard>
      ))}
    </div>
  );
};

export const V11: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const online = f >= at(4);
  const ons = [at(5), at(5.25), at(5.5), at(5.75)];
  const lit = online ? ons.filter((o) => f >= o).length : 0;
  return (
    <AbsoluteFill>
      <NetBG frame={f} vertical />
      {!online ? <StatusCells still="ui_net_offline.png" at={0} /> : <StatusCells still="ui_net_online.png" at={at(4)} />}
      {!online ? (
        <At x={70} y={720}>
          <DiagList times={[0, at(1), at(2), at(3)]} size={40} width={940} />
        </At>
      ) : (
        <>
          <div style={{position: 'absolute', left: 120, top: 1000}}>
            <SignalBars lit={lit} unit={26} flashAt={ons} />
          </div>
          <ParticleBurst sprites={['icon_coin', 'icon_heart', 'icon_flower']} count={24} at={at(4)} origin={{x: 220, y: 1040}} seed="v-online" speed={[10, 24]} angle={[-170, -10]} gravity={0.7} scale={[4, 6]} life={[40, 60]} shadow={3} />
          <div style={{position: 'absolute', left: 700, top: 1420}}>
            <PetSprite species="libao" frame={f} scale={10} x={0} y={0} anchor="bottom" clips={[{action: 'celebrate', at: at(4), step: 7}, {action: 'idle', at: at(4) + 50, step: 'native', loop: true}]} shadow={8} groundShadow />
          </div>
        </>
      )}
      {!online ? <Head text={COPY.vertical.net} at={2} y={140} size={120} /> : <Head text={COPY.netLoginHeadline} at={at(4)} y={150} size={84} mode="slam" color={C.paperHi} />}
      <SafeNote text={COPY.vertical.netFootnote} size={30} />
      <SoftFlash at={at(4)} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V12 trust */
/** COPY.openSourceSub broken by hand before its last item: 「3 位原创伙伴 · 324 帧逐帧像素动作」/「学生自制」. */
const OPEN_SOURCE_SUB_2L = (() => {
  const parts = COPY.openSourceSub.split(' · ');
  return `${parts.slice(0, -1).join(' · ')}\n${parts[parts.length - 1]}`;
})();

export const V12: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: 'scale(1.1)'}}>
        <PetWall frame={f + 60} pull0={-100} pull1={-60} s1={0.82} vertical />
      </AbsoluteFill>
      <AbsoluteFill style={{background: alpha(C.woodDark, 0.55)}} />
      <TrustBadges vertical times={[0, at(1), at(2)]} texts={[COPY.trustBadges[0], COPY.trustBadges[1], COPY.openSourceShort]} icons={['icon_chest', 'icon_shield', 'icon_scroll']} />
      {/* v3: two hand-broken lines at 36 px; the whole plate stays inside x 60–900, y 1440–1560 */}
      <div style={{position: 'absolute', left: 60, width: 840, top: 1440, display: 'flex', justifyContent: 'center'}}>
        <Plate at={at(2) + 8} pad="9px 28px 11px">
          <BodyText text={OPEN_SOURCE_SUB_2L} size={36} weight={900} color={C.paperHi} align="center" lineHeight={1.3} maxWidth={780} />
        </Plate>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ V13 end (3.75 s) */
export const V13: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const freeze = at(6);
  const content = <EndCard vertical iconAt={0} petsAt={at(2)} moveAt={at(4)} greetAt={at(4)} freezeAt={freeze} />;
  return f >= freeze ? <Freeze frame={freeze}>{content}</Freeze> : content;
};

export const _v = {EIGHTH, ArcadeClaim, camAt, camV};
