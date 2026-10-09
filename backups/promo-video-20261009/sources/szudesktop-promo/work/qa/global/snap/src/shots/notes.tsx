/**
 * 04 课程笔记 — S19–S21 (33.750–39.375 s): Markdown writing with the shelf and page layers
 * split in depth, reading mode + 本页大纲 jump, select a sentence → 加入学习待办 (paper slip
 * flies into 我的小事), then the glitch cut into the campus-network section.
 */
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Layer} from '../components/Camera';
import {ParticleBurst} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {BodyText} from '../components/BodyText';
import {CornerTag, PixelPanel} from '../components/PixelUI';
import {Glitch, ImpactRing, Pixelate} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, keyframes, lerp, tween} from '../lib/anim';
import {useShotClock} from '../lib/beat';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {camAt, StudyBG} from './focus';
import {At, PaperCard, Plate, Rect, UICrop, footage, retime} from './kit';
import {Img} from 'remotion';
import {springAt} from '../lib/anim';
import {ShotComponent} from './registry';

const SHELF: Rect = {x: 210, y: 89, width: 210, height: 774};
const PAGES: Rect = {x: 420, y: 89, width: 972, height: 774};

/** Layered notebook: shelf card behind, pages card in front (parallax under camera pans). */
export const Notebook: React.FC<{clip: string; frame: number; k: number; cx: number; cy: number; tilt?: number; children?: React.ReactNode}> = ({clip, frame, k, cx, cy, tilt = 0, children}) => {
  const total = (SHELF.width + PAGES.width) * k;
  const left = cx - total / 2;
  const top = cy - (PAGES.height * k) / 2;
  return (
    <>
      <Layer depth={0.8}>
        <div style={{position: 'absolute', left: left - 30, top: top + 30, transform: `perspective(1600px) rotateY(${12 + tilt}deg)`, transformOrigin: '100% 50%'}}>
          <PaperCard>
            <UICrop clip={clip} frame={frame} rect={SHELF} k={k} />
          </PaperCard>
        </div>
      </Layer>
      <Layer depth={1}>
        <div style={{position: 'absolute', left: left + SHELF.width * k, top, transform: `perspective(2200px) rotateY(${tilt}deg)`}}>
          <PaperCard>
            <UICrop clip={clip} frame={frame} rect={PAGES} k={k} />
          </PaperCard>
        </div>
        {children}
      </Layer>
    </>
  );
};

/** Notebook geometry helper: CSS point → stage point. */
export const nbPoint = (k: number, cx: number, cy: number) => {
  const total = (SHELF.width + PAGES.width) * k;
  const left = cx - total / 2 + SHELF.width * k;
  const top = cy - (PAGES.height * k) / 2;
  return (vx: number, vy: number) => ({x: left + 6 + (vx - PAGES.x) * k, y: top + 6 + (vy - PAGES.y) * k});
};

const Resolve: React.FC<{children: React.ReactNode}> = ({children}) => {
  const f = useCurrentFrame();
  if (f < 9) {
    const steps = [65, 33, 17, 9];
    return <Pixelate block={steps[Math.min(3, Math.floor(f / 3))]}>{children}</Pixelate>;
  }
  return <>{children}</>;
};

export const S19: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.18;
  const cx = 900;
  // v3 (review): the notebook sits 60 px lower under a camera that opens 20 px higher, so on the
  // first beat the shelf card's top edge is ~180 px down — clear of the「04 课程笔记」tag (y 44–125)
  // by > 24 px. The push starts on beat 2; the tag slides out before the shelf rises into it.
  const cy = 620;
  const cam0 = {x: cx + 90, y: 540};
  const P = nbPoint(k, cx, cy);
  const typing = P(980, 700);
  const push = tween(f, at(1), at(4), 0, 1, ease.inOut);
  const z = keyframes(f, [
    [at(1), 1.0],
    [at(4), 1.14, ease.inOut],
  ]);
  const cam = camAt({x: lerp(cam0.x, typing.x - 120, push), y: lerp(cam0.y, typing.y - 160, push)}, z);
  const src = 34 + f * (6 / 7);
  return (
    <Resolve>
      <AbsoluteFill>
        <Camera {...cam}>
          <Layer depth={0.3}>
            <StudyBG frame={f + 400} sprite="bg_campus_1920x1080" />
          </Layer>
          <Notebook clip="clip_note_write" frame={src} k={k} cx={cx} cy={cy} tilt={tween(f, 0, at(4), -4, 2)} />
        </Camera>
        <At x={96} bottom={48}>
          <Plate at={at(0) + 2}>
            <PixelTitle text={COPY.notesHeadline} size={88} start={at(0) + 4} stagger={4} mode="drop" align="left" />
          </Plate>
        </At>
        <div style={{position: 'absolute', left: 1700, top: 1050}}>
          <PetSprite species="chestnut" frame={f} scale={12} x={0} y={0} anchor="bottom" clips={[{action: 'focus', at: 0, step: 14, loop: true}]} shadow={8} />
        </div>
        <CornerTag text={COPY.sections[3]} at={4} outAt={at(1) + 18} />
      </AbsoluteFill>
    </Resolve>
  );
};

export const S20: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.3;
  const cx = 820;
  const cy = 560;
  const P = nbPoint(k, cx, cy);
  const src = retime(f, [
    [0, 20],
    [at(1), 58],
    [at(2), 100],
  ]);
  const outline = P(1130, 400);
  const z = keyframes(f, [
    [0, 1.12],
    [at(1), 1.3, ease.inOut],
    [at(2), 1.4, ease.inOut],
  ]);
  const cy2 = tween(f, at(2) + 6, at(3), 0, 120, ease.inOut);
  const cam = camAt({x: lerp(cx + 120, outline.x, tween(f, 0, at(1.5), 0, 1, ease.inOut)), y: lerp(cy, outline.y + 60, tween(f, 0, at(1.5), 0, 1, ease.inOut)) + cy2}, z);
  return (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <StudyBG frame={f + 513} />
        </Layer>
        <Notebook clip="clip_note_outline" frame={src} k={k} cx={cx} cy={cy}>
          <ImpactRing at={at(1)} x={P(1015, 371).x} y={P(1015, 371).y} frames={12} maxR={110} unit={6} color={C.gold} />
          <ImpactRing at={at(2)} x={P(1218, 413).x} y={P(1218, 413).y} frames={12} maxR={110} unit={6} color={C.gold} />
        </Notebook>
      </Camera>
      <At x={96} bottom={48}>
        {/* v3: near-opaque plate — the body lines behind it (还没弄懂 …) no longer read through */}
        <Plate at={at(0)} opacity={0.92}>
          <PixelTitle text={COPY.notesOutline} size={88} start={at(0) + 2} stagger={4} mode="drop" align="left" />
        </Plate>
      </At>
    </AbsoluteFill>
  );
};

/**
 * The real 我的小事 card captured after 选中 → 待办 in the same demo save (ui_focus_todos_after_note,
 * 650×728 CSS): rows 1–3 show first; row 4「课后做完习题 3.2」is revealed (and flashes) when the slip lands.
 */
const TODO_CARD = {w: 650, h: 728, row4Top: 612};
export const TodoCard: React.FC<{x: number; y: number; at: number; landAt: number; k?: number}> = ({x, y, at, landAt, k = 0.78}) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const s = tween(f, at, at + 10, 0, 1, ease.outBack);
  const bump = f >= landAt && f < landAt + 8 ? Math.sin(((f - landAt) / 8) * Math.PI) * 0.04 : 0;
  const reveal = tween(f, landAt, landAt + 8, 0, 1, ease.out);
  const hCss = TODO_CARD.row4Top + (TODO_CARD.h - TODO_CARD.row4Top) * reveal;
  const flash = f >= landAt ? Math.max(0, 1 - (f - landAt) / 26) : 0;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translateX(${(1 - s) * 500}px) scale(${1 + bump}) rotate(2deg)`, transformOrigin: '50% 50%'}}>
      <PaperCard>
        <div style={{position: 'relative', width: TODO_CARD.w * k, height: hCss * k, overflow: 'hidden'}}>
          <Img src={footage('ui_focus_todos_after_note.png')} style={{position: 'absolute', left: 0, top: 0, width: TODO_CARD.w * k, height: (1514 / 2) * k}} />
          {flash > 0 ? <div style={{position: 'absolute', left: 20 * k, right: 20 * k, top: (TODO_CARD.row4Top + 4) * k, height: 106 * k, background: alpha(C.gold, 0.45 * flash), boxShadow: `inset 0 0 0 ${4}px ${alpha(C.gold, flash)}`}} /> : null}
        </div>
      </PaperCard>
    </div>
  );
};

/** The real toast of clip_note_to_todo (CSS px). It fades in over source frames 85–89. */
const NOTE_TOAST: Rect = {x: 668, y: 814, width: 266, height: 66};
/**
 * v3: from source frame 82 (selection cleared) the capture only changes inside the toast (plus a
 * 64×13 px button hover state), so the notebook holds frame 84, the last frame before the toast —
 * the in-page toast never shows (it used to peek out beside the title plate as「…习待办，可以接着写」)
 * — and the enlarged pop uses one settled toast frame. Constant frames also mean the glitch tail
 * decodes no new 3200×1800 video frames.
 */
const NOTE_HOLD_FRAME = 84;
const NOTE_TOAST_FRAME = 120;

export const S21: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const {width: W} = useVideoConfig();
  const k = 1.18;
  const cx = 720;
  const cy = 540;
  const P = nbPoint(k, cx, cy);
  const src = retime(f, [
    [0, 22],
    [at(1), 82],
  ]);
  const sel = P(800, 698);
  const cam = camAt({x: 860, y: 560}, keyframes(f, [[0, 1.08], [at(2), 1.0, ease.inOut]]));
  // paper slip: leaves at 48, lands at 56 (local)
  const slipT = tween(f, 46, 58, 0, 1, ease.inOut);
  const slipFrom = {x: (sel.x - 960) * cam.zoom + 960 - 0, y: (sel.y - 540) * cam.zoom + 540};
  const slipTo = {x: 1480, y: 744};
  const slipText = '课后做完习题 3.2';
  useFontsFor(slipText, [700]);
  const card = (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <StudyBG frame={f + 626} />
        </Layer>
        <Notebook clip="clip_note_to_todo" frame={Math.min(src, NOTE_HOLD_FRAME)} k={k} cx={cx} cy={cy} tilt={tween(f, 0, at(2), 0, 6, ease.inOut)} />
      </Camera>
      <TodoCard x={1330} y={210} at={at(1) - 4} landAt={58} />
      {/* the app's own confirmation, cropped from the capture and popped at 1.4× */}
      {f >= 32 ? (
        <div style={{position: 'absolute', left: 1580, top: 930, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * springAt(f, 32, {damping: 12, stiffness: 220})})`, filter: `drop-shadow(8px 8px 0 ${alpha(C.woodDark, 0.5)})`}}>
          <UICrop clip="clip_note_to_todo" frame={NOTE_TOAST_FRAME} rect={NOTE_TOAST} k={k * 1.4} />
        </div>
      ) : null}
      {f >= 46 && f < 60 ? (
        <div
          style={{
            position: 'absolute',
            left: lerp(slipFrom.x, slipTo.x, slipT),
            top: lerp(slipFrom.y, slipTo.y, slipT) - Math.sin(slipT * Math.PI) * 220,
            transform: `translate(-50%, -50%) rotate(${slipT * -14}deg) scale(${1 + Math.sin(slipT * Math.PI) * 0.3})`,
          }}
        >
          <PixelPanel fill={C.paper} border={C.line} unit={4} shadow={6} padding="10px 18px">
            <div style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 34, color: C.ink, whiteSpace: 'nowrap'}}>
              <PixelSprite sprite="icon_scroll" scale={3} />
              {slipText}
            </div>
          </PixelPanel>
        </div>
      ) : null}
      <ParticleBurst squares={[C.gold, C.paperHi, C.line]} count={16} at={58} origin={{x: slipTo.x, y: slipTo.y + 40}} seed="slip" speed={[5, 12]} angle={[-180, 0]} gravity={0.4} drag={0.06} scale={[6, 10]} life={[18, 28]} />
      <At x={96} bottom={40}>
        <Plate at={at(0)}>
          <PixelTitle text={COPY.notesToTodo} size={84} start={at(0) + 2} stagger={4} mode="drop" align="left" />
          <div style={{height: 8}} />
          <BodyText text={COPY.notesNote} size={28} weight={700} color={C.paper} inAt={at(2)} />
        </Plate>
      </At>
      <div style={{position: 'absolute', left: 1700, top: 222}}>
        <PetSprite species="chestnut" frame={f} scale={9} x={0} y={0} anchor="bottom" clips={[{action: 'idle', at: 0, step: 'native', loop: true}, {action: 'celebrate', at: 58, step: 8}]} shadow={6} />
      </div>
    </AbsoluteFill>
  );
  void W;
  return (
    <Glitch at={at(4) - 12} frames={12} blackFrames={[10, 11]} split={8}>
      {card}
    </Glitch>
  );
};
