/**
 * S04–S07 (3.750–11.250 s, global frames 225–675; local 0–450): a believable desktop with the
 * real szuDesktop window (live home capture), 荔宝 perched on the window, drag + scroll-zoom,
 * the rebuilt companion menu, petting, switching to 栗栗 / 小白, then a push through the
 * 学习书屋 nav tab into the next section.
 */
import React from 'react';
import {AbsoluteFill, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Layer} from '../components/Camera';
import {DesktopScene, WindowFrame} from '../components/Desktop';
import {NativeMenu, petMenuItems, switchPetItems} from '../components/NativeMenu';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PixelCursor} from '../components/PixelCursor';
import {PetSprite, PetClip} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag, PixelPanel} from '../components/PixelUI';
import {WhipPan, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {Species} from '../lib/assets';
import {ease, keyframes, lerp, tween} from '../lib/anim';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {At, Footnote, ImgBubble, UICrop, WarmBG} from './kit';
import {ShotComponent} from './registry';

/** Window geometry on the 1920×1080 desktop. Content = home page below the mast (no version chip). */
export const HOME_CROP = {x: 180, y: 90, width: 1240, height: 810};
export const winGeom = (x: number, y: number, w: number) => {
  const k = (w - 2) / HOME_CROP.width;
  const contentH = Math.round(HOME_CROP.height * k);
  return {x, y, w, k, h: contentH + 34 + 2, cx: x + 1, cy: y + 34 + 1};
};

/** Live home page inside a window frame. */
export const HomeWindow: React.FC<{g: ReturnType<typeof winGeom>; variant?: 'win' | 'mac'; still?: string; frame: number}> = ({g, variant = 'win', still, frame}) => (
  <WindowFrame variant={variant} width={g.w} height={g.h} x={g.x} y={g.y}>
    <UICrop clip={still ? undefined : 'clip_home_lake_live'} still={still} frame={frame % 240} rect={HOME_CROP} k={g.k} />
  </WindowFrame>
);

/** Clamp a camera focus so the zoomed view stays inside the 1920×1080 stage. */
export const clampFocus = (p: {x: number; y: number}, z: number, W = 1920, H = 1080) => {
  const hw = W / 2 / z;
  const hh = H / 2 / z;
  const cx = Math.min(W - hw, Math.max(hw, p.x));
  const cy = Math.min(H - hh, Math.max(hh, p.y));
  return {zoom: z, x: z * (cx - W / 2), y: z * (cy - H / 2), cx, cy};
};

/** Random block mask (SVG clipPath) over a w×h box: blocks with rand < t are kept (or ≥ t if invert). */
export const BlockMask: React.FC<{w: number; h: number; block: number; seed: string; t: number; invert?: boolean; children: React.ReactNode}> = ({w, h, block, seed, t, invert, children}) => {
  const id = `bm-${seed}-${invert ? 1 : 0}`.replace(/[^a-zA-Z0-9_-]/g, '');
  if (t >= 1) return invert ? null : <>{children}</>;
  if (t <= 0) return invert ? <>{children}</> : null;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r * block < h; r++)
    for (let c = 0; c * block < w; c++) {
      const v = random(`${seed}-${r}-${c}`);
      if (invert ? v >= t : v < t) rects.push(<rect key={`${r}-${c}`} x={c * block} y={r * block} width={block} height={block} />);
    }
  return (
    <>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          {rects}
        </clipPath>
      </svg>
      <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, clipPath: `url(#${id})`}}>{children}</div>
    </>
  );
};

/** Pixel-block dissolve between companions (8 frames), with a small scale pulse. */
export const SwitchPet: React.FC<{
  frame: number;
  seq: Array<{species: Species; at: number; clips: PetClip[]; scale: number}>;
  x: number;
  bottom: number;
  box?: {w: number; h: number};
  block?: number;
  dur?: number;
}> = ({frame, seq, x, bottom, box = {w: 360, h: 380}, block = 24, dur = 8}) => {
  let idx = 0;
  seq.forEach((s, i) => {
    if (frame >= s.at) idx = i;
  });
  const cur = seq[idx];
  const prev = idx > 0 ? seq[idx - 1] : null;
  const since = frame - cur.at;
  const t = prev ? Math.min(1, Math.max(0, since / dur)) : 1;
  const pulse = since >= 0 && since < 10 ? 1 + 0.07 * Math.sin((since / 10) * Math.PI) : 1;
  const draw = (s: (typeof seq)[number]) => (
    <PetSprite species={s.species} frame={frame} scale={s.scale} x={box.w / 2} y={box.h} anchor="bottom" clips={s.clips} />
  );
  return (
    <div style={{position: 'absolute', left: x - box.w / 2, top: bottom - box.h, width: box.w, height: box.h, transform: `scale(${pulse})`, transformOrigin: '50% 100%'}}>
      {prev && t < 1 ? (
        <BlockMask w={box.w} h={box.h} block={block} seed={`sw${idx}`} t={t} invert>
          {draw(prev)}
        </BlockMask>
      ) : null}
      <BlockMask w={box.w} h={box.h} block={block} seed={`sw${idx}`} t={t}>
        {draw(cur)}
      </BlockMask>
    </div>
  );
};

const PctChip: React.FC<{pct: number; x: number; y: number; at: number}> = ({pct, x, y, at}) => {
  const f = useCurrentFrame();
  const text = `伙伴大小（${pct}%）`;
  useFontsFor('伙伴大小（0123456789%）', [700]);
  if (f < at) return null;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `scale(${tween(f, at, at + 5, 0.8, 1, ease.outBack)})`, transformOrigin: '0 100%'}}>
      <PixelPanel fill={C.paper} border={C.wood} unit={4} shadow={6} padding="10px 18px">
        <div style={{fontFamily: FONT_BODY, fontWeight: 700, fontSize: 30, color: C.ink, whiteSpace: 'nowrap'}}>{text}</div>
      </PixelPanel>
    </div>
  );
};

export const DesktopShots: ShotComponent = () => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const g = winGeom(90, 360, 1000);
  const perch = {x: g.x + g.w - 110, y: g.y + 6};
  const rest = {x: 1660, y: 1014};

  // --- pet position (bottom-centre anchor) ---
  let petX = perch.x;
  let petY = perch.y;
  // hop out of the window (local 44 → 56)
  if (f < 56) {
    const t = tween(f, 44, 56, 0, 1, ease.out);
    petX = lerp(g.x + g.w - 260, perch.x, t);
    petY = lerp(g.y + 330, perch.y, t) - Math.sin(t * Math.PI) * 140;
  }
  // drag (113 → 169)
  const dragT = tween(f, 113, 169, 0, 1, ease.inOut);
  if (f >= 113) {
    petX = lerp(perch.x, rest.x, dragT);
    petY = lerp(perch.y, rest.y, dragT) - Math.sin(dragT * Math.PI) * 260;
  }
  // scroll zoom ticks (169…197): ×4 = 100 % → ×6 = 150 %
  const ticks = [169, 176, 183, 190, 197];
  const nTick = ticks.filter((t) => f >= t).length;
  const pct = 100 + nTick * 10;
  const petScale = 4 * (pct / 100);

  // --- camera ---
  const tiltX = keyframes(f, [
    [0, 6],
    [113, 2, ease.out],
    [150, 0, ease.inOut],
  ]);
  const tiltY = keyframes(f, [
    [0, -8],
    [113, -3, ease.out],
    [150, 0, ease.inOut],
    [422, 0],
    [450, 12, ease.in],
  ]);
  let cam = {zoom: 1, x: 0, y: 0};
  const z = keyframes(f, [
    [0, 0.94],
    [113, 1.0, ease.out],
    [169, 1.18, ease.inOut],
    [197, 1.2],
    [225, 1.18, ease.out],
    [338, 1.32, ease.inOut],
    [422, 1.32],
  ]);
  const followT = tween(f, 113, 169, 0, 1, ease.inOut);
  const focus = {x: lerp(960, 1500, followT), y: lerp(560, 800, followT)};
  if (f < 113) cam = {zoom: z, x: 0, y: 0};
  else {
    const c = clampFocus(focus, z);
    cam = {zoom: z, x: c.x, y: c.y};
  }
  // push through the 学习书屋 nav tab (422 → 450)
  const nav = {x: g.cx + (1007.3 + 99 - HOME_CROP.x) * g.k, y: g.cy + (97.4 + 22 - HOME_CROP.y) * g.k};
  if (f >= 422) {
    const t = tween(f, 422, 450, 0, 1, ease.inExpo);
    const z0 = 1.32;
    const zz = z0 * Math.pow(16 / z0, t);
    const c0 = clampFocus({x: 1500, y: 800}, z0);
    const cx = lerp(c0.cx, nav.x, Math.min(1, t * 1.6));
    const cy = lerp(c0.cy, nav.y, Math.min(1, t * 1.6));
    cam = {zoom: zz, x: zz * (cx - 960), y: zz * (cy - 540)};
  }

  // window fly-in
  const winRY = tween(f, 0, 22, -18, 0, ease.outBack);
  const winS = tween(f, 0, 22, 0.88, 1, ease.out);
  const winOp = tween(f, 0, 6, 0, 1, ease.linear);

  // menus
  const menuState = {name: '荔宝', lv: 3, hunger: 80, mood: 85, energy: 85, food: 3, scalePct: 150};
  const menuX = 1290;
  const menuY = 386;
  const menuScale = 1.5;
  const itemY = (i: number) => {
    // NativeMenu metrics: 4k top padding, 24k item, separators 9k (0.5k + 2×4k margins)
    const items = petMenuItems(menuState);
    let y = 4 * menuScale;
    for (let j = 0; j < i; j++) y += items[j].type === 'separator' ? 8.5 * menuScale : 24 * menuScale;
    return menuY + y + 12 * menuScale;
  };

  // cursor path (desktop coords)
  const grab = {x: perch.x, y: perch.y - 120};
  const cursorPath: Array<readonly [number, number, number]> = [
    [96, 1500, 700],
    [111, grab.x + 6, grab.y],
    [113, grab.x, grab.y],
    ...Array.from({length: 9}).map((_, i) => {
      const t = i / 8;
      const ft = 113 + t * 56;
      const tt = ease.inOut(t);
      return [ft, lerp(perch.x, rest.x, tt), lerp(perch.y, rest.y, tt) - Math.sin(tt * Math.PI) * 260 - 120] as const;
    }),
    [200, rest.x + 30, rest.y - 160],
    [222, rest.x + 10, rest.y - 170],
    [225, rest.x + 6, rest.y - 172],
    [250, menuX + 120, itemY(4)],
    [281, menuX + 116, itemY(4)],
    [310, menuX + 200, itemY(8) + 20],
    [336, menuX + 160, itemY(8)],
    [352, menuX - 150, itemY(8) + 4],
    [362, menuX - 150, itemY(8) + 36],
    [366, menuX - 150, itemY(8) + 36],
    [390, rest.x - 330, rest.y - 120],
    [394, rest.x - 320, rest.y - 110],
    [422, menuX - 200, itemY(8) + 200],
  ];
  const clicks = [113, 225, 281, 338, 366];

  const libaoClips: PetClip[] = [
    {action: 'idle', at: 0, step: 'native', loop: true},
    {action: 'greet', at: 56, step: 9},
    {action: 'idle', at: 110, step: 'native', loop: true},
    {action: 'look', at: 113, step: 7, loop: true},
    {action: 'pat', at: 169, step: 7},
    {action: 'idle', at: 215, step: 'native', loop: true},
    {action: 'pat', at: 281, step: 8},
  ];

  const desktop = (
    <DesktopScene bezel={f < 160 ? 26 : 0} date="2026/10/13" blur={1.2}>
      <div style={{position: 'absolute', inset: 0, opacity: winOp, transform: `perspective(1600px) rotateY(${winRY}deg) scale(${winS})`, transformOrigin: `${g.x + g.w / 2}px ${g.y + g.h / 2}px`}}>
        <HomeWindow g={g} frame={f + 30} />
      </div>
      {/* the pet */}
      {f >= 44 && f < 338 ? (
        <div style={{position: 'absolute', left: 0, top: 0}}>
          <PetSprite species="libao" frame={f} scale={petScale} x={petX} y={petY} anchor="bottom" clips={libaoClips} groundShadow={f >= 169} />
        </div>
      ) : null}
      {f >= 338 ? (
        <SwitchPet
          frame={f}
          x={rest.x}
          bottom={rest.y}
          seq={[
            {species: 'libao', at: 338, scale: 6, clips: [{action: 'idle', at: 0, step: 'native', loop: true}]},
            {species: 'chestnut', at: 366, scale: 15, clips: [{action: 'signature', at: 366, step: 8}]},
            {species: 'egret', at: 394, scale: 10, clips: [{action: 'signature', at: 394, step: 8}]},
          ]}
        />
      ) : null}
      <PixelDust at={56} origin={{x: perch.x, y: perch.y}} count={14} seed="perch" />
      <PixelDust at={169} origin={{x: rest.x, y: rest.y}} count={16} seed="rest" />
      {/* hearts on 摸摸头 */}
      <ParticleBurst sprites={['icon_heart']} count={6} at={281} origin={{x: rest.x, y: rest.y - 300}} seed="hearts" mode="fountain" speed={[7, 12]} angle={[-120, -60]} gravity={0.12} scale={[4, 5]} life={[40, 56]} shadow={3} />
      <ParticleBurst squares={[C.gold, C.paperHi]} count={10} at={281} origin={{x: rest.x, y: rest.y - 300}} seed="pat-sp" speed={[4, 9]} angle={[-180, 0]} gravity={0.1} drag={0.08} scale={[6, 10]} life={[16, 26]} />
      {/* bubbles (real pet.html captures) */}
      <ImgBubble id="greet" x={perch.x - 40} y={perch.y - 230} at={56} outAt={104} scale={0.85} />
      <ImgBubble id="pat" x={rest.x - 120} y={rest.y - 352} at={309} outAt={334} scale={0.9} />
      <ImgBubble id="chestnut" x={rest.x - 170} y={rest.y - 340} at={380} outAt={392} scale={0.9} />
      <ImgBubble id="egret" x={rest.x - 170} y={rest.y - 340} at={408} outAt={440} scale={0.9} />
      {/* S05 HUD + drag label */}
      {f >= 113 && f < 225 ? (
        <div style={{position: 'absolute', left: petX - 40, top: petY - 56 * petScale - 90, transform: 'translateX(-100%)'}}>
          <BodyText text={COPY.petDrag} size={40} weight={700} plate="paper" inAt={116} style={{whiteSpace: 'nowrap'}} />
        </div>
      ) : null}
      {f >= 169 && f < 225 ? <PctChip pct={pct} x={rest.x - 330} y={rest.y - 120} at={169} /> : null}
      {/* menu (S06) and switch submenu (S07) */}
      <NativeMenu items={petMenuItems(menuState)} x={menuX} y={menuY} at={225} closeAt={281} highlight={f >= 253 ? 4 : undefined} scale={menuScale} />
      <NativeMenu items={petMenuItems(menuState)} x={menuX} y={menuY} at={338} closeAt={370} highlight={8} scale={menuScale} />
      <NativeMenu
        items={switchPetItems(f >= 394 ? 2 : f >= 366 ? 1 : 0)}
        x={menuX - 170 * menuScale - 4}
        y={itemY(8) - 4 * menuScale - 12 * menuScale}
        at={344}
        closeAt={370}
        highlight={f >= 394 ? 2 : f >= 366 ? 1 : f >= 352 ? 0 : undefined}
        scale={menuScale}
        width={170}
      />
      <PixelCursor path={cursorPath} clicks={clicks} scale={4} inAt={96} />
    </DesktopScene>
  );

  // Title segments: names light up on the switch beats.
  const nameSeg = (txt: string, lit: number) => ({text: txt, litAt: lit, litColor: C.gold, color: alpha(C.paper, 0.55)});

  return (
    <AbsoluteFill style={{background: C.woodDark}}>
      <WhipPan at={0} frames={8} mode="in" direction="left" distance={W * 1.1} blur={70}>
        <AbsoluteFill>
          <Camera zoom={cam.zoom} x={cam.x} y={cam.y} tiltX={tiltX} tiltY={tiltY} perspective={2400} background={C.woodDark}>
            <Layer depth={0.25}>
              <WarmBG sprite="bg_courtyard_1920x1080" blur={14} tint={0.55} zoom={1.3} />
            </Layer>
            <Layer depth={1}>{desktop}</Layer>
          </Camera>
          {/* S04 headline */}
          {f < 113 ? (
            <At x={1080} y={520} w={800}>
              <PixelTitle text={COPY.petHeadline} size={96} start={28} stagger={7} mode="drop" exitAt={104} exitMode="up" exitStagger={1} align="left" />
            </At>
          ) : null}
          {/* S06 headline */}
          {f >= 225 && f < 338 ? (
            <At x={56} y={150}>
              <PixelTitle text={COPY.petMenuHeadline} size={72} start={228} stagger={3} mode="drop" align="left" exitAt={330} exitMode="fade" exitStagger={0} />
            </At>
          ) : null}
          {/* S07 headline: names light on 338 / 366 / 394 */}
          {f >= 338 && f < 432 ? (
            <At x={56} y={150}>
              <PixelTitle
                text={[nameSeg('荔宝', 338), {text: ' · '}, nameSeg('栗栗', 366), {text: ' · '}, nameSeg('小白', 394), {text: '，随时切换', color: C.paper}]}
                size={72}
                start={338}
                stagger={2}
                mode="pop"
                align="left"
              />
            </At>
          ) : null}
          {f >= 338 && f < 432 ? (
            <At x={56} bottom={44}>
              <Footnote text={COPY.petPlatformNote} at={344} size={28} />
            </At>
          ) : null}
          {f < 422 ? <CornerTag text={COPY.sections[0]} at={4} /> : null}
          <WhiteFlash at={447} frames={3} fadeFrames={0} />
        </AbsoluteFill>
      </WhipPan>
    </AbsoluteFill>
  );
};
