/**
 * Asset addressing. public/assets is a symlink to ../../assets (the promo project's asset
 * folder), forwarded into the bundle without copying, so anything the capture / sprite steps
 * write there is reachable as staticFile('assets/…').
 *
 * Sprite keys follow the storyboard sprite_list: pet_<libao|cat|egret>_<action>_<0-5>,
 * crop_*, icon_*, tile_<value>, flora_*, bg_*, brand_lychee, app_icon_1024, tray_icon,
 * project_* … Each key is a 1× transparent PNG at its native art size; components scale it
 * with nearest-neighbour (image-rendering: pixelated) at integer factors.
 *
 * The sprite root is a React context so the component demo can point at public/demo/sprites
 * (produced by scripts/extract-demo-sprites.mjs) while the film uses assets/sprites.
 */
import {createContext, useContext} from 'react';
import {staticFile} from 'remotion';

export const DEFAULT_SPRITE_ROOT = 'sp';
export const DEMO_SPRITE_ROOT = 'demo/sprites';
export const FOOTAGE_ROOT = 'assets/footage';
export const AUDIO_ROOT = 'assets/audio';

export const SpriteRoot = createContext<string>(DEFAULT_SPRITE_ROOT);
export const useSpriteRoot = () => useContext(SpriteRoot);

/** staticFile() URL of a sprite key under the current root. */
export const useSpriteSrc = () => {
  const root = useSpriteRoot();
  return (key: string) => staticFile(`${root}/${key}.png`);
};

export const assetSrc = (relPath: string) => staticFile(`assets/${relPath}`);

export type Species = 'libao' | 'chestnut' | 'egret';
/** File-key prefix and native art size per companion (pet-catalog.mjs viewBox). */
export const PET_META: Record<Species, {key: string; w: number; h: number; name: string; tempo: number}> = {
  libao: {key: 'libao', w: 52, h: 56, name: '荔宝', tempo: 1.0},
  chestnut: {key: 'cat', w: 20, h: 22, name: '栗栗', tempo: 1.16},
  egret: {key: 'egret', w: 32, h: 32, name: '小白', tempo: 1.3},
};

export const PET_ACTIONS = [
  'idle', 'look', 'walk', 'pat', 'eat', 'play', 'sleep', 'wake', 'celebrate',
  'focus', 'sad', 'greet', 'water', 'harvest', 'gift', 'build', 'ponder', 'signature',
] as const;
export type PetAction = (typeof PET_ACTIONS)[number];

export const petFrameKey = (species: Species, action: PetAction, index: number) =>
  `pet_${PET_META[species].key}_${action}_${index}`;

/** Native sizes of non-pet sprite families (px at 1×). */
export const SPRITE_SIZE: Record<string, {w: number; h: number}> = {
  brand_lychee: {w: 16, h: 16},
  flora_tallgrass: {w: 8, h: 8},
  flora_berrybush: {w: 8, h: 6},
  app_icon_1024: {w: 1024, h: 1024},
  tray_icon: {w: 32, h: 32},
  bg_campus: {w: 1672, h: 941},
  bg_courtyard: {w: 1536, h: 1024},
  project_picnic: {w: 48, h: 28},
  project_seedrack: {w: 48, h: 28},
  project_lakeLights: {w: 48, h: 28},
  pet_wall_324: {w: 18 * 64, h: 18 * 64},
};

export const spriteSize = (key: string): {w: number; h: number} => {
  if (SPRITE_SIZE[key]) return SPRITE_SIZE[key];
  if (key.startsWith('tile_card_')) return {w: 336, h: 342};
  if (/^project_\w+_build_\d+$/.test(key)) return {w: 48, h: 28};
  if (key.startsWith('cursor_pixel')) return {w: 12, h: 19};
  if (key.startsWith('pet_wall_324')) return {w: 2160, h: 2160};
  if (key === 'tray_icon_paper') return {w: 32, h: 32};
  const cover = /_(\d+)x(\d+)(_m\d+)?$/.exec(key);
  if (cover) return {w: Number(cover[1]), h: Number(cover[2])};
  if (key.startsWith('tile_')) return {w: 32, h: 32};
  if (key.startsWith('crop_') || key.startsWith('icon_')) return {w: 16, h: 16};
  const pet = /^pet_(libao|cat|egret)_/.exec(key)?.[1];
  if (pet) {
    const sp = (Object.keys(PET_META) as Species[]).find((s) => PET_META[s].key === pet)!;
    return {w: PET_META[sp].w, h: PET_META[sp].h};
  }
  throw new Error(`Unknown sprite size for ${key}; add it to SPRITE_SIZE`);
};

/** Particle-friendly sprite groups (storyboard §1: only real art as particles). */
export const PARTICLES = {
  harvest: ['crop_lychee', 'icon_coin', 'crop_radish', 'crop_strawberry', 'crop_blueberry'],
  coins: ['icon_coin'],
  coinsAndLychee: ['icon_coin', 'icon_coin', 'icon_coin', 'icon_coin', 'crop_lychee'],
  hearts: ['icon_heart'],
  confetti: ['crop_lychee', 'icon_coin', 'crop_radish', 'crop_strawberry', 'crop_blueberry', 'icon_heart', 'icon_seed', 'icon_flower'],
  water: ['icon_water'],
  lanterns: ['icon_lantern', 'icon_flower'],
} as const;

/** 2048 tile ladder (arcade-art.mjs TILE_LEVELS) — names are the in-app names. */
export const TILE_LEVELS = [
  {value: 2, name: '种子袋'},
  {value: 4, name: '嫩芽'},
  {value: 8, name: '小萝卜'},
  {value: 16, name: '草莓'},
  {value: 32, name: '蓝莓'},
  {value: 64, name: '荔枝'},
  {value: 128, name: '萝卜篮'},
  {value: 256, name: '草莓篮'},
  {value: 512, name: '蓝莓篮'},
  {value: 1024, name: '荔枝篮'},
  {value: 2048, name: '荔宝丰收礼'},
] as const;
