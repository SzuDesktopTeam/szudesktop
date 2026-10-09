/**
 * 03 庭院世界 — S13–S18 (20.625–33.750 s): the drop through the app's own cel-shaded scenes
 * (real WebGL dolly renders), the four-skin grid, building the lakeside picnic corner, the
 * 2048 climb to 荔宝丰收礼, and the real claim of the daily seed gift.
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Card3D, Layer} from '../components/Camera';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {BodyText} from '../components/BodyText';
import {CornerTag, PixelPanel, WoodSign} from '../components/PixelUI';
import {ImpactRing, Pixelate, WhipPan, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {PARTICLES, TILE_LEVELS, useSpriteSrc} from '../lib/assets';
import {ease, hit, keyframes, lerp, shake, springAt, tween} from '../lib/anim';
import {EIGHTH, useShotClock} from '../lib/beat';
import {FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {HOME_CROP} from './desktop';
import {camAt} from './focus';
import {At, Footnote, PixImg, Rect, TileCard, UICrop, Vid, WarmBG, footage} from './kit';
import {ShotComponent} from './registry';

/* ---------------------------------------------------------------- scenes */
const SceneFlora: React.FC<{frame: number; speed?: number; y?: number; keys?: string[]}> = ({frame, speed = 16, y = 1090, keys = ['flora_tallgrass', 'flora_berrybush', 'flora_tallgrass', 'flora_berrybush']}) => {
  const {width} = useVideoConfig();
  const span = width + 600;
  return (
    <>
      {Array.from({length: 7}).map((_, i) => {
        let x = (i * 330 - frame * speed) % span;
        if (x < -300) x += span;
        return <PixelSprite key={i} sprite={keys[i % keys.length]} scale={i % 2 ? 16 : 14} x={x} y={y + (i % 3) * 18} anchor="bottom-left" />;
      })}
    </>
  );
};

type SceneProps = {clip: string; name: string; rate?: number; tag?: boolean; whipIn?: boolean; whipOut?: number; vertical?: boolean};

/** Full-frame dolly render + parallax foreground + slammed scene name. */
export const SceneShot: React.FC<SceneProps & {extra?: React.ReactNode; nameAt?: number; offset?: number}> = ({clip, name, rate = 1.7, tag, whipIn, whipOut, extra, nameAt = 0, offset = 0, vertical}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const z = 1 + hit(f, 0, 14) * 0.1;
  const sh = shake(f, 0, 10, 12, 31, 1);
  const body = (
    <AbsoluteFill>
      <Camera zoom={z} rotate={tween(f, 0, 112, -0.8, 0.8, ease.linear)} shake={sh}>
        <Layer depth={1}>
          <Vid name={clip} frame={offset + f * rate} />
        </Layer>
        <Layer depth={1.8}>
          <SceneFlora frame={f} y={H + 20} />
          {extra}
        </Layer>
      </Camera>
      <AbsoluteFill style={{background: `linear-gradient(0deg, ${alpha(C.woodDark, 0.55)} 0%, transparent 32%)`}} />
      <At x={vertical ? 0 : 70} y={vertical ? 1240 : 760} w={vertical ? W : undefined} style={vertical ? {display: 'flex', justifyContent: 'center'} : undefined}>
        <PixelTitle text={name} size={vertical ? 168 : 168} start={nameAt} stagger={3} mode="slam" color={C.paperHi} jitter={0} />
      </At>
      {!vertical ? (
        <At right={60} bottom={44}>
          <Footnote text={COPY.sceneNote} size={26} />
        </At>
      ) : null}
      {tag ? <CornerTag text={COPY.sections[2]} at={2} /> : null}
    </AbsoluteFill>
  );
  let out = body;
  if (whipOut !== undefined)
    out = (
      <WhipPan at={whipOut} frames={10} mode="out" direction="left" distance={W * 1.1} blur={70}>
        {out}
      </WhipPan>
    );
  if (whipIn)
    out = (
      <WhipPan at={0} frames={8} mode="in" direction="left" distance={W * 1.1} blur={70}>
        {out}
      </WhipPan>
    );
  return out;
};

export const S13: ShotComponent = () => {
  const {at} = useShotClock();
  return (
    <>
      <SceneShot clip="clip_scene_lake_dolly" name={COPY.scenes[0]} tag whipOut={at(4) - 10} />
      <ImpactRing at={0} x={960} y={600} frames={18} maxR={1200} unit={16} />
      <WhiteFlash at={0} frames={2} fadeFrames={6} />
    </>
  );
};

export const S14: ShotComponent = () => {
  const {at} = useShotClock();
  const rain = (
    <ParticleBurst sprites={['icon_water']} count={40} at={0} mode="rain" origin={{x: 0, y: 0}} area={{x: -200, y: -300, w: 2400, h: 200}} seed="rain" speed={[40, 70]} gravity={0.6} scale={[3, 5]} life={[60, 90]} stagger={2.5} fade={6} />
  );
  return (
    <>
      <SceneShot clip="clip_scene_bookshop_dolly" name={COPY.scenes[1]} whipIn extra={rain} />
      <WhiteFlash at={at(2)} frames={2} fadeFrames={5} />
      <CornerTag text={COPY.sections[2]} at={-30} />
    </>
  );
};

const SkinGrid: React.FC<{at0: number; step: number; vertical?: boolean}> = ({at0, step, vertical}) => {
  const f = useCurrentFrame();
  const stills = ['ui_home_pixel.png', 'ui_home_lake.png', 'ui_home_bookshop.png', 'ui_home_terrace.png'];
  const k = vertical ? 0.395 : 0.613;
  const cw = HOME_CROP.width * k;
  const chh = HOME_CROP.height * k;
  const gap = vertical ? 18 : 20;
  const cols = vertical ? 1 : 2;
  const gw = cols * cw + (cols - 1) * gap;
  const rows = vertical ? 4 : 2;
  const gh = rows * chh + (rows - 1) * gap;
  const {width: W, height: H} = useVideoConfig();
  const x0 = (W - gw) / 2;
  const y0 = vertical ? 300 : (H - gh) / 2;
  return (
    <>
      {stills.map((s, i) => {
        const a = at0 + i * step;
        if (f < a) return null;
        const ry = tween(f, a, a + 8, 90, 0, ease.outBack);
        const c = i % cols;
        const r = Math.floor(i / cols);
        return (
          <div key={s} style={{position: 'absolute', left: x0 + c * (cw + gap), top: y0 + r * (chh + gap), width: cw, height: chh, transform: `perspective(1400px) rotateY(${ry}deg)`, transformOrigin: c === 0 ? '100% 50%' : '0% 50%', boxShadow: `0 16px 40px ${alpha(C.woodDark, 0.6)}`, outline: `4px solid ${C.paperHi}`}}>
            <UICrop still={s} rect={HOME_CROP} k={k} />
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
      <SceneShot clip="clip_scene_terrace_dolly" name={COPY.scenes[2]} extra={lanterns} />
      {f >= at(2) ? <AbsoluteFill style={{background: alpha(C.woodDark, tween(f, at(2), at(2) + 10, 0, 0.75))}} /> : null}
      <SkinGrid at0={at(2)} step={EIGHTH} />
      {f >= at(2) ? (
        <At center y={505}>
          <BodyText text={COPY.scenesSub} size={40} weight={900} plate="wood" inAt={at(2) + 2} />
        </At>
      ) : null}
      <CornerTag text={COPY.sections[2]} at={-30} />
      <WhiteFlash at={0} frames={1} fadeFrames={4} />
    </>
  );
};

/* ---------------------------------------------------------------- S16 build */
const BUILD_RECT: Rect = {x: 203, y: 150, width: 1194, height: 740};

export const BuildPicnic: React.FC<{vertical?: boolean; thuds: number[]; switchAt: number; chipsAt: number; clickAt: number; end: number; firstStep?: number}> = ({vertical, thuds, switchAt, chipsAt, clickAt, end, firstStep = 6}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const src = useSpriteSrc();
  // part 1: the real build card
  if (f < switchAt) {
    const k = vertical ? 0.86 : 1.05;
    const cw = BUILD_RECT.width * k;
    const ch = BUILD_RECT.height * k;
    const btn = {x: (1291.5 - BUILD_RECT.x) * k, y: (447 - BUILD_RECT.y) * k};
    return (
      <AbsoluteFill>
        <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={8} tint={0.45} zoom={1.2} />
        <Card3D x={W / 2} y={vertical ? 820 : 610} width={cw + 12} height={ch + 12} rotateY={tween(f, 0, switchAt, 0, -14, ease.inOut)} rotateX={4} scale={tween(f, 0, switchAt, 1, 1.08)}>
          <UICrop clip="clip_build_picnic" frame={f - clickAt + 28} rect={BUILD_RECT} k={k} />
          <div style={{position: 'absolute', left: btn.x, top: btn.y}}>
            <ImpactRingLocal at={clickAt} />
          </div>
        </Card3D>
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
      <div style={{position: 'absolute', left: 0, right: 0, top: vertical ? 1330 : 900, display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: vertical ? 16 : 28}}>
        {(['project_picnic', 'project_seedrack', 'project_lakeLights'] as const).map((p, i) => {
          const a = chipsAt + i * 5;
          if (f < a) return null;
          const s = springAt(f, a, {damping: 12, stiffness: 220});
          const label = COPY.buildProjects.split(' · ')[i];
          return (
            <div key={p} style={{transform: `translateY(${(1 - s) * 200}px)`, opacity: Math.min(1, s * 2)}}>
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

const ImpactRingLocal: React.FC<{at: number}> = ({at}) => <ImpactRing at={at} x={0} y={0} frames={14} maxR={120} unit={8} color={C.gold} />;

export const S16: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  useFontsFor(COPY.buildProjects, [400]);
  const thuds = [56, 63, 70, 77, 84, 91, 98, 105];
  const punch = tween(f, at(4) - 9, at(4), 0, 1, ease.inExpo);
  return (
    <AbsoluteFill>
      <BuildPicnic thuds={thuds} switchAt={at(2)} chipsAt={at(3)} clickAt={0} end={at(4)} />
      <At x={70} y={150}>
        <PixelTitle text={COPY.buildHeadline} size={96} start={at(0) + 2} stagger={4} mode="drop" align="left" />
      </At>
      {f < at(2) ? (
        <At center y={830}>
          <BodyText text={COPY.buildToast} size={44} weight={900} plate="paper" inAt={at(1)} />
        </At>
      ) : null}
      <WhiteFlash at={at(2)} frames={1} fadeFrames={4} />
      <CornerTag text={COPY.sections[2]} at={-30} />
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
  const bc = vertical ? {x: W / 2, y: 880} : {x: 700, y: 520};
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
  // camera
  let z = 1 + nDone * 0.033;
  const pairC = {x: (cellPos(A).x + cellPos(B).x) / 2 + T / 2, y: cellPos(A).y + T / 2};
  let c = {x: lerp(bc.x + (vertical ? 0 : 200), pairC.x, nDone / 9), y: lerp(bc.y, pairC.y, nDone / 9)};
  if (f >= glowAt && f < finalAt) {
    const t = tween(f, glowAt, finalAt - 2, 0, 1, ease.inExpo);
    z = lerp(1.3, 1.75, t);
    c = {x: lerp(c.x, pairC.x, t), y: lerp(c.y, pairC.y, t)};
  }
  const cam = camAt(c, z, W, H);
  const glow = f >= glowAt && !exploded;
  const sh = shake(f, finalAt, 14, 22, 41, 1);
  const beatWob = Math.sin((f / (EIGHTH * 2)) * Math.PI) * 2;

  const tileAt = (cell: Cell, v: number, key: string, extra?: {dx?: number; dy?: number; s?: number; op?: number; glow?: boolean; z?: number}) => {
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
          filter: extra?.glow ? `drop-shadow(0 0 ${18 + Math.sin(f / 3) * 8}px ${C.gold}) drop-shadow(0 0 4px ${C.paperHi})` : undefined,
        }}
      >
        <TileCard value={v} size={T} />
      </div>
    );
  };

  const tiles: React.ReactNode[] = [];
  const dim = glow ? 0.25 : 1;
  statics.forEach(([cell, v], i) => tiles.push(tileAt(cell, v, `s${i}`, {op: exploded ? 0 : dim})));
  // B = the other 荔枝篮 1024, waiting from the start
  if (!exploded) {
    let dx = 0;
    if (f >= finalAt - 3) dx = -tween(f, finalAt - 3, finalAt, 0, T + gap, ease.in);
    tiles.push(tileAt(B, 1024, 'B', {dx, glow, z: 2}));
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
  // particles per merge (crop of the new tile)
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

  // label / ladder
  const lastV = nDone > 0 ? 2 ** (nDone + 1) : 0;
  const lastAt = allMerges[nDone - 1] ?? 0;
  const ladderVals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  const reached = (v: number) => v <= (exploded ? 2048 : Math.max(2, lastV));
  useFontsFor(TILE_LEVELS.map((t) => t.name).join('') + '0123456789 ', [400]);

  const giftScale = vertical ? 28 : 28;
  const giftIn = springAt(f, finalAt, {damping: 9, stiffness: 160, mass: 0.8});

  return (
    <AbsoluteFill>
      <Camera {...(exploded ? {zoom: 1, x: 0, y: 0} : cam)} shake={sh} perspective={1800}>
        <Layer depth={0.3}>
          <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={10} tint={glow ? 0.8 : 0.55} zoom={1.3} />
        </Layer>
        <Layer depth={1}>
          <AbsoluteFill style={{transform: `perspective(1800px) rotateX(${exploded ? 0 : 20 + beatWob}deg) rotateZ(${exploded ? 0 : -2 + beatWob * 0.5}deg)`, transformOrigin: `${bc.x}px ${bc.y}px`}}>
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
      {/* tile name callout */}
      {!exploded && nDone > 0 ? (
        <At x={vertical ? 0 : 1240} y={vertical ? 1580 : 330} w={vertical ? W : 640} style={vertical ? {display: 'flex', justifyContent: 'center'} : undefined}>
          <div key={nDone} style={{display: 'flex', alignItems: 'center', gap: 20, transform: `scale(${1 + hit(f, lastAt, 8) * 0.25})`, transformOrigin: '0 50%'}}>
            <PixImg sprite={`tile_${lastV}`} w={vertical ? 160 : 192} />
            <div>
              <div style={{fontFamily: FONT_PIXEL, fontSize: vertical ? 84 : 96, color: C.paperHi, lineHeight: 1, textShadow: `5px 5px 0 ${C.woodDark}, -3px -3px 0 ${C.lycheeDeep}, 3px -3px 0 ${C.lycheeDeep}, -3px 3px 0 ${C.lycheeDeep}`}}>{NAMES[lastV]}</div>
              <div style={{fontFamily: FONT_PIXEL, fontSize: vertical ? 72 : 84, color: C.gold, lineHeight: 1.1, textShadow: `5px 5px 0 ${C.woodDark}`}}>{lastV}</div>
            </div>
          </div>
        </At>
      ) : null}
      {/* ladder of the 11 tiles */}
      <div style={{position: 'absolute', left: vertical ? 40 : 1110, right: vertical ? 40 : undefined, top: vertical ? 1790 : 860, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', width: vertical ? undefined : 760, opacity: exploded ? tween(f, finalAt, finalAt + 8, 1, 0) : 1}}>
        {ladderVals.map((v) => {
          const on = reached(v);
          return (
            <div key={v} style={{opacity: on ? 1 : 0.28, filter: on ? undefined : 'grayscale(1)', transform: on && v === lastV ? `translateY(${-Math.round(hit(f, lastAt, 8) * 14)}px)` : undefined}}>
              <PixImg sprite={`tile_${v}`} w={vertical ? 80 : 64} />
            </div>
          );
        })}
      </div>
      {!exploded ? (
        <At x={vertical ? 0 : 1180} y={vertical ? 150 : 150} w={vertical ? W : undefined} style={vertical ? {display: 'flex', justifyContent: 'center'} : undefined}>
          <WoodSign text={vertical ? COPY.vertical.arcade : COPY.arcadeLabel} size={48} />
        </At>
      ) : null}
      {/* the climax */}
      {exploded ? (
        <>
          <AbsoluteFill style={{background: `radial-gradient(circle at 50% ${vertical ? 42 : 46}%, ${alpha(C.gold, 0.55)} 0%, transparent 55%)`}} />
          <ParticleBurst sprites={PARTICLES.confetti} count={90} at={finalAt} origin={{x: W / 2, y: vertical ? 800 : 500}} seed="conf" speed={[18, 48]} angle={[-180, 180]} gravity={0.55} drag={0.025} scale={[5, 10]} life={[80, 140]} shadow={4} />
          <ParticleBurst sprites={['icon_coin', 'icon_heart', 'icon_seed']} count={40} at={finalAt + 6} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: -260, w: W, h: 200}} seed="conf-rain" speed={[20, 30]} gravity={0.35} scale={[4, 7]} life={[90, 120]} stagger={1} flip />
          <div style={{position: 'absolute', left: W / 2, top: vertical ? 800 : 470, transform: `translate(-50%, -50%) scale(${giftIn}) rotate(${(1 - giftIn) * -20}deg)`}}>
            <PixelSprite sprite="tile_2048" scale={giftScale} shadow={16} />
          </div>
          <ImpactRing at={finalAt} x={W / 2} y={vertical ? 800 : 470} frames={22} maxR={1500} unit={20} />
          <ImpactRing at={finalAt + 4} x={W / 2} y={vertical ? 800 : 470} frames={22} maxR={1100} unit={14} color={C.gold} />
          <At x={0} y={vertical ? 1330 : 820} w={W} style={{display: 'flex', justifyContent: 'center'}}>
            {vertical ? (
              <div>
                <PixelTitle text={COPY.vertical.arcadeClimax} size={144} start={titleAt} stagger={3} mode="slam" color={C.gold} />
                <PixelTitle text="2048" size={192} start={titleAt + 10} stagger={3} mode="slam" color={C.paperHi} />
              </div>
            ) : (
              <PixelTitle text={COPY.arcadeClimax} size={192} start={titleAt} stagger={3} mode="slam" color={C.gold} />
            )}
          </At>
        </>
      ) : null}
      <WhiteFlash at={finalAt} frames={3} fadeFrames={8} />
    </AbsoluteFill>
  );
};

export const S17: ShotComponent = () => {
  const {at} = useShotClock();
  const merges = Array.from({length: 8}).map((_, k) => at(k * 0.5));
  return (
    <AbsoluteFill>
      <Board2048 merges={merges} m1024={at(4)} glowAt={at(5)} finalAt={at(6)} titleAt={at(7)} />
      <CornerTag text={COPY.sections[2]} at={-30} />
      <WhiteFlash at={0} frames={1} fadeFrames={4} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- S18 claim */
const ARCADE_RECT: Rect = {x: 209, y: 84, width: 1182, height: 796};

export const ArcadeClaim: React.FC<{clickAt: number; vertical?: boolean; dissolveAt?: number}> = ({clickAt, vertical, dissolveAt}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const k = vertical ? 0.88 : 1.18;
  const rect = vertical ? {x: 209, y: 84, width: 1182, height: 796} : ARCADE_RECT;
  const cw = rect.width * k;
  const ch = rect.height * k;
  const cx = W / 2;
  const cy = vertical ? 760 : 500;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const btn = {x: ox + (1160 - rect.x) * k, y: oy + (514 - rect.y) * k};
  const src = Math.max(0, f - clickAt + 30);
  const seedT = tween(f, clickAt + 26, clickAt + 50, 0, 1, ease.in);
  const content = (
    <AbsoluteFill>
      <WarmBG sprite={vertical ? 'bg_courtyard_1080x1920' : 'bg_courtyard_1920x1080'} blur={10} tint={0.55} zoom={1.25} />
      <Camera zoom={keyframes(f, [[0, 1.0], [clickAt, 1.06, ease.out], [clickAt + 50, 1.1]])}>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateX={tween(f, 0, 30, 12, 0, ease.out)}>
            <UICrop clip="clip_arcade_claim" frame={src} rect={rect} k={k} />
          </Card3D>
          <ImpactRing at={clickAt} x={btn.x} y={btn.y} frames={16} maxR={300} unit={10} color={C.gold} />
          <ParticleBurst sprites={['icon_coin', 'icon_coin', 'icon_seed']} count={22} at={clickAt} origin={btn} seed="seedgift" speed={[10, 24]} angle={[-170, -10]} gravity={0.8} scale={[4, 6]} life={[40, 60]} flip shadow={3} />
        </Layer>
      </Camera>
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
      <AbsoluteFill style={{background: `linear-gradient(0deg, ${alpha(C.woodDark, 0.85)} 0%, transparent 26%)`}} />
      <At x={70} bottom={92}>
        <PixelTitle text={COPY.arcadeDaily} size={72} start={at(0) + 4} stagger={3} mode="drop" align="left" />
      </At>
      <At x={74} bottom={40}>
        <BodyText text={COPY.arcadeNoPay} size={32} weight={700} color={C.paper} inAt={at(1)} />
      </At>
      <CornerTag text={COPY.sections[2]} at={-30} />
    </AbsoluteFill>
  );
};
