import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ease, keyframes, tween} from '../lib/anim';
import {FONT_BODY, useFontsFor} from '../theme/fonts';

/**
 * Rebuilt native context menu (Electron Menu.popup cannot be screenshotted). Neutral, OS-agnostic
 * light menu: no system logos. Labels must be copied verbatim from the app source.
 */
export type MenuItem =
  | {type: 'separator'}
  | {type?: 'item'; label: string; disabled?: boolean; submenu?: boolean; checked?: boolean; radio?: boolean};

/**
 * The companion menu exactly as desktop/electron/pet-controller.mjs builds it (lines ~145–166),
 * filled with demo-save values. The submenu for 切换伙伴 is built separately (3 originals only).
 */
export const petMenuItems = (s: {name: string; lv: number; hunger: number; mood: number; energy: number; food: number; scalePct: number; sleeping?: boolean; onTop?: boolean}): MenuItem[] => [
  {label: `${s.name} · Lv.${s.lv}`, disabled: true},
  {label: `饱食 ${s.hunger} · 心情 ${s.mood} · 精力 ${s.energy}`, disabled: true},
  {type: 'separator'},
  {label: '聊两句'},
  {label: '摸摸头'},
  {label: `喂食（剩余 ${s.food} 份）`},
  {label: '陪它玩'},
  {label: s.sleeping ? '叫醒伙伴' : '让它睡一会'},
  {label: '切换伙伴', submenu: true},
  {type: 'separator'},
  {label: '看看庭院'},
  {label: '照看农田'},
  {label: '学习与专注'},
  {label: `伙伴大小（${s.scalePct}%）`, submenu: true},
  {type: 'separator'},
  {label: '打开主窗口'},
  {label: '伙伴置顶', checked: s.onTop ?? true},
  {label: '隐藏伙伴'},
  {label: '退出应用'},
];

/** 切换伙伴 submenu — only the three original companions may appear in the film. */
export const switchPetItems = (active: 0 | 1 | 2): MenuItem[] =>
  ['荔宝', '栗栗', '小白'].map((label, i) => ({label, radio: true, checked: i === active}));

export const NativeMenu: React.FC<{
  items: MenuItem[];
  x: number;
  y: number;
  /** Local frame the menu pops open (scale 0.9 → 1 over 4 frames). */
  at?: number;
  closeAt?: number;
  /** Index of the highlighted item (hover). */
  highlight?: number;
  scale?: number;
  width?: number;
}> = ({items, x, y, at = 0, closeAt, highlight, scale = 2, width = 210}) => {
  const frame = useCurrentFrame();
  const labels = items.map((i) => ('label' in i ? i.label : '')).join('') + '✓•▸';
  useFontsFor(labels, [500]);
  if (frame < at || (closeAt !== undefined && frame >= closeAt + 4)) return null;
  const s = keyframes(frame, [
    [at, 0.9],
    [at + 4, 1, ease.out],
  ]);
  const op = tween(frame, at, at + 3, 0, 1, ease.linear) * (closeAt !== undefined ? tween(frame, closeAt, closeAt + 4, 1, 0, ease.linear) : 1);
  const k = scale;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: width * k,
        transform: `scale(${s})`,
        transformOrigin: '0 0',
        opacity: op,
        background: 'rgba(250, 249, 246, 0.97)',
        border: `${0.5 * k}px solid rgba(0,0,0,.14)`,
        borderRadius: 8 * k,
        boxShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,.22), 0 ${1 * k}px ${3 * k}px rgba(0,0,0,.12)`,
        padding: `${4 * k}px 0`,
        fontFamily: FONT_BODY,
        fontWeight: 500,
        fontSize: 13.5 * k,
        color: '#1f1f1f',
      }}
    >
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={i} style={{height: 0.5 * k, background: 'rgba(0,0,0,.12)', margin: `${4 * k}px ${10 * k}px`}} />
        ) : (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 24 * k,
              margin: `0 ${4 * k}px`,
              padding: `0 ${8 * k}px 0 ${22 * k}px`,
              borderRadius: 4 * k,
              position: 'relative',
              color: item.disabled ? 'rgba(0,0,0,.38)' : highlight === i ? '#fff' : '#1f1f1f',
              background: highlight === i ? '#42654B' : 'transparent',
            }}
          >
            {item.checked ? <span style={{position: 'absolute', left: 7 * k, fontSize: 12 * k}}>{item.radio ? '•' : '✓'}</span> : null}
            <span style={{flex: 1, whiteSpace: 'nowrap'}}>{item.label}</span>
            {item.submenu ? <span style={{fontSize: 10 * k, opacity: 0.7}}>▸</span> : null}
          </div>
        ),
      )}
    </div>
  );
};
