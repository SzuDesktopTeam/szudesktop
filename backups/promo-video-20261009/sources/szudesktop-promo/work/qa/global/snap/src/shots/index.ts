import type {Block, ShotComponent} from './registry';
import {Opening} from './opening';
import {DesktopShots} from './desktop';
import {S08, S09, S10, S11, S12} from './focus';
import {S13, S14, S15, S16, S17, S18} from './world';
import {S19, S20, S21} from './notes';
import {S22, S23, S24, S25} from './net';
import {S26, S27, S28} from './trust';
import {EndingShots} from './ending';
import {VDesktop, V05, V06, V07, V08, V09, V10, V11, V12, V13} from './vertical';

const single = (pairs: Array<[string, ShotComponent]>): Block[] => pairs.map(([id, comp]) => ({from: id, to: id, comp}));

/**
 * Film-level whip / tilt transitions (compositions/Film.tsx): `cut` = id of the incoming shot,
 * `pre` / `post` = frames of travel before / after the cut. Outgoing and incoming shots ride
 * one continuous track, so no frame ever shows the empty stage.
 */
export type Transition = {cut: string; kind: 'whip' | 'tilt'; pre: number; post: number; coins?: boolean};
export const TRANSITIONS: Transition[] = [
  {cut: 'S04', kind: 'whip', pre: 4, post: 6},
  {cut: 'S11', kind: 'tilt', pre: 9, post: 9, coins: true},
  {cut: 'S14', kind: 'whip', pre: 5, post: 6},
  {cut: 'V03', kind: 'whip', pre: 4, post: 6},
];

export const BLOCKS: Block[] = [
  {from: 'S01', to: 'S03', comp: Opening},
  {from: 'S04', to: 'S07', comp: DesktopShots},
  ...single([
    ['S08', S08],
    ['S09', S09],
    ['S10', S10],
    ['S11', S11],
    ['S12', S12],
    ['S13', S13],
    ['S14', S14],
    ['S15', S15],
    ['S16', S16],
    ['S17', S17],
    ['S18', S18],
    ['S19', S19],
    ['S20', S20],
    ['S21', S21],
    ['S22', S22],
    ['S23', S23],
    ['S24', S24],
    ['S25', S25],
    ['S26', S26],
    ['S27', S27],
    ['S28', S28],
  ]),
  {from: 'S29', to: 'S30', comp: EndingShots},
  {from: 'V01', to: 'V02', comp: Opening},
  {from: 'V03', to: 'V04', comp: VDesktop},
  ...single([
    ['V05', V05],
    ['V06', V06],
    ['V07', V07],
    ['V08', V08],
    ['V09', V09],
    ['V10', V10],
    ['V11', V11],
    ['V12', V12],
    ['V13', V13],
  ]),
];
