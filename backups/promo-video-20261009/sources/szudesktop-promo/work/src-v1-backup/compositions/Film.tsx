import React from 'react';
import {AbsoluteFill, staticFile, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {BodyText} from '../components/BodyText';
import {PixelTitle} from '../components/PixelTitle';
import {PixelPanel} from '../components/PixelUI';
import {BeatHUD, Shot} from '../components/Shot';
import {SpriteRoot, DEFAULT_SPRITE_ROOT} from '../lib/assets';
import {secToBeat, useShotClock} from '../lib/beat';
import {SHOT_REGISTRY, ShotComponent} from '../shots/registry';
import {BLOCKS} from '../shots';
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

type Segment = {spec: ShotSpec; Comp: ShotComponent};

/** Merge consecutive shots covered by a block into one segment. */
const segmentsFor = (shots: ShotSpec[]): Segment[] => {
  const out: Segment[] = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const block = BLOCKS.find((b) => b.from === s.id);
    if (block) {
      const j = shots.findIndex((x) => x.id === block.to);
      if (j >= i) {
        const last = shots[j];
        out.push({spec: {...s, id: j > i ? `${s.id}-${last.id}` : s.id, end: last.end}, Comp: block.comp});
        i = j;
        continue;
      }
    }
    out.push({spec: s, Comp: SHOT_REGISTRY[s.id] ?? PlaceholderShot});
  }
  return out;
};

/** Plays the shot list on the beat grid; unregistered shots show a placeholder card. */
export const Film: React.FC<FilmProps & {shots: ShotSpec[]}> = ({shots, music, debug, spriteRoot}) => {
  const {width, height} = useVideoConfig();
  const vertical = height > width;
  const segs = segmentsFor(shots);
  return (
    <SpriteRoot.Provider value={spriteRoot}>
      <AbsoluteFill style={{background: C.ink}}>
        {segs.map(({spec, Comp}) => {
          const sb = secToBeat(spec.start);
          const eb = secToBeat(spec.end);
          return (
            <Shot key={spec.id} startBeat={sb} beats={eb - sb} name={`${spec.id} ${spec.section}`}>
              <Comp spec={spec} vertical={vertical} />
              {debug ? <BeatHUD label={spec.id} /> : null}
            </Shot>
          );
        })}
        {music ? <Audio src={staticFile(music)} /> : null}
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
