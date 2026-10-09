/**
 * Shot implementations. A "block" is one component that plays across one or more consecutive
 * storyboard shots (e.g. S01–S03 as one continuous opening), so camera moves and sprites can
 * carry across cut points that the music wants to keep continuous. Inside a block,
 * useShotClock().at(b) is relative to the block's first beat.
 */
import type React from 'react';
import type {ShotSpec} from '../timeline/shots';

export type ShotComponent = React.FC<{spec: ShotSpec; vertical: boolean}>;
export type Block = {from: string; to: string; comp: ShotComponent};

export const SHOT_REGISTRY: Record<string, ShotComponent> = {};
