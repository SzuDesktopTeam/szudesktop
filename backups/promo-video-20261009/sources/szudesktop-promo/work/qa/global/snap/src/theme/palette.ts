/**
 * Film palette. Every value is lifted from the app itself (szudesktop-promo-src @ 4b25817):
 * desktop/assets/garden/style.css custom properties, the pixel art in pet-art.mjs /
 * index.html symbols, and electron/pet.html. Do not introduce colours outside this file.
 */
export const C = {
  /** 荔枝红 · 主色 — pet-art.mjs 荔宝身体 */
  lychee: '#ED4C67',
  /** 荔枝深红 · 标题描边 / 气泡边 — 荔宝描边、pet.html #bubble border */
  lycheeDeep: '#6E1F35',
  /** 荔枝果红 — index.html #f-lychee */
  lycheeFruit: '#E04848',
  /** 叶绿亮 / 叶绿 — #f-lychee 叶 */
  leafLight: '#63C164',
  leaf: '#4C9838',
  /** 主按钮绿 / 深绿 — style.css .primary 底色与边框 */
  green: '#42654B',
  greenDeep: '#2E4D36',
  /** 暖纸 / 纸高光 / 纸线 — --paper --paper-hi --line */
  paper: '#FFF9E9',
  paperHi: '#FFFDF5',
  line: '#D6C5A2',
  /** 木 / 木亮 / 深木 — --wood --wood-light --wood-dark（深木做硬阴影） */
  wood: '#88582F',
  woodLight: '#BC8444',
  woodDark: '#492A16',
  /** 金（数字、奖励）/ 橙 — --gold --orange */
  gold: '#FFD36F',
  orange: '#DF8A28',
  /** 墨 / 次要文字 — --ink --muted */
  ink: '#3F3829',
  muted: '#706752',
  /** 成功绿 — --success（校园网「在线」） */
  success: '#326B3B',
  /** 断网红 · 只用于校园网段 — --error */
  error: '#A03F3B',
  /** 信息蓝 · 只用于校园网段 — --info */
  info: '#286483',
  /** pet.html 气泡底色与气泡文字色 */
  bubble: '#FFFDF6',
  bubbleText: '#4A1A28',
  /** 伙伴动作墙交替格底 — pet-animation-art.mjs animationContactSheet */
  cellA: '#F3E7CD',
  cellB: '#EADCC1',
} as const;

export type PaletteKey = keyof typeof C;

/** rgba() from a palette hex, for shadows and veils. */
export const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Soft card shadow used for 3D UI cards (storyboard §1: 24px soft shadow). */
export const cardShadow = (strength = 1) =>
  `0 ${Math.round(18 * strength)}px ${Math.round(48 * strength)}px ${alpha(C.woodDark, 0.35 * strength)}, 0 ${Math.round(4 * strength)}px ${Math.round(12 * strength)}px ${alpha(C.woodDark, 0.25 * strength)}`;
