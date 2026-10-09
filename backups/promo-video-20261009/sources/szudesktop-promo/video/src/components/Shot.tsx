import React, {useContext} from 'react';
import {AbsoluteFill, Img, Sequence, useCurrentFrame} from 'remotion';
import {BEAT, ShotClock, beatFrame, useShotClock} from '../lib/beat';
import {useSpriteSrc} from '../lib/assets';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';

/**
 * A beat-locked <Sequence>. `startBeat` / `beats` are on the GLOBAL grid (0-based beat index),
 * so nested shots stay on the grid too. `tail` extends the sequence past its nominal end
 * (frames) so an outgoing transition can overlap the next shot.
 * Inside, useShotClock().at(b) gives the local frame of local beat b.
 */
export const Shot: React.FC<{startBeat: number; beats: number; name?: string; tail?: number; head?: number; children: React.ReactNode}> = ({
  startBeat,
  beats,
  name,
  tail = 0,
  head = 0,
  children,
}) => {
  const parent = useContext(ShotClock);
  const globalFrom = beatFrame(startBeat) - head;
  const globalTo = beatFrame(startBeat + beats) + tail;
  return (
    <Sequence from={globalFrom - parent.fromFrame} durationInFrames={Math.max(1, globalTo - globalFrom)} name={name} layout="none">
      <ShotClock.Provider value={{startBeat, fromFrame: globalFrom}}>
        <AbsoluteFill>{children}</AbsoluteFill>
      </ShotClock.Provider>
    </Sequence>
  );
};

/** Image filling the frame (object-fit cover) with optional zoom / pan / blur — for backgrounds. */
export const Backdrop: React.FC<{sprite?: string; src?: string; zoom?: number; x?: number; y?: number; blur?: number; darken?: number; tint?: string; pixelated?: boolean}> = ({
  sprite,
  src,
  zoom = 1,
  x = 0,
  y = 0,
  blur = 0,
  darken = 0,
  tint,
  pixelated = false,
}) => {
  const resolve = useSpriteSrc();
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img
        src={src ?? resolve(sprite!)}
        style={{
          position: 'absolute',
          inset: blur ? -blur * 3 : 0,
          width: blur ? `calc(100% + ${blur * 6}px)` : '100%',
          height: blur ? `calc(100% + ${blur * 6}px)` : '100%',
          objectFit: 'cover',
          transform: `translate(${-x}px, ${-y}px) scale(${zoom})`,
          filter: blur ? `blur(${blur}px)` : undefined,
          imageRendering: pixelated ? 'pixelated' : undefined,
        }}
      />
      {tint ? <AbsoluteFill style={{background: tint}} /> : null}
      {darken ? <AbsoluteFill style={{background: '#000', opacity: darken}} /> : null}
    </AbsoluteFill>
  );
};

/** Debug overlay: bar · beat · frame, a beat flash and a 16-step grid. Toggle with the `debug` prop. */
export const BeatHUD: React.FC<{label?: string}> = ({label}) => {
  const {globalFrame, globalBeat, bar, beatInBar} = useShotClock();
  const frame = useCurrentFrame();
  const sinceBeat = (globalBeat % 1) * BEAT;
  const sixteenth = Math.floor((globalBeat % 4) * 4);
  const text = `${label ?? ''} 小节 ${bar} · 拍 ${beatInBar} · f${globalFrame} · ${(globalFrame / 60).toFixed(3)}s`;
  useFontsFor(text, [700]);
  return (
    <div style={{position: 'absolute', right: 16, bottom: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: alpha(C.ink, 0.75), borderRadius: 6, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 18, color: C.paper}} data-frame={frame}>
      <div style={{width: 18, height: 18, background: sinceBeat < 4 ? (beatInBar === 1 ? C.lychee : C.gold) : alpha(C.paper, 0.2)}} />
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(16, 6px)', gap: 2}}>
        {Array.from({length: 16}).map((_, i) => (
          <div key={i} style={{width: 6, height: 12, background: i === sixteenth ? C.gold : i % 4 === 0 ? alpha(C.paper, 0.5) : alpha(C.paper, 0.18)}} />
        ))}
      </div>
      <span>{text}</span>
    </div>
  );
};
