/**
 * S04–S07 (3.750–11.250 s, global frames 225–675; local 0–450): a believable desktop with the
 * real szuDesktop window (live home capture), 荔宝 perched on the window, drag + scroll-zoom,
 * the rebuilt companion menu, petting, switching to 栗栗 / 小白, then a push through the
 * 学习书屋 nav tab into the next section.
 *
 * v2 (review): every beat gets its own framing — S04 pushes in on 荔宝 sitting on the window
 * edge (≥ 350 px tall), S05 follows the drag, S06 is a 1.5× close-up of menu + cursor with the
 * window softened, S07 is a 伙伴-centred hero shot over the blurred desktop with a 1.0→1.08
 * punch on every switch. Titles live on the wallpaper side or on a 70 % wood plate.
 */
import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Layer} from '../components/Camera';
import {DesktopScene, WindowFrame} from '../components/Desktop';
import {NativeMenu, petMenuItems, switchPetItems} from '../components/NativeMenu';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PixelCursor} from '../components/PixelCursor';
import {PetSprite, PetClip} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag, WoodSign} from '../components/PixelUI';
import {COPY} from '../copy';
import {Species} from '../lib/assets';
import {ease, hit, keyframes, lerp, tween} from '../lib/anim';
import {C, alpha} from '../theme/palette';
import {At, Footnote, ImgBubble, Plate, UICrop, WarmBG} from './kit';
import {ShotComponent} from './registry';

/** Window geometry on the 1920×1080 desktop. Content = home page below the mast (no version chip). */
export const HOME_CROP = {x: 180, y: 90, width: 1240, height: 810};
/** The home page's scenery card (3D scene + in-window 荔宝), CSS px of the 1600×900 capture. */
export const SCENE_CARD = {x: 592, y: 352, width: 798, height: 434};
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

/** Pixel-block dissolve between companions (8 frames), with a 1.0 → 1.08 punch on every switch. */
export const SwitchPet: React.FC<{
  frame: number;
  seq: Array<{species: Species; at: number; clips: PetClip[]; scale: number}>;
  x: number;
  bottom: number;
  box?: {w: number; h: number};
  block?: number;
  dur?: number;
  punch?: number;
}> = ({frame, seq, x, bottom, box = {w: 360, h: 380}, block = 24, dur = 8, punch = 0.08}) => {
  let idx = 0;
  seq.forEach((s, i) => {
    if (frame >= s.at) idx = i;
  });
  const cur = seq[idx];
  const prev = idx > 0 ? seq[idx - 1] : null;
  const since = frame - cur.at;
  const t = prev ? Math.min(1, Math.max(0, since / dur)) : 1;
  const pulse = 1 + hit(frame, cur.at, 10) * punch;
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

/** NativeMenu metrics: y of the centre of item i (4k top padding, 24k items, 8.5k separators). */
export const menuItemY = (items: ReturnType<typeof petMenuItems>, i: number, y0: number, k: number) => {
  let y = 4 * k;
  for (let j = 0; j < i; j++) y += items[j].type === 'separator' ? 8.5 * k : 24 * k;
  return y0 + y + 12 * k;
};

const MENU_STATE = {name: '荔宝', lv: 3, hunger: 80, mood: 85, energy: 85, food: 3, scalePct: 150};

export const DesktopShots: ShotComponent = () => {
  const f = useCurrentFrame();
  const g = winGeom(90, 360, 1000);
  const perch = {x: g.x + g.w - 110, y: g.y + 6};
  const rest = {x: 1660, y: 1014};

  // --- pet position (bottom-centre anchor) & size: 100 % = ×5 (S04 perch ≈ 280 px), 150 % = ×7.5
  let petX = perch.x;
  let petY = perch.y;
  if (f < 56) {
    const t = tween(f, 44, 56, 0, 1, ease.out);
    petX = lerp(g.x + g.w - 260, perch.x, t);
    petY = lerp(g.y + 330, perch.y, t) - Math.sin(t * Math.PI) * 140;
  }
  const dragT = tween(f, 113, 169, 0, 1, ease.inOut);
  if (f >= 113) {
    petX = lerp(perch.x, rest.x, dragT);
    petY = lerp(perch.y, rest.y, dragT) - Math.sin(dragT * Math.PI) * 260;
  }
  const ticks = [169, 176, 183, 190, 197];
  const nTick = ticks.filter((t) => f >= t).length;
  const petScale = 5 * (1 + nTick * 0.1);

  // --- desktop camera (zoom + centre in desktop px, clamped to the screen)
  const tiltX = keyframes(f, [
    [0, 6],
    [40, 0, ease.out],
  ]);
  const tiltY = keyframes(f, [
    [0, -8],
    [40, 0, ease.out],
  ]);
  const z = keyframes(f, [
    [0, 0.94],
    [22, 1.0, ease.out],
    [56, 1.06, ease.inOut],
    [80, 1.32, ease.out],
    [108, 1.3],
    [118, 1.2, ease.inOut],
    [169, 1.15, ease.inOut],
    [197, 1.2, ease.out],
    [225, 1.2],
    [233, 1.5, ease.out],
    [338, 1.5],
  ]);
  const focusKeys: Array<[number, number, number]> = [
    [0, 960, 540],
    [22, 960, 540],
    [56, 1000, 470],
    [80, 1060, 420],
    [113, 1060, 420],
    [169, 1500, 760],
    [225, 1520, 760],
    [233, 1290, 600],
    [338, 1290, 600],
  ];
  const fx = keyframes(f, focusKeys.map(([a, x]) => [a, x, ease.inOut] as const));
  const fy = keyframes(f, focusKeys.map(([a, , y]) => [a, y, ease.inOut] as const));
  let cam = (() => {
    const c = clampFocus({x: fx, y: fy}, Math.max(1, z));
    return f < 22 ? {zoom: z, x: 0, y: 0} : {zoom: z, x: c.x, y: c.y};
  })();
  // push through the 学习书屋 nav tab (422 → 450)
  const nav = {x: g.cx + (1007.3 + 99 - HOME_CROP.x) * g.k, y: g.cy + (97.4 + 22 - HOME_CROP.y) * g.k};
  if (f >= 422) {
    const t = tween(f, 422, 450, 0, 1, ease.inExpo);
    const z0 = 1.5;
    const zz = z0 * Math.pow(16 / z0, t);
    const c0 = clampFocus({x: 1290, y: 600}, z0);
    const cx = lerp(c0.cx, nav.x, Math.min(1, t * 1.6));
    const cy = lerp(c0.cy, nav.y, Math.min(1, t * 1.6));
    cam = {zoom: zz, x: zz * (cx - 960), y: zz * (cy - 540)};
  }

  // window fly-in; softened while the menu / hero beats play
  const winRY = tween(f, 0, 22, -18, 0, ease.outBack);
  const winS = tween(f, 0, 22, 0.88, 1, ease.out);
  const winOp = tween(f, 0, 6, 0, 1, ease.linear);
  const winSoft = f >= 225 && f < 418 ? tween(f, 225, 235, 0, 1) : f >= 418 ? tween(f, 418, 426, 1, 0) : 0;

  // menu (desktop px)
  const menuX = 1290;
  const menuY = 386;
  const ms = 1.5;
  const items = petMenuItems(MENU_STATE);
  const rowY = (i: number) => menuItemY(items, i, menuY, ms);
  // S06 cursor: rests in the empty right end of the 摸摸头 bar (≈120 screen px inside the menu's
  // right edge; no label on this row or on 喂食（剩余 3 份）below reaches that far), clicks, then
  // glides off the menu onto 荔宝's head, below the 摸摸头 bubble.
  const dock = {x: menuX + 210 * ms - 80, y: rowY(4) - 8};
  const head = {x: rest.x + 34, y: rest.y - 384};

  const grab = {x: perch.x, y: perch.y - 150};
  const cursorPath: Array<readonly [number, number, number]> = [
    [96, 1500, 700],
    [111, grab.x + 6, grab.y],
    [113, grab.x, grab.y],
    ...Array.from({length: 9}).map((_, i) => {
      const t = i / 8;
      const tt = ease.inOut(t);
      return [113 + t * 56, lerp(perch.x, rest.x, tt), lerp(perch.y, rest.y, tt) - Math.sin(tt * Math.PI) * 260 - 150] as const;
    }),
    [200, rest.x + 30, rest.y - 200],
    [222, rest.x + 10, rest.y - 210],
    [225, rest.x + 6, rest.y - 212],
    [248, dock.x, dock.y],
    [287, dock.x, dock.y],
    [306, head.x, head.y],
    [336, head.x + 6, head.y + 4],
  ];
  const clicks = [113, 225, 281];

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
    <DesktopScene bezel={f < 40 ? 26 : 0} date="2026/10/13" blur={2.4} dim={0.15}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: winOp,
          transform: `perspective(1600px) rotateY(${winRY}deg) scale(${winS})`,
          transformOrigin: `${g.x + g.w / 2}px ${g.y + g.h / 2}px`,
          filter: winSoft > 0.01 ? `blur(${(winSoft * 3).toFixed(2)}px) brightness(${1 - winSoft * 0.12})` : undefined,
        }}
      >
        <HomeWindow g={g} frame={f + 30} />
      </div>
      {f >= 44 && f < 338 ? (
        <div style={{position: 'absolute', left: 0, top: 0}}>
          <PetSprite species="libao" frame={f} scale={petScale} x={petX} y={petY} anchor="bottom" clips={libaoClips} groundShadow={f >= 169} />
        </div>
      ) : null}
      {f >= 418 ? (
        <div style={{position: 'absolute', left: 0, top: 0}}>
          <PetSprite species="egret" frame={f} scale={11} x={rest.x} y={rest.y} anchor="bottom" flipX clips={[{action: 'idle', at: 0, step: 'native', loop: true}]} groundShadow />
        </div>
      ) : null}
      <PixelDust at={56} origin={{x: perch.x, y: perch.y}} count={14} seed="perch" />
      <PixelDust at={169} origin={{x: rest.x, y: rest.y}} count={16} seed="rest" />
      <ParticleBurst sprites={['icon_heart']} count={7} at={281} origin={{x: rest.x, y: rest.y - 420}} seed="hearts" mode="fountain" speed={[7, 12]} angle={[-120, -60]} gravity={0.12} scale={[4, 5]} life={[40, 56]} shadow={3} />
      <ParticleBurst squares={[C.gold, C.paperHi]} count={10} at={281} origin={{x: rest.x, y: rest.y - 420}} seed="pat-sp" speed={[4, 9]} angle={[-180, 0]} gravity={0.1} drag={0.08} scale={[6, 10]} life={[16, 26]} />
      {/* real pet.html bubbles */}
      <ImgBubble id="greet" x={perch.x - 340} y={perch.y - 110} at={56} outAt={104} scale={0.85} />
      <ImgBubble id="pat" x={rest.x - 40} y={rest.y - 440} at={309} outAt={334} scale={0.85} />
      <NativeMenu items={items} x={menuX} y={menuY} at={225} closeAt={312} highlight={f >= 248 && f < 312 ? 4 : undefined} scale={ms} />
      {f < 338 ? <PixelCursor path={cursorPath} clicks={clicks} scale={3} inAt={96} /> : null}
    </DesktopScene>
  );

  return (
    <AbsoluteFill>
      <WarmBG sprite="bg_courtyard_1920x1080" blur={14} tint={0.55} zoom={1.3} />
      <Camera zoom={cam.zoom} x={cam.x} y={cam.y} tiltX={tiltX} tiltY={tiltY} perspective={2400}>
        <Layer depth={1}>
          <div style={{position: 'absolute', inset: 0, filter: f >= 338 && f < 426 ? `blur(${(10 * (f < 418 ? tween(f, 338, 346, 0, 1) : tween(f, 418, 426, 1, 0))).toFixed(2)}px) brightness(${f < 418 ? 0.82 : 0.9})` : undefined}}>{desktop}</div>
        </Layer>
      </Camera>

      {/* S04 headline on the wallpaper side of the window */}
      {f < 113 ? (
        <At x={1150} y={560} w={720}>
          <PixelTitle text={COPY.petHeadline} size={96} start={28} stagger={6} mode="drop" exitAt={104} exitMode="up" exitStagger={1} align="left" />
        </At>
      ) : null}
      {/* S05: drag caption (lower third, plate) + promo caption for the scroll-wheel beat */}
      {f >= 116 && f < 225 ? (
        <At x={96} bottom={70}>
          <Plate at={116}>
            <BodyText text={COPY.petDrag} size={44} weight={900} color={C.paperHi} />
          </Plate>
        </At>
      ) : null}
      {f >= 169 && f < 225 ? (
        <At x={880} y={330}>
          <div style={{transform: `scale(${tween(f, 169, 175, 0.7, 1, ease.outBack)})`, transformOrigin: '100% 50%'}}>
            <WoodSign text={COPY.petScrollCaption} size={48} />
          </div>
        </At>
      ) : null}
      {/* S06 headline: lower third on a plate, left of the menu — two lines at the storyboard's
          72 px so the plate ends ≈ 40 px short of the menu's left edge (screen x 975) */}
      {f >= 225 && f < 338 ? (
        <At x={96} bottom={64}>
          <Plate at={226}>
            <PixelTitle text={`${COPY.petMenuHeadline.slice(0, 4)}\n${COPY.petMenuHeadline.slice(4)}`} size={72} start={228} stagger={3} mode="drop" align="left" exitAt={330} exitMode="fade" exitStagger={0} />
          </Plate>
        </At>
      ) : null}
      {/* S07: companion hero over the softened desktop */}
      {f >= 338 && f < 432 ? <SwitchHero f={f} /> : null}
      {f < 422 ? <CornerTag text={COPY.sections[0]} at={4} /> : null}
    </AbsoluteFill>
  );
};

/** S07 (local 338–432): big companion in the middle, real menu + 切换伙伴 submenu at the left. */
const SwitchHero: React.FC<{f: number}> = ({f}) => {
  const fade = f < 418 ? tween(f, 338, 342, 0, 1) : tween(f, 418, 426, 1, 0);
  const k = 1.7;
  const items = petMenuItems(MENU_STATE);
  const mx = 120;
  const my = 150;
  const subX = mx + 210 * k - 6;
  const subY = menuItemY(items, 8, my, k) - 4 * k - 12 * k;
  const sub = switchPetItems(f >= 394 ? 2 : f >= 366 ? 1 : 0);
  const subRow = (i: number) => subY + 4 * k + i * 24 * k + 12 * k;
  const gx = subX + 8;
  const nameSeg = (txt: string, lit: number) => ({text: txt, litAt: lit, litColor: C.gold, color: alpha(C.paper, 0.55)});
  const punch = 1 + Math.max(hit(f, 338, 10), hit(f, 366, 10), hit(f, 394, 10)) * 0.08;
  return (
    <AbsoluteFill style={{opacity: fade}}>
      <AbsoluteFill style={{transform: `scale(${punch})`, transformOrigin: '1280px 980px'}}>
        <SwitchPet
          frame={f}
          x={1280}
          bottom={990}
          box={{w: 640, h: 640}}
          block={32}
          punch={0}
          seq={[
            {species: 'libao', at: 338, scale: 10, clips: [{action: 'idle', at: 0, step: 'native', loop: true}]},
            {species: 'chestnut', at: 366, scale: 24, clips: [{action: 'signature', at: 366, step: 8}]},
            {species: 'egret', at: 394, scale: 17, clips: [{action: 'signature', at: 394, step: 8}]},
          ]}
        />
      </AbsoluteFill>
      <PixelDust at={366} origin={{x: 1280, y: 990}} count={18} seed="sw1" spread={1.4} />
      <PixelDust at={394} origin={{x: 1280, y: 990}} count={18} seed="sw2" spread={1.4} />
      <ImgBubble id="chestnut" x={1130} y={420} at={380} outAt={392} scale={0.95} />
      <ImgBubble id="egret" x={1130} y={400} at={408} outAt={440} scale={0.95} />
      <NativeMenu items={items} x={mx} y={my} at={338} highlight={8} scale={k} />
      <NativeMenu items={sub} x={subX} y={subY} at={344} highlight={f >= 394 ? 2 : f >= 366 ? 1 : f >= 352 ? 0 : undefined} scale={k} width={150} />
      {f < 402 ? (
        <PixelCursor
          path={[
            [338, mx + 120 * k, menuItemY(items, 8, my, k)],
            [348, gx, subRow(0) - 6],
            [358, gx, subRow(1) - 6],
            [366, gx, subRow(1) - 6],
            [386, gx, subRow(2) - 6],
            [394, gx, subRow(2) - 6],
          ]}
          clicks={[338, 366, 394]}
          scale={3}
          inAt={338}
        />
      ) : null}
      <At x={96} bottom={64}>
        <Plate>
          <PixelTitle text={[nameSeg('荔宝', 338), {text: ' · '}, nameSeg('栗栗', 366), {text: ' · '}, nameSeg('小白', 394), {text: '，随时切换', color: C.paper}]} size={64} start={338} stagger={2} mode="pop" align="left" />
        </Plate>
      </At>
      <At right={96} y={52}>
        <Footnote text={COPY.petPlatformNote} at={344} size={28} />
      </At>
    </AbsoluteFill>
  );
};
