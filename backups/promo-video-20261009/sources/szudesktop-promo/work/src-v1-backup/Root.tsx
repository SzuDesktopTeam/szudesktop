import React from 'react';
import {Composition, Folder, Still} from 'remotion';
import {ComponentDemo, DEMO_FRAMES} from './compositions/ComponentDemo';
import {Film, FilmProps, defaultFilmProps} from './compositions/Film';
import {FontCheck, PixelCloseUp} from './compositions/FontCheck';
import {FPS} from './lib/beat';
import {SHOTS_16x9, SHOTS_9x16} from './timeline/shots';

const Main16x9: React.FC<FilmProps> = (p) => <Film {...p} shots={SHOTS_16x9} />;
const Main9x16: React.FC<FilmProps> = (p) => <Film {...p} shots={SHOTS_9x16} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Film">
      {/* 60.000 s = 32 bars @128 BPM */}
      <Composition id="Main16x9" component={Main16x9} width={1920} height={1080} fps={FPS} durationInFrames={60 * FPS} defaultProps={{...defaultFilmProps, music: null}} />
      {/* 30.000 s = 16 bars */}
      <Composition id="Main9x16" component={Main9x16} width={1080} height={1920} fps={FPS} durationInFrames={30 * FPS} defaultProps={{...defaultFilmProps, music: null}} />
    </Folder>
    <Folder name="Dev">
      <Composition id="ComponentDemo" component={ComponentDemo} width={1920} height={1080} fps={FPS} durationInFrames={DEMO_FRAMES} />
      <Still id="FontCheck" component={FontCheck} width={1920} height={3600} />
      <Still id="PixelCloseUp" component={PixelCloseUp} width={1920} height={1080} />
    </Folder>
  </>
);
