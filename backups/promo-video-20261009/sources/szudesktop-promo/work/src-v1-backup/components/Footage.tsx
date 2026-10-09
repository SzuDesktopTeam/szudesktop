import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';

/**
 * Captured UI footage. Clips are stored as 60 fps PNG sequences (lossless — UI text and pixel
 * art stay sharp) under public/assets/footage/<key>/<NNNN>.png, stills as
 * public/assets/footage/<key>.png. MP4 clips also work through <FootageVideo>.
 */
export type FrameSequenceProps = {
  /** Folder relative to public/, e.g. 'assets/footage/clip_focus_todo_add'. */
  dir: string;
  /** Number of frames in the folder. */
  count: number;
  /** File name pattern: {i} is replaced by the zero-padded index. */
  pattern?: string;
  pad?: number;
  /** First file index (default 0). */
  first?: number;
  /** Local frame at which the clip starts playing. */
  at?: number;
  /** Source frames advanced per output frame (2 = double speed, 0.5 = half). */
  rate?: number;
  /** Start offset inside the clip (source frames). */
  offset?: number;
  /** Explicit source frame (overrides at/rate/offset) — for retimed or frozen playback. */
  sourceFrame?: number;
  loop?: boolean;
  fit?: 'cover' | 'contain' | 'fill';
  position?: string;
  style?: React.CSSProperties;
};

export const FrameSequence: React.FC<FrameSequenceProps> = ({
  dir,
  count,
  pattern = '{i}.png',
  pad = 4,
  first = 0,
  at = 0,
  rate = 1,
  offset = 0,
  sourceFrame,
  loop = false,
  fit = 'cover',
  position = '50% 50%',
  style,
}) => {
  const frame = useCurrentFrame();
  let i = sourceFrame ?? Math.floor(offset + Math.max(0, frame - at) * rate);
  i = loop ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i));
  const file = pattern.replace('{i}', String(first + i).padStart(pad, '0'));
  return (
    <AbsoluteFill style={style}>
      <Img src={staticFile(`${dir}/${file}`)} style={{width: '100%', height: '100%', objectFit: fit, objectPosition: position}} />
    </AbsoluteFill>
  );
};

/** A still screenshot from public/assets/footage/<key>.png filling its box. */
export const FootageStill: React.FC<{name: string; fit?: 'cover' | 'contain' | 'fill'; position?: string; style?: React.CSSProperties}> = ({name, fit = 'cover', position = '50% 0%', style}) => (
  <AbsoluteFill style={style}>
    <Img src={staticFile(`assets/footage/${name}.png`)} style={{width: '100%', height: '100%', objectFit: fit, objectPosition: position}} />
  </AbsoluteFill>
);

/** MP4/MOV footage via OffthreadVideo (frame-exact extraction by Remotion's compositor). */
export const FootageVideo: React.FC<{src: string; startFrom?: number; playbackRate?: number; style?: React.CSSProperties}> = ({src, startFrom = 0, playbackRate = 1, style}) => (
  <OffthreadVideo src={staticFile(src)} trimBefore={startFrom} playbackRate={playbackRate} muted style={{width: '100%', height: '100%', objectFit: 'cover', ...style}} />
);
