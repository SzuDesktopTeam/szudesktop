/**
 * 03 庭院世界 — S13–S18 (20.625–33.750 s): the drop through the app's own cel-shaded scenes
 * (real WebGL dolly renders), the four-skin grid, building the lakeside picnic corner, the
 * 2048 climb to 荔宝丰收礼, and the real claim of the daily seed gift.
 *
 * v2 (review): scene clips are re-rendered per shot (assets clip_scene_*_s13/_s14/_s15 and _v7)
 * and played at 1× — no 1.7× / 2.2× frame skipping; +15 % saturation / +10 % contrast to sit with
 * the pixel art; beat-1 scale pulse; ×24–30 foreground flora sweeping across at ~2 frame widths
 * per bar; the three companions run through the S13 foreground on beat 3. Whips are done at Film
 * level. S17's climax: real dolly into the two 1024s, flat 3-frame flash, the gift at ~86 % of
 * frame height, the title slammed in as one word on the impact and held to the cut.
 *
 * v3 (review): SCENE_GRADE is an SVG tone curve that crushes the renders' fog floor to black
 * (scene 1 % percentile ≤ 30, highlights ≤ ≈ 246); the S13 companions run above the scene name;
 * 9:16 2048 has no tile ladder, a one-line name strip under the board and a gentler climb so the
 * board never covers it; S18 shows only the popped toast (the capture's own copy is clean-plated).
 */
import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Card3D, Layer} from '../components/Camera';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {BodyText} from '../components/BodyText';
import {CornerTag, PixelPanel, WoodSign} from '../components/PixelUI';
import {PixelCursor} from '../components/PixelCursor';
import {ImpactRing, Pixelate, SoftFlash, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {PARTICLES, Species, TILE_LEVELS, useSpriteSrc} from '../lib/assets';
import {ease, hit, keyframes, lerp, shake, springAt, tween} from '../lib/anim';
import {EIGHTH, SIXTEENTH, useShotClock} from '../lib/beat';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {SCENE_CARD} from './desktop';
import {camAt} from './focus';
import {At, Footnote, PixImg, Plate, Rect, TileCard, UICrop, Vid, WarmBG, footage} from './kit';
import {ShotComponent} from './registry';

/**
 * v3 grade for the cel-shaded renders. Their darkest pixel is a fog floor at ≈ 59/255 (every
 * clip), so a plain contrast() can't reach a real black. This is a tone curve (sRGB, per
 * channel) after +10 % saturation: the floor 50–59 → 0–10, 1 % percentile ≈ 17–30, mid-tones
 * kept (lake / bookshop medians ≈ unchanged), a soft shoulder above 208 so highlights stay
 * under ≈ 246. Knots are (in, out) in 0–255.
 */
const GRADE_ID = 'szd-scene-grade';
const GRADE_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [50, 0],
  [59, 10],
  [66, 18],
  [76, 29],
  [90, 47],
  [100, 62],
  [120, 95],
  [155, 150],
  [170, 172],
  [191, 199],
  [208, 220],
  [229, 242],
  [240, 249],
  [255, 255],
];
const GRADE_TABLE = Array.from({length: 33}, (_, k) =>
  (interpolate((k * 255) / 32, GRADE_KNOTS.map((p) => p[0]), GRADE_KNOTS.map((p) => p[1])) / 255).toFixed(4),
).join(' ');

/**
 * CSS filter for the scene plates (SceneShot here, V07 in vertical.tsx). It references the SVG
 * filter that <SceneGradeDefs/> puts in the document; SceneFlora renders those defs, and every
 * scene plate mounts SceneFlora, so the reference always resolves.
 */
export const SCENE_GRADE = `url(#${GRADE_ID})`;

export const SceneGradeDefs: React.FC = () => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <filter id={GRADE_ID} colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="1.1" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={GRADE_TABLE} />
        <feFuncG type="table" tableValues={GRADE_TABLE} />
        <feFuncB type="table" tableValues={GRADE_TABLE} />
      </feComponentTransfer>
    </filter>
  </svg>
);

/* ---------------------------------------------------------------- scenes */
/**
 * Big foreground flora sweeping right → left at `speed` px/frame (≈ 2 frame widths per bar).
 * Also carries the SVG defs of SCENE_GRADE (see above).
 */
export const SceneFlora: React.FC<{frame: number; speed?: number; y?: number; scale?: number; count?: number}> = ({frame, speed = 34, y = 1110, scale = 26, count = 7}) => {
  const {width} = useVideoConfig();
  const keys = ['flora_tallgrass', 'flora_berrybush', 'flora_tallgrass', 'flora_tallgrass', 'flora_berrybush'];
  const gapX = (width + 900) / count;
  const span = gapX * count;
  return (
    <>
      <SceneGradeDefs />
      {Array.from({length: count}).map((_, i) => {
        let x = (width + 200 + i * gapX - frame * speed) % span;
        if (x < -450) x += span;
        const sc = scale + (i % 3 === 0 ? 6 : i % 3 === 1 ? 0 : -4);
        return <PixelSprite key={i} sprite={keys[i % keys.length]} scale={sc} x={Math.round(x)} y={y + (i % 2) * 24} anchor="bottom-left" />;
      })}
    </>
  );
};

/** The three companions running through the foreground (walk frames), left → right. */
const RunningPets: React.FC<{at: number; y: number; vertical?: boolean}> = ({at, y, vertical}) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const pets: Array<{sp: Species; s: number; dx: number}> = vertical
    ? [
        {sp: 'chestnut', s: 12, dx: 0},
        {sp: 'libao', s: 6, dx: -260},
        {sp: 'egret', s: 9, dx: -520},
      ]
    : [
        {sp: 'chestnut', s: 14, dx: 0},
        {sp: 'libao', s: 7, dx: -330},
        {sp: 'egret', s: 10, dx: -640},
      ];
  const x0 = -160 + (f - at) * (vertical ? 24 : 34);
  return (
    <>
      {pets.map((p, i) => (
        <PetSprite key={p.sp} species={p.sp} frame={f} scale={p.s} x={x0 + p.dx} y={y - (Math.floor((f - at) / 5 + i) % 2) * 6} anchor="bottom" flipX={p.sp === 'egret'} clips={[{action: 'walk', at, step: 4, loop: true}]} shadow={6} />
      ))}
    </>
  );
};

type SceneProps = {clip: string; name: string; tag?: boolean; vertical?: boolean};

/** Full-frame dolly render (1× playback) + graded + parallax foreground + slammed scene name. */
export const SceneShot: React.FC<SceneProps & {extra?: React.ReactNode; nameAt?: number; nameOut?: number; runAt?: number}> = ({clip, name, tag, extra, nameAt = 0, nameOut, runAt, vertical}) => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const {height: H} = useVideoConfig();
  const pulse = hit(f, 0, 6) * 0.08 + Math.max(hit(f, at(1), 6), hit(f, at(2), 6), hit(f, at(3), 6)) * 0.025;
  const z = tween(f, 0, at(4), 1.0, 1.06, ease.linear) + pulse;
  const sh = shake(f, 0, 10, 12, 31, 1);
  const cam = {zoom: z, rotate: tween(f, 0, at(4), -0.8, 0.8, ease.linear), shake: sh};
  return (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={1}>
          <AbsoluteFill style={{filter: SCENE_GRADE}}>
            <Vid name={clip} frame={f} />
          </AbsoluteFill>
        </Layer>
        <Layer depth={1.8}>
          {extra}
          <SceneFlora frame={f} y={H + 40} />
        </Layer>
      </Camera>
      <AbsoluteFill style={{background: `linear-gradient(0deg, ${alpha(C.woodDark, 0.5)} 0%, transparent 30%)`}} />
      <At x={96} y={720}>
        <PixelTitle text={name} size={168} start={nameAt} stagger={3} mode="slam" color={C.paperHi} exitAt={nameOut} exitMode="drop" exitStagger={0} />
      </At>
      {/* the companions run in front of everything, the scene name included: same camera move,
          same 1.8 foreground parallax, just stacked above the title */}
      {runAt !== undefined && f >= runAt ? (
        <Camera {...cam}>
          <Layer depth={1.8}>
            <RunningPets at={runAt} y={H + 6} />
          </Layer>
        </Camera>
      ) : null}
      <At right={96} y={56}>
        <Footnote text={COPY.sceneNote} size={26} />
      </At>
      {tag ? <CornerTag text={COPY.sections[2]} at={2} /> : null}
    </AbsoluteFill>
  );
};

export const S13: ShotComponent = () => {
  const {at} = useShotClock();
  return (
    <>
      <SceneShot clip="clip_scene_lake_s13" name={COPY.scenes[0]} tag runAt={at(2)} />
      <ImpactRing at={0} x={960} y={600} frames={18} maxR={1200} unit={16} />
      <WhiteFlash at={0} frames={2} fadeFrames={5} />
    </>
  );
};

export const S14: ShotComponent = () => {
  const {at} = useShotClock();
  // light drizzle of the app's own water-drop pixels (fx_waterdrop), not the watering-can icon
  const drops = <ParticleBurst sprites={['fx_waterdrop']} count={46} at={-40} mode="rain" origin={{x: 0, y: 0}} area={{x: -100, y: -260, w: 2200, h: 260}} seed="drizzle" speed={[52, 70]} gravity={0.5} scale={[4, 5]} life={[40, 60]} stagger={3} fade={4} />;
  return (
    <>
      <SceneShot clip="clip_scene_bookshop_s14" name={COPY.scenes[1]} extra={drops} />
      <SoftFlash at={at(2)} />
    </>
  );
};

/** Four home-page skins, cropped to the scenery card only, flipped in on 16th notes. */
const SkinGrid: React.FC<{at0: number; step: number; vertical?: boolean}> = ({at0, step, vertical}) => {
  const f = useCurrentFrame();
  const stills = ['ui_home_pixel.png', 'ui_home_lake.png', 'ui_home_bookshop.png', 'ui_home_terrace.png'];
  const {width: W, height: H} = useVideoConfig();
  const cols = vertical ? 1 : 2;
  const rows = vertical ? 4 : 2;
  const gap = vertical ? 18 : 22;
  const cw = vertical ? 760 : 820;
  const k = cw / SCENE_CARD.width;
  const chh = SCENE_CARD.height * k;
  const gw = cols * cw + (cols - 1) * gap;
  const gh = rows * chh + (rows - 1) * gap;
  const x0 = (W - gw) / 2;
  const y0 = vertical ? 260 : (H - gh) / 2;
  return (
    <>
      {stills.map((s, i) => {
        const a = at0 + i * step;
        if (f < a) return null;
        const ry = tween(f, a, a + 6, 90, 0, ease.outBack);
        const c = i % cols;
        const r = Math.floor(i / cols);
        return (
          <div key={s} style={{position: 'absolute', left: x0 + c * (cw + gap), top: y0 + r * (chh + gap), width: cw, height: chh, transform: `perspective(1400px) rotateY(${ry}deg)`, transformOrigin: c === 0 ? '100% 50%' : '0% 50%', boxShadow: `0 16px 40px ${alpha(C.woodDark, 0.6)}`, outline: `5px solid ${C.paperHi}`}}>
            <UICrop still={s} rect={SCENE_CARD} k={k} />
          </div>
        );
      })}
    </>
  );
};

export const S15: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const lanterns = <ParticleBurst sprites={['icon_lantern', 'icon_flower', 'icon_lantern']} count={14} at={0} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: 1150, w: 1920, h: 120}} seed="lant" speed={[-14, -8]} gravity={-0.04} scale={[5, 7]} life={[110, 140]} stagger={3} />;
  return (
    <>
      <SceneShot clip="clip_scene_terrace_s15" name={COPY.scenes[2]} extra={lanterns} nameOut={at(2) - 4} />
      {f >= at(2) ? <AbsoluteFill style={{background: alpha(C.woodDark, tween(f, at(2), at(2) + 6, 0, 0.72))}} /> : null}
      <SkinGrid at0={at(2)} step={SIXTEENTH} />
      {f >= at(2) ? (
        <At center y={508}>
          <BodyText text={COPY.scenesSub} size={40} weight={900} plate="wood" inAt={at(2) + 4} />
        </At>
      ) : null}
      <SoftFlash at={0} />
    </>
  );
};

/* ---------------------------------------------------------------- S16 build */
const BUILD_RECT: Rect = {x: 203, y: 150, width: 1194, height: 740};
/** The real toast of clip_build_picnic (CSS px of the capture). */
const BUILD_TOAST: Rect = {x: 566, y: 780, width: 472, height: 102};

export const BuildPicnic: React.FC<{vertical?: boolean; thuds: number[]; switchAt: number; chipsAt: number; clickAt: number; end: number; firstStep?: number; ready?: boolean}> = ({vertical, thuds, switchAt, chipsAt, clickAt, end, firstStep = 6, ready = false}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const src = useSpriteSrc();
  // part 1: the real build card (ready state → click → real toast)
  if (f < switchAt) {
    const k = vertical ? 0.86 : 1.05;
    const cw = BUILD_RECT.width * k;
    const ch = BUILD_RECT.height * k;
    const cx = W / 2;
    const cy = vertical ? 820 : 600;
    const ox = cx - cw / 2;
    const oy = cy - ch / 2;
    const P = (vx: number, vy: number) => ({x: ox + 6 + (vx - BUILD_RECT.x) * k, y: oy + 6 + (vy - BUILD_RECT.y) * k});
    const btn = P(1291.5, 447);
    const req = P(580, 355);
    // ready: hold source frames 0–27 (the button is still there), source 28 = the click
    const srcF = ready ? (f < clickAt ? Math.min(27, f) : 28 + (f - clickAt)) : f - clickAt + 28;
    const z = ready
      ? keyframes(f, [
          [0, 1.0],
          [clickAt - 2, 1.32, ease.out],
          [clickAt + 10, 1.2, ease.inOut],
          [switchAt, 1.12],
        ])
      : 1;
    const focus = ready ? {x: lerp(960, (req.x + btn.x) / 2, tween(f, 0, clickAt, 0, 1, ease.out)), y: lerp(540, (req.y + btn.y) / 2 + 40, tween(f, 0, clickAt, 0, 1, ease.out))} : {x: cx, y: cy};
    const cam = ready ? camAt(focus, z) : {zoom: 1, x: 0, y: 0};
    const toastIn = springAt(f, clickAt + 4, {damping: 12, stiffness: 220});
    const tk = k * 1.4 * (vertical ? 1.1 : 1);
    return (
      <AbsoluteFill>
        <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={8} tint={0.45} zoom={1.2} />
        <Camera {...cam}>
          <Layer depth={1}>
            <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={tween(f, 0, switchAt, 0, -10, ease.inOut)} rotateX={3}>
              <UICrop clip="clip_build_picnic" frame={srcF} rect={BUILD_RECT} k={k} />
            </Card3D>
            <ImpactRing at={clickAt} x={btn.x} y={btn.y} frames={14} maxR={160} unit={8} color={C.gold} />
            {ready ? (
              <PixelCursor
                path={[
                  [0, btn.x + 260, btn.y + 260],
                  [clickAt - 4, btn.x - 30, btn.y + 4],
                  [clickAt + 20, btn.x - 50, btn.y + 40],
                ]}
                clicks={[clickAt]}
                scale={3}
                inAt={0}
              />
            ) : null}
          </Layer>
        </Camera>
        {/* the real toast, cropped from the same capture and popped at 1.4× */}
        {f >= clickAt + 4 ? (
          <div style={{position: 'absolute', left: vertical ? W / 2 : 1330, top: vertical ? 1180 : 190, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * toastIn})`, opacity: Math.min(1, toastIn * 1.5), filter: `drop-shadow(8px 8px 0 ${alpha(C.woodDark, 0.5)})`}}>
            <UICrop clip="clip_build_picnic" frame={Math.max(srcF, 60)} rect={BUILD_TOAST} k={tk} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }
  // part 2: the picnic corner builds row by row in the real farm scene
  const step = thuds.filter((t) => f >= t).length; // 0..n
  const stepIdx = Math.min(14, firstStep + step);
  const art = vertical ? 18 : 16;
  const artW = 48 * art;
  const artH = 28 * art;
  const cx = W / 2;
  const base = vertical ? 1180 : 860;
  const push = 1 + step * 0.012;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `scale(${push})`}}>
        <Img src={footage('ui_farm_picnic_built.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(5px) saturate(1.05)'}} />
        <AbsoluteFill style={{background: alpha(C.woodDark, 0.45)}} />
        <div style={{position: 'absolute', left: cx - artW / 2, top: base - artH, width: artW, height: artH}}>
          <Img src={src(`project_picnic_build_${String(stepIdx).padStart(2, '0')}`)} style={{width: artW, height: artH, imageRendering: 'pixelated', filter: `drop-shadow(10px 10px 0 ${alpha(C.woodDark, 0.6)})`}} />
        </div>
        {thuds.map((t, i) => (
          <PixelDust key={i} at={t} origin={{x: cx + ((i % 3) - 1) * 220, y: base - (i / thuds.length) * artH * 0.8}} count={10} seed={`b${i}`} />
        ))}
        <div style={{position: 'absolute', left: cx + artW / 2 + (vertical ? -120 : 60), top: base + 10}}>
          <PetSprite species="libao" frame={f} scale={vertical ? 7 : 8} x={0} y={0} anchor="bottom" clips={[{action: 'build', at: switchAt, step: 9, loop: true}]} shadow={8} />
        </div>
      </AbsoluteFill>
      {/* the three build projects */}
      <div style={{position: 'absolute', left: 0, right: 0, top: vertical ? 1290 : 70, display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: vertical ? 16 : 28}}>
        {(['project_picnic', 'project_seedrack', 'project_lakeLights'] as const).map((p, i) => {
          const a = chipsAt + i * 5;
          if (f < a) return null;
          const s = springAt(f, a, {damping: 12, stiffness: 220});
          const label = COPY.buildProjects.split(' · ')[i];
          return (
            <div key={p} style={{transform: `translateY(${(1 - s) * (vertical ? 200 : -200)}px)`, opacity: Math.min(1, s * 2)}}>
              <PixelPanel fill={C.paper} border={C.wood} unit={5} shadow={7} padding="8px 18px 8px 10px">
                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                  <PixImg sprite={p} w={96} />
                  <span style={{fontFamily: FONT_PIXEL, fontSize: 36, color: C.ink, whiteSpace: 'nowrap'}}>{label}</span>
                </div>
              </PixelPanel>
            </div>
          );
        })}
      </div>
      {f < end ? null : null}
    </AbsoluteFill>
  );
};

export const S16: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  useFontsFor(COPY.buildProjects, [400]);
  const thuds = [56, 63, 70, 77, 84, 91, 98, 105];
  const punch = tween(f, at(4) - 9, at(4), 0, 1, ease.inExpo);
  return (
    <AbsoluteFill>
      <BuildPicnic thuds={thuds} switchAt={at(2)} chipsAt={at(3)} clickAt={at(1)} end={at(4)} ready />
      <At x={96} bottom={44}>
        <Plate at={at(0)}>
          <PixelTitle text={COPY.buildHeadline} size={84} start={at(0) + 2} stagger={3} mode="drop" align="left" />
        </Plate>
      </At>
      <SoftFlash at={at(2)} />
      {/* punch into a 2048 tile → S17 */}
      {punch > 0 ? (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div style={{transform: `scale(${0.3 + punch * 9})`, opacity: Math.min(1, punch * 4)}}>
            <TileCard value={2} size={200} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- S17 2048 */
type Cell = [number, number];
const NAMES: Record<number, string> = Object.fromEntries(TILE_LEVELS.map((t) => [t.value, t.name]));

/**
 * The 2048 merge montage (demo animation with the app's real tile art, no score shown).
 * merges[k] = local frame where value 2^(k+1) merges into the active cell. final = 1024+1024.
 */
export const Board2048: React.FC<{merges: number[]; m1024: number; glowAt: number; finalAt: number; titleAt: number; vertical?: boolean}> = ({merges, m1024, glowAt, finalAt, titleAt, vertical}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const T = vertical ? 200 : 178;
  const gap = 16;
  const pad = 18;
  const bord = 9;
  const boardW = 4 * T + 3 * gap + 2 * pad + 2 * bord;
  const bc = vertical ? {x: W / 2, y: 860} : {x: 660, y: 520};
  const cellPos = ([r, c]: Cell) => ({x: bc.x - boardW / 2 + bord + pad + c * (T + gap), y: bc.y - boardW / 2 + bord + pad + r * (T + gap)});
  const A: Cell = [1, 1];
  const B: Cell = [1, 2];
  const dirs: Cell[] = [
    [1, 0],
    [2, 1],
    [0, 1],
  ];
  const statics: Array<[Cell, number]> = [
    [[0, 0], 2],
    [[0, 2], 8],
    [[0, 3], 4],
    [[1, 3], 16],
    [[2, 0], 4],
    [[2, 2], 32],
    [[2, 3], 2],
    [[3, 0], 8],
    [[3, 1], 2],
    [[3, 2], 4],
    [[3, 3], 64],
  ];
  const allMerges = [...merges, m1024];
  const nDone = allMerges.filter((m) => f >= m).length;
  const aValue = f >= finalAt ? 2048 : 2 ** (nDone + 1);
  const exploded = f >= finalAt;
  const glow = f >= glowAt && !exploded;
  // board tilt flattens during the glow beat so the dolly lands exactly on the pair
  const flat = tween(f, glowAt, glowAt + 8, 0, 1, ease.out);
  // camera: slow climb, then a real dolly into the two 1024s (≈ 70 % of frame width).
  // 16:9 climbs 3.3 % per merge while drifting onto the pair. 9:16 climbs only 1.3 % per merge
  // (z ≤ 1.12) around a point 130 px below the board centre, so the tilted board (front edge +
  // hard shadow ≈ 506 px below bc after the 20° tilt) stays above y ≈ 1390 and clear of the name
  // strip at y 1422–1518 until the glow beat.
  const climb = vertical ? 0.013 : 0.033;
  let z = 1 + nDone * climb;
  const zClimbEnd = 1 + allMerges.length * climb;
  const pairC = {x: (cellPos(A).x + cellPos(B).x) / 2 + T / 2, y: cellPos(A).y + T / 2};
  let c = vertical ? {x: bc.x, y: bc.y + 130} : {x: lerp(bc.x + 240, pairC.x, nDone / 9), y: lerp(bc.y, pairC.y, nDone / 9)};
  const zGlow = vertical ? (W * 0.96) / (2 * T + gap) : (W * 0.7) / (2 * T + gap);
  if (f >= glowAt && f < finalAt) {
    const t = tween(f, glowAt, finalAt - 1, 0, 1, ease.inOut);
    z = lerp(zClimbEnd, zGlow, t);
    c = {x: lerp(c.x, pairC.x, Math.min(1, t * 2)), y: lerp(c.y, pairC.y, Math.min(1, t * 2))};
  }
  const cam = camAt(c, z, W, H);
  const glowShake = glow ? {x: (Math.floor(f / 2) % 2 ? 2 : -2), y: (Math.floor(f / 2 + 1) % 2 ? 2 : -2), rot: 0} : {x: 0, y: 0, rot: 0};
  const sh0 = shake(f, finalAt, 14, 22, 41, 1);
  const sh = {x: sh0.x + glowShake.x, y: sh0.y + glowShake.y, rot: sh0.rot};
  const beatWob = (Math.sin((f / (EIGHTH * 2)) * Math.PI) * 2) * (1 - flat);
  const lit1024 = f >= m1024;

  const tileAt = (cell: Cell, v: number, key: string, extra?: {dx?: number; dy?: number; s?: number; op?: number; glow?: boolean; z?: number; dimmed?: boolean}) => {
    const p = cellPos(cell);
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: p.x + (extra?.dx ?? 0),
          top: p.y + (extra?.dy ?? 0),
          width: T,
          height: T,
          transform: `scale(${extra?.s ?? 1})`,
          opacity: extra?.op ?? 1,
          zIndex: extra?.z ?? 1,
          filter: extra?.glow ? `drop-shadow(0 0 ${18 + Math.sin(f / 3) * 8}px ${C.gold}) drop-shadow(0 0 4px ${C.paperHi})` : extra?.dimmed ? 'grayscale(0.85) brightness(0.55)' : undefined,
        }}
      >
        <TileCard value={v} size={T} />
      </div>
    );
  };

  const tiles: React.ReactNode[] = [];
  const dim = glow ? 0.25 : 1;
  statics.forEach(([cell, v], i) => tiles.push(tileAt(cell, v, `s${i}`, {op: exploded ? 0 : dim})));
  // B = the other 荔枝篮 1024: dimmed until the active cell reaches 1024, then both light up
  if (!exploded) {
    let dx = 0;
    if (f >= finalAt - 3) dx = -tween(f, finalAt - 3, finalAt, 0, T + gap, ease.in);
    const s = lit1024 ? 1 + hit(f, m1024, 9) * 0.3 : 1;
    tiles.push(tileAt(B, 1024, 'B', {dx, glow, z: 2, dimmed: !lit1024, s}));
  }
  // incoming partner for the next merge
  const next = allMerges.findIndex((m) => f < m);
  if (next >= 0 && !exploded) {
    const m = allMerges[next];
    const v = 2 ** (next + 1);
    const from = dirs[next % 3];
    const spawn = m - 9;
    if (f >= spawn) {
      const slide = tween(f, m - 3, m, 0, 1, ease.in);
      const fp = cellPos(from);
      const ap = cellPos(A);
      const s = f < m - 3 ? tween(f, spawn, spawn + 5, 0.2, 1, ease.outBack) : 1;
      tiles.push(tileAt(from, v, 'P', {dx: (ap.x - fp.x) * slide, dy: (ap.y - fp.y) * slide, s, z: 3}));
    }
  }
  // the active cell
  if (!exploded) {
    const last = allMerges[nDone - 1];
    const s = last !== undefined ? 1 + hit(f, last, 9) * 0.35 : 1;
    tiles.push(tileAt(A, aValue, 'A', {s, glow, z: 4}));
  }
  const cropOf = (v: number) => (v >= 1024 ? 'crop_lychee' : v >= 512 ? 'crop_blueberry' : v >= 256 ? 'crop_strawberry' : v >= 128 ? 'crop_radish' : v >= 64 ? 'crop_lychee' : v >= 32 ? 'crop_blueberry' : v >= 16 ? 'crop_strawberry' : v >= 8 ? 'crop_radish' : 'icon_seed');
  const ap = cellPos(A);
  const center = {x: ap.x + T / 2, y: ap.y + T / 2};

  const board = (
    <div style={{position: 'absolute', left: bc.x - boardW / 2, top: bc.y - boardW / 2, width: boardW, height: boardW, background: '#bd9568', border: `${bord}px solid #8d633b`, boxSizing: 'border-box', boxShadow: `0 30px 60px ${alpha(C.woodDark, 0.6)}, 14px 14px 0 ${C.woodDark}`, opacity: exploded ? tween(f, finalAt, finalAt + 6, 1, 0) : 1}}>
      {Array.from({length: 16}).map((_, i) => {
        const p = cellPos([Math.floor(i / 4), i % 4]);
        return <div key={i} style={{position: 'absolute', left: p.x - (bc.x - boardW / 2) - bord, top: p.y - (bc.y - boardW / 2) - bord, width: T, height: T, background: '#a57d54', opacity: glow ? 0.5 : 1}} />;
      })}
    </div>
  );

  const lastV = nDone > 0 ? 2 ** (nDone + 1) : 0;
  const lastAt = allMerges[nDone - 1] ?? 0;
  const ladderVals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  const reached = (v: number) => v <= (exploded ? 2048 : Math.max(2, lastV));
  useFontsFor(TILE_LEVELS.map((t) => t.name).join('') + '0123456789 ', [400]);

  const giftScale = vertical ? 31 : 30;
  const giftY = vertical ? 700 : 545;
  const giftIn = springAt(f, finalAt, {damping: 10, stiffness: 190, mass: 0.7});
  const hideHud = f >= glowAt;

  return (
    <AbsoluteFill>
      <Camera {...(exploded ? {zoom: 1, x: 0, y: 0} : cam)} shake={sh} perspective={1800}>
        <Layer depth={0.3}>
          <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={10} tint={glow ? 0.8 : 0.55} zoom={1.3} />
        </Layer>
        <Layer depth={1}>
          <AbsoluteFill style={{transform: `perspective(1800px) rotateX(${exploded ? 0 : (20 + beatWob) * (1 - flat)}deg) rotateZ(${exploded ? 0 : (-2 + beatWob * 0.5) * (1 - flat)}deg)`, transformOrigin: `${bc.x}px ${bc.y}px`}}>
            {board}
            {tiles}
            {allMerges.map((m, i) => (
              <ParticleBurst key={i} sprites={[cropOf(2 ** (i + 2)), 'icon_coin']} count={10} at={m} origin={center} seed={`mg${i}`} speed={[10, 22]} angle={[-180, 0]} gravity={0.8} scale={[4, 6]} life={[30, 45]} shadow={3} />
            ))}
            {allMerges.map((m, i) => (
              <ImpactRing key={`r${i}`} at={m} x={center.x} y={center.y} frames={12} maxR={260} unit={10} color={C.gold} />
            ))}
          </AbsoluteFill>
        </Layer>
      </Camera>
      {/* tile name callout (9:16: one line under the board — tile 96 px + name and value 64 px) */}
      {!exploded && nDone > 0 && !hideHud ? (
        vertical ? (
          <At x={0} y={1422} w={W} style={{display: 'flex', justifyContent: 'center'}}>
            <div key={nDone} style={{display: 'flex', alignItems: 'center', gap: 22, height: 96, transform: `scale(${1 + hit(f, lastAt, 8) * 0.25})`}}>
              <PixImg sprite={`tile_${lastV}`} w={96} />
              <span style={{fontFamily: FONT_PIXEL, fontSize: 64, color: C.paperHi, lineHeight: 1, whiteSpace: 'nowrap', textShadow: `5px 5px 0 ${C.woodDark}, -3px -3px 0 ${C.lycheeDeep}, 3px -3px 0 ${C.lycheeDeep}, -3px 3px 0 ${C.lycheeDeep}`}}>{NAMES[lastV]}</span>
              <span style={{fontFamily: FONT_PIXEL, fontSize: 64, color: C.gold, lineHeight: 1, textShadow: `5px 5px 0 ${C.woodDark}, -3px -3px 0 ${C.woodDark}, 3px -3px 0 ${C.woodDark}, -3px 3px 0 ${C.woodDark}`}}>{lastV}</span>
            </div>
          </At>
        ) : (
          <At x={1240} y={330} w={640}>
            <div key={nDone} style={{display: 'flex', alignItems: 'center', gap: 20, transform: `scale(${1 + hit(f, lastAt, 8) * 0.25})`, transformOrigin: '0 50%'}}>
              <PixImg sprite={`tile_${lastV}`} w={192} />
              <div>
                <div style={{fontFamily: FONT_PIXEL, fontSize: 96, color: C.paperHi, lineHeight: 1, textShadow: `5px 5px 0 ${C.woodDark}, -3px -3px 0 ${C.lycheeDeep}, 3px -3px 0 ${C.lycheeDeep}, -3px 3px 0 ${C.lycheeDeep}`}}>{NAMES[lastV]}</div>
                <div style={{fontFamily: FONT_PIXEL, fontSize: 84, color: C.gold, lineHeight: 1.1, textShadow: `5px 5px 0 ${C.woodDark}`}}>{lastV}</div>
              </div>
            </div>
          </At>
        )
      ) : null}
      {/* ladder of the 11 tiles (16:9 only, clear of the board; the 9:16 board needs the room) */}
      {!hideHud && !vertical ? (
        <div style={{position: 'absolute', left: 1240, top: 760, display: 'flex', gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap', width: 600}}>
          {ladderVals.map((v) => {
            const on = reached(v);
            return (
              <div key={v} style={{opacity: on ? 1 : 0.28, filter: on ? undefined : 'grayscale(1)', transform: on && v === lastV ? `translateY(${-Math.round(hit(f, lastAt, 8) * 14)}px)` : undefined}}>
                <PixImg sprite={`tile_${v}`} w={64} />
              </div>
            );
          })}
        </div>
      ) : null}
      {!hideHud ? (
        <At x={vertical ? 0 : 1240} y={vertical ? 150 : 150} w={vertical ? W : undefined} style={vertical ? {display: 'flex', justifyContent: 'center'} : undefined}>
          <WoodSign text={vertical ? COPY.vertical.arcade : COPY.arcadeLabel} size={48} />
        </At>
      ) : null}
      {/* the climax */}
      {exploded ? (
        <>
          <AbsoluteFill style={{background: `radial-gradient(circle at 50% ${(giftY / H) * 100}%, ${alpha(C.gold, 0.6)} 0%, transparent 60%)`}} />
          <ParticleBurst sprites={PARTICLES.confetti} count={110} at={finalAt} origin={{x: W / 2, y: giftY}} seed="conf" speed={[22, 56]} angle={[-180, 180]} gravity={0.55} drag={0.025} scale={[6, 11]} life={[80, 140]} shadow={4} />
          <ParticleBurst sprites={['icon_coin', 'icon_heart', 'icon_seed']} count={40} at={finalAt + 6} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: -260, w: W, h: 200}} seed="conf-rain" speed={[20, 30]} gravity={0.35} scale={[4, 7]} life={[90, 120]} stagger={1} flip />
          <div style={{position: 'absolute', left: W / 2, top: giftY, transform: `translate(-50%, -50%) scale(${giftIn}) rotate(${(1 - giftIn) * -14}deg)`}}>
            <PixelSprite sprite="tile_2048" scale={giftScale} shadow={18} />
          </div>
          <ImpactRing at={finalAt} x={W / 2} y={giftY} frames={22} maxR={1500} unit={20} />
          <ImpactRing at={finalAt + 4} x={W / 2} y={giftY} frames={22} maxR={1100} unit={14} color={C.gold} />
          <At x={0} y={vertical ? 1180 : 800} w={W} style={{display: 'flex', justifyContent: 'center'}}>
            {vertical ? (
              <div>
                <PixelTitle text={COPY.vertical.arcadeClimax} size={144} start={titleAt} mode="whole" color={C.gold} />
                <PixelTitle text="2048" size={192} start={titleAt} mode="whole" color={C.paperHi} />
              </div>
            ) : (
              <PixelTitle text={COPY.arcadeClimax} size={192} start={titleAt} mode="whole" color={C.gold} />
            )}
          </At>
        </>
      ) : null}
      <WhiteFlash at={finalAt} frames={2} fadeFrames={1} />
    </AbsoluteFill>
  );
};

export const S17: ShotComponent = () => {
  const {at} = useShotClock();
  const merges = Array.from({length: 8}).map((_, k) => at(k * 0.5));
  return (
    <AbsoluteFill>
      <Board2048 merges={merges} m1024={at(4)} glowAt={at(5)} finalAt={at(6)} titleAt={at(6)} />
      <SoftFlash at={0} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- S18 claim */
const ARCADE_RECT: Rect = {x: 209, y: 84, width: 1182, height: 796};
/** The real toast of clip_arcade_claim (CSS px), border + drop shadow only (measured on the settled
 *  toast), so the pop-out copy carries no slivers of the 悔一步 / 重新开局 buttons above it. */
const ARCADE_TOAST: Rect = {x: 610.5, y: 783.5, width: 383, height: 96.5};
/**
 * Clean plate for the capture's own toast: the toast (with its slide-in and shadow) stays inside
 * this rect, which is pixel-identical in source frames 0–32 (悔一步 / 重新开局, the panel edge);
 * the toast starts sliding in at source frame 33. Bottom = ARCADE_RECT's bottom edge (880).
 */
const ARCADE_TOAST_PLATE: Rect = {x: 600, y: 770, width: 404, height: 110};
const ARCADE_TOAST_SRC_IN = 33;

export const ArcadeClaim: React.FC<{clickAt: number; vertical?: boolean; dissolveAt?: number}> = ({clickAt, vertical, dissolveAt}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const k = vertical ? 0.88 : 1.02;
  const rect = ARCADE_RECT;
  const cw = rect.width * k;
  const ch = rect.height * k;
  const cx = W / 2;
  const cy = vertical ? 760 : 432;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const btn = {x: ox + (1160 - rect.x) * k, y: oy + (514 - rect.y) * k};
  const src = Math.max(0, f - clickAt + 30);
  const seedT = tween(f, clickAt + 26, clickAt + 50, 0, 1, ease.in);
  const toastIn = springAt(f, clickAt + 6, {damping: 12, stiffness: 220});
  const content = (
    <AbsoluteFill>
      <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={10} tint={0.55} zoom={1.25} />
      <Camera zoom={keyframes(f, [[0, 1.0], [clickAt, 1.04, ease.out], [clickAt + 50, 1.06]])}>
        <Layer depth={1}>
          {/* particles behind the card, launched from outside its right edge */}
          <ParticleBurst sprites={['icon_coin', 'icon_seed']} count={11} at={clickAt} origin={{x: ox + cw + 40, y: btn.y}} seed="seedgift" speed={[10, 22]} angle={[-120, -20]} gravity={0.8} scale={[4, 6]} life={[40, 60]} flip shadow={3} />
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateX={tween(f, 0, 30, 12, 0, ease.out)}>
            <UICrop clip="clip_arcade_claim" frame={src} rect={rect} k={k}>
              {/* only the 1.4× pop-out copy of the toast is on screen: the capture's own toast is
                  covered by the same region from the last frame before it appeared */}
              {src >= ARCADE_TOAST_SRC_IN ? (
                <div style={{position: 'absolute', left: (ARCADE_TOAST_PLATE.x - rect.x) * k, top: (ARCADE_TOAST_PLATE.y - rect.y) * k}}>
                  <UICrop clip="clip_arcade_claim" frame={ARCADE_TOAST_SRC_IN - 1} rect={ARCADE_TOAST_PLATE} k={k} />
                </div>
              ) : null}
            </UICrop>
          </Card3D>
          <ImpactRing at={clickAt} x={btn.x} y={btn.y} frames={16} maxR={300} unit={10} color={C.gold} />
        </Layer>
      </Camera>
      {/* the real toast, cropped from the same capture and popped at 1.4× above the card */}
      {f >= clickAt + 6 ? (
        <div style={{position: 'absolute', left: vertical ? W / 2 : 1350, top: vertical ? 1290 : 790, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * toastIn})`, opacity: Math.min(1, toastIn * 1.5), filter: `drop-shadow(8px 8px 0 ${alpha(C.woodDark, 0.5)})`}}>
          <UICrop clip="clip_arcade_claim" frame={Math.max(src, 70)} rect={ARCADE_TOAST} k={k * 1.4} />
        </div>
      ) : null}
      {f >= clickAt + 26 && seedT < 1 ? (
        <div style={{position: 'absolute', left: lerp(btn.x, W + 200, seedT), top: lerp(btn.y, -200, seedT) - Math.sin(seedT * Math.PI) * 120, transform: `translate(-50%, -50%) rotate(${seedT * 360}deg) scale(${1 + seedT})`}}>
          <PixelSprite sprite="tile_2" scale={8} shadow={6} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
  if (dissolveAt !== undefined && f >= dissolveAt) {
    const steps = [9, 17, 33, 65];
    const i = Math.min(3, Math.floor((f - dissolveAt) / 3));
    return <Pixelate block={steps[i]}>{content}</Pixelate>;
  }
  return content;
};

export const S18: ShotComponent = () => {
  const {at} = useShotClock();
  return (
    <AbsoluteFill>
      <ArcadeClaim clickAt={at(2)} dissolveAt={at(4) - 12} />
      <At x={96} bottom={40}>
        <Plate at={at(0)}>
          <PixelTitle text={COPY.arcadeDaily} size={64} start={at(0) + 4} stagger={3} mode="drop" align="left" />
          <div style={{height: 6}} />
          <BodyText text={COPY.arcadeNoPay} size={30} weight={700} color={C.paper} inAt={at(1)} />
        </Plate>
      </At>
    </AbsoluteFill>
  );
};
