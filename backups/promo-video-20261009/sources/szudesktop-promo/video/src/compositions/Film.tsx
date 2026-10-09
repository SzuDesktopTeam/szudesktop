import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Freeze, Sequence, continueRender, delayRender, getRemotionEnvironment, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {BodyText} from '../components/BodyText';
import {PixelTitle} from '../components/PixelTitle';
import {PixelPanel} from '../components/PixelUI';
import {PixelSprite} from '../components/PixelSprite';
import {BeatHUD, Shot} from '../components/Shot';
import {SpriteRoot, DEFAULT_SPRITE_ROOT} from '../lib/assets';
import {ShotClock, beatFrame, secToBeat, useShotClock} from '../lib/beat';
import {ease, rand} from '../lib/anim';
import {SHOT_REGISTRY, ShotComponent} from '../shots/registry';
import {BLOCKS, TRANSITIONS, Transition} from '../shots';
import {WarmBG} from '../shots/kit';
import {ShotSpec} from '../timeline/shots';
import {C, alpha} from '../theme/palette';

export type FilmProps = {
  /** Mixed soundtrack relative to public/, e.g. 'assets/audio/promo_16x9_full.wav'; null = silent. */
  music: string | null;
  /** Show the beat HUD overlay. */
  debug: boolean;
  /** Where sprite PNGs live (relative to public/). */
  spriteRoot: string;
};

export const defaultFilmProps: FilmProps = {music: null, debug: false, spriteRoot: DEFAULT_SPRITE_ROOT};

type Segment = {spec: ShotSpec; Comp: ShotComponent; sb: number; eb: number; from: number; to: number};

/** Merge consecutive shots covered by a block into one segment. */
const segmentsFor = (shots: ShotSpec[]): Segment[] => {
  const out: Segment[] = [];
  const push = (spec: ShotSpec, Comp: ShotComponent) => {
    const sb = secToBeat(spec.start);
    const eb = secToBeat(spec.end);
    out.push({spec, Comp, sb, eb, from: beatFrame(sb), to: beatFrame(eb)});
  };
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const block = BLOCKS.find((b) => b.from === s.id);
    if (block) {
      const j = shots.findIndex((x) => x.id === block.to);
      if (j >= i) {
        const last = shots[j];
        push({...s, id: j > i ? `${s.id}-${last.id}` : s.id, end: last.end}, block.comp);
        i = j;
        continue;
      }
    }
    push(s, SHOT_REGISTRY[s.id] ?? PlaceholderShot);
  }
  return out;
};

/* ------------------------------------------------------------------ transitions
 * Whip / tilt transitions are done here, not inside the shots, so the outgoing and incoming
 * shots always share one continuous track (incoming = outgoing + one frame width / height):
 * there is never a gap that shows the empty stage. Before the cut the incoming shot is drawn
 * frozen on its first frame; after the cut the outgoing shot is drawn frozen on its last frame.
 * A blurred campus backdrop (1.2× overscan) sits under both for the whole window.
 */
type ActiveTransition = Transition & {c: number; out: Segment; inn: Segment};

const progress = (t: ActiveTransition, g: number) => {
  const p = (g - (t.c - t.pre) + 1) / (t.pre + t.post + 1);
  return ease.inOut(Math.min(1, Math.max(0, p)));
};

/** Offset of the travelling track (0 → full frame) and its speed, for global frame g. */
const trackAt = (t: ActiveTransition, g: number, span: number) => {
  const u = progress(t, g) * span;
  const v = Math.abs(progress(t, g + 0.5) - progress(t, g - 0.5)) * span;
  return {u, v};
};

const Mover: React.FC<{t: ActiveTransition; role: 'out' | 'in'; global: number; children: React.ReactNode}> = ({t, role, global, children}) => {
  const {width: W, height: H} = useVideoConfig();
  const span = t.kind === 'tilt' ? H : W;
  if (global < t.c - t.pre || global >= t.c + t.post) return <AbsoluteFill>{children}</AbsoluteFill>;
  const {u, v} = trackAt(t, global, span);
  const off = role === 'out' ? -u : span - u;
  const blur = Math.min(t.kind === 'tilt' ? 26 : 60, v * (t.kind === 'tilt' ? 0.12 : 0.22));
  const id = `mv-${t.inn.spec.id}-${role}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const transform = t.kind === 'tilt' ? `translateY(${off}px)` : `translateX(${off}px)`;
  return (
    <AbsoluteFill style={{transform}}>
      {blur > 0.6 ? (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={t.kind === 'tilt' ? `0 ${blur}` : `${blur} 0`} />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{filter: blur > 0.6 ? `url(#${id})` : undefined}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Wraps a live segment so it rides the transition track before/after its cuts. */
const SegmentMotion: React.FC<{seg: Segment; trans: ActiveTransition[]; children: React.ReactNode}> = ({seg, trans, children}) => {
  const {globalFrame} = useShotClock();
  const asOut = trans.find((t) => t.out === seg && globalFrame >= t.c - t.pre && globalFrame < t.c);
  const asIn = trans.find((t) => t.inn === seg && globalFrame >= t.c && globalFrame < t.c + t.post);
  const t = asOut ?? asIn;
  if (!t) return <>{children}</>;
  return (
    <Mover t={t} role={asOut ? 'out' : 'in'} global={globalFrame}>
      {children}
    </Mover>
  );
};

/** A segment frozen on one of its own local frames, riding the track (used before/after the cut). */
const Ghost: React.FC<{t: ActiveTransition; role: 'out' | 'in'; vertical: boolean}> = ({t, role, vertical}) => {
  const f = useCurrentFrame();
  const seg = role === 'out' ? t.out : t.inn;
  const global = role === 'out' ? t.c + f : t.c - t.pre + f;
  const local = role === 'out' ? t.c - 1 - seg.from : 0;
  return (
    <Mover t={t} role={role} global={global}>
      <ShotClock.Provider value={{startBeat: seg.sb, fromFrame: seg.from}}>
        <Freeze frame={local}>
          <seg.Comp spec={seg.spec} vertical={vertical} />
        </Freeze>
      </ShotClock.Provider>
    </Mover>
  );
};

/** Coins that fall across the seam of a tilt transition (the camera follows them down). */
const CoinFall: React.FC<{count?: number}> = ({count = 26}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: count}).map((_, i) => {
        const s = `cf-${i}`;
        const delay = rand(`${s}d`, 0, 10);
        const t = f - delay;
        if (t < 0) return null;
        const x0 = W * 0.5 + rand(`${s}x`, -0.32, 0.32) * W;
        const y0 = rand(`${s}y`, -260, 380);
        const v = rand(`${s}v`, 9, 17);
        const y = y0 + v * t + 0.18 * t * t;
        const land = rand(`${s}l`, 560, 860);
        const op = y > land ? Math.max(0, 1 - (y - land) / 90) : 1;
        if (op <= 0) return null;
        const sc = Math.round(rand(`${s}s`, 4, 7));
        const flip = Math.max(0.15, Math.abs(Math.cos(rand(`${s}p`, 0, 6.28) + t * 0.35)));
        const sprite = i % 6 === 5 ? 'crop_lychee' : 'icon_coin';
        return (
          <div key={i} style={{position: 'absolute', left: Math.round(x0 + Math.sin(t / 9 + i) * 18), top: Math.round(y), opacity: op, transform: `translate(-50%, -50%) scaleX(${flip})`}}>
            <PixelSprite sprite={sprite} scale={sc} shadow={3} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Raster fence (renders only). Remotion screenshots a frame one animation frame after React has
 * committed it; under load Chrome can still be rasterizing the heavy layers (blurred backdrops,
 * 3D cards, filtered copies) and draws the frame with tiles missing — isolated frames that show the
 * #3F3829 stage colour, go black, or repeat a layer as tiles. Hold every frame for a few animation
 * frames and nudge a tiny, empty composited layer on each one: every nudge needs a new commit, and a
 * commit can only land once the previous tree has activated, i.e. once its tiles are rasterized.
 */
const RasterFence: React.FC<{ticks?: number}> = ({ticks = 3}) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!getRemotionEnvironment().isRendering) return undefined;
    const handle = delayRender(`raster fence (frame ${frame})`);
    let n = 0;
    let raf = 0;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    const tick = () => {
      n++;
      if (ref.current) ref.current.style.transform = `translateX(${n % 2}px)`;
      if (n >= ticks) release();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [frame, ticks]);
  return <div ref={ref} style={{position: 'absolute', left: 0, top: 0, width: 1, height: 1, willChange: 'transform', pointerEvents: 'none'}} />;
};

/** Plays the shot list on the beat grid; unregistered shots show a placeholder card. */
export const Film: React.FC<FilmProps & {shots: ShotSpec[]}> = ({shots, music, debug, spriteRoot}) => {
  const {width, height, durationInFrames, fps} = useVideoConfig();
  const vertical = height > width;
  // 片尾定格后配乐不能满电平硬切：最后约 1.6 秒淡出，最后 0.1 秒静音。
  const fadeFrom = durationInFrames - Math.round(1.6 * fps);
  const fadeTo = durationInFrames - Math.round(0.1 * fps);
  const musicVolume = (f: number) => interpolate(f, [fadeFrom, fadeTo], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const segs = segmentsFor(shots);
  const trans: ActiveTransition[] = [];
  for (const t of TRANSITIONS) {
    const i = segs.findIndex((s) => s.spec.id.split('-')[0] === t.cut);
    if (i > 0) trans.push({...t, c: segs[i].from, out: segs[i - 1], inn: segs[i]});
  }
  return (
    <SpriteRoot.Provider value={spriteRoot}>
      <AbsoluteFill style={{background: C.ink}}>
        {trans.map((t) => (
          <Sequence key={`bd-${t.cut}`} from={t.c - t.pre} durationInFrames={t.pre + t.post} layout="none">
            <AbsoluteFill style={{transform: 'scale(1.2)'}}>
              <WarmBG sprite={vertical ? 'bg_campus_1080x1920' : 'bg_campus_1920x1080'} blur={18} tint={0.35} zoom={1.0} />
            </AbsoluteFill>
          </Sequence>
        ))}
        {segs.map((seg) => (
          <Shot key={seg.spec.id} startBeat={seg.sb} beats={seg.eb - seg.sb} name={`${seg.spec.id} ${seg.spec.section}`}>
            <SegmentMotion seg={seg} trans={trans}>
              <seg.Comp spec={seg.spec} vertical={vertical} />
            </SegmentMotion>
            {debug ? <BeatHUD label={seg.spec.id} /> : null}
          </Shot>
        ))}
        {trans.map((t) => (
          <React.Fragment key={`gh-${t.cut}`}>
            <Sequence from={t.c - t.pre} durationInFrames={t.pre} layout="none" name={`ghost-in ${t.cut}`}>
              <Ghost t={t} role="in" vertical={vertical} />
            </Sequence>
            <Sequence from={t.c} durationInFrames={t.post} layout="none" name={`ghost-out ${t.cut}`}>
              <Ghost t={t} role="out" vertical={vertical} />
            </Sequence>
            {t.coins ? (
              <Sequence from={t.c - t.pre - 4} durationInFrames={t.pre + t.post + 40} layout="none" name={`coins ${t.cut}`}>
                <CoinFall />
              </Sequence>
            ) : null}
          </React.Fragment>
        ))}
        {music ? <Audio src={staticFile(music)} volume={musicVolume} /> : null}
        <RasterFence />
      </AbsoluteFill>
    </SpriteRoot.Provider>
  );
};

/** Asset-free placeholder: shot id slams in on the first beat, beat ticks along the bottom. */
export const PlaceholderShot: ShotComponent = ({spec, vertical}) => {
  const {beat, at} = useShotClock();
  const beatsLong = Math.round((secToBeat(spec.end) - secToBeat(spec.start)) * 1);
  const idx = Math.floor(beat);
  return (
    <AbsoluteFill
      style={{
        background: `repeating-linear-gradient(45deg, ${C.woodDark} 0 24px, ${alpha(C.wood, 0.55)} 24px 48px)`,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: vertical ? 48 : 32,
        padding: 80,
      }}
    >
      <PixelTitle text={spec.id} size={vertical ? 240 : 192} mode="slam" start={at(0)} stagger={2} color={C.gold} />
      <PixelPanel fill={C.paper} border={C.wood} unit={6} shadow={8} padding="18px 28px">
        <BodyText text={`${spec.section} · ${spec.start.toFixed(3)}–${spec.end.toFixed(3)} s`} size={34} color={C.ink} />
      </PixelPanel>
      <BodyText text={spec.label} size={vertical ? 44 : 40} color={C.paper} align="center" maxWidth={vertical ? 900 : 1500} outline={C.woodDark} />
      <div style={{display: 'flex', gap: 12}}>
        {Array.from({length: beatsLong}).map((_, i) => (
          <div key={i} style={{width: 36, height: 36, background: i === idx ? C.lychee : i < idx ? C.gold : alpha(C.paper, 0.25), boxShadow: `4px 4px 0 ${C.woodDark}`}} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
