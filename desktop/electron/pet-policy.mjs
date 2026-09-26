// 宠物窗的纯策略模块：不 import electron，便于像 window-policy.mjs 一样单测。
// 立绘选择与庭院共用名册；桌面窗口只负责窗口和动作策略。
import {petSprite} from './pet-catalog.mjs';

// 窗口尺寸与右下角停靠留白（像素）。气泡在立绘上方展开，所以窗口偏高一点。
export const PET_WIDTH = 260;
export const PET_HEIGHT = 320;
export const PET_MARGIN = 24;

// 宠物缩放：只有一个数值，预设档位只是它的具名值（避免「预设 + 连续值」双轨）。
export const PET_SCALE_MIN = 0.4;
export const PET_SCALE_MAX = 2.0;
export const PET_SCALE_DEFAULT = 1;
export const PET_SCALE_PRESETS = [
  {id: 'small', label: '小', scale: 0.6},
  {id: 'medium', label: '中', scale: 1},
  {id: 'large', label: '大', scale: 1.5},
];

// 台词上限与 engine.mjs 的 say() 一致：60 字。
export const PET_SAY_MAX = 60;

// 归一化缩放值：非有限数回落默认值，越界夹紧，四舍五入到 2 位。
export function petScaleClamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return PET_SCALE_DEFAULT;
  return Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, Math.round(n * 100) / 100));
}

// 窗口几何的唯一来源：基准尺寸 × scale；未保存位置时贴工作区右下角。
// 整个窗口保持在工作区内；工作区小于宠物窗时按比例缩小有效尺寸，不改用户缩放设置。
export function petWindowBounds(workArea, scale, position) {
  const s = petScaleClamp(scale);
  const area = workArea || {};
  const ax = Number.isFinite(area.x) ? Math.round(area.x) : 0;
  const ay = Number.isFinite(area.y) ? Math.round(area.y) : 0;
  const aw = Number.isFinite(area.width) ? Math.max(1, Math.floor(area.width)) : 1;
  const ah = Number.isFinite(area.height) ? Math.max(1, Math.floor(area.height)) : 1;
  const requestedWidth = Math.round(PET_WIDTH * s);
  const requestedHeight = Math.round(PET_HEIGHT * s);
  const fit = Math.min(1, aw / requestedWidth, ah / requestedHeight);
  const width = Math.max(1, Math.floor(requestedWidth * fit));
  const height = Math.max(1, Math.floor(requestedHeight * fit));
  const hasPosition = Number.isFinite(position?.x) && Number.isFinite(position?.y);
  const x = hasPosition ? Math.round(position.x) : ax + aw - width - PET_MARGIN;
  const y = hasPosition ? Math.round(position.y) : ay + ah - height - PET_MARGIN;
  return {
    x: Math.min(ax + aw - width, Math.max(ax, x)),
    y: Math.min(ay + ah - height, Math.max(ay, y)),
    width,
    height,
  };
}

// BrowserWindow 选项（不含 webPreferences，由 main.mjs 注入 preload 等安全配置）。
// scale 缺省为 1，输出与本函数加缩放参数之前完全一致。
export function petWindowOptions(workArea, scale = 1, position) {
  const bounds = petWindowBounds(workArea, scale, position);
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false, // 常驻宠物不抢焦点
    hasShadow: false,
    show: false,
    title: 'szuDesktop 宠物',
  };
}

// 镜像 engine.mjs 的 say()：String(text).slice(0,60)。
export function petSay(text) {
  return String(text).slice(0, PET_SAY_MAX);
}

// 与庭院使用同一个状态选择函数，新增伙伴不需要再维护桌面名单。
export const petSpriteFor=petSprite;

// 从存档 game 段取当前伙伴，镜像 engine.mjs 的 activePet()。读不到就返回 null，
// 由调用方决定不推送（状态读不到时如实未知，不伪造）。
export function activePetOf(game) {
  const pets = game?.pets;
  if (!Array.isArray(pets) || pets.length === 0) return null;
  return pets[game.active] || pets[0] || null;
}

// 宠物窗 IPC 的可信来源校验，结构与 window-policy.mjs 的 isTrustedSender 一致：
// 只认宠物窗自己的主 frame，且 frame URL 恰好是本地 pet.html。
export function isPetSender(event, petWin, petUrl) {
  return Boolean(petWin && event.sender === petWin.webContents
    && event.senderFrame === petWin.webContents.mainFrame
    && event.senderFrame?.url === petUrl);
}

// 缩放值命中哪个预设档位；自定义值与非有限值返回 null（托盘菜单据此决定要不要打勾）。
export function petPresetFor(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n)) return null;
  const hit = PET_SCALE_PRESETS.find(p => p.scale === petScaleClamp(n));
  return hit ? hit.id : null;
}
