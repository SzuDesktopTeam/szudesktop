// 逐帧交互时间线：在指定帧移动鼠标、按下/抬起、键入；每帧记录光标位置（CSS 像素，视口坐标）。
import {ease} from './harness.mjs';

export function timeline(page, actor) {
  const actions = new Map();
  const glides = [];
  const add = (f, fn) => { if (!actions.has(f)) actions.set(f, []); actions.get(f).push(fn); };
  const resolve = async target => {
    if (typeof target === 'function') return target();
    if (typeof target === 'string') {
      const p = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; }, target);
      if (!p) throw new Error('timeline: no element ' + target);
      return p;
    }
    return target;
  };
  const tl = {
    at(f, fn) { add(f, fn); return tl; },
    // 从当时的光标位置平滑移到 target（选择器 / 坐标 / 函数），用 frames 帧。
    glide(f, frames, target, {dx = 0, dy = 0} = {}) {
      add(f, async () => {
        const to = await resolve(target);
        glides.push({start: f, frames, from: {x: actor.cursor.x, y: actor.cursor.y}, to: {x: to.x + dx, y: to.y + dy}});
      });
      return tl;
    },
    click(f, target = null, {hold = 3} = {}) {
      if (target) add(f, async () => { const p = await resolve(target); await actor.move(p.x, p.y); });
      add(f, () => actor.down());
      add(f + hold, () => actor.up());
      return tl;
    },
    type(f, text, every = 7) {
      [...text].forEach((ch, i) => add(f + i * every, () => actor.type(ch)));
      return tl;
    },
    press(f, key) { add(f, () => actor.press(key)); return tl; },
    async run(i) {
      actor.setFrame(i);
      for (const fn of actions.get(i) || []) await fn();
      for (const g of glides) {
        if (i < g.start || i > g.start + g.frames) continue;
        const t = g.frames ? ease((i - g.start) / g.frames) : 1;
        await actor.move(g.from.x + (g.to.x - g.from.x) * t, g.from.y + (g.to.y - g.from.y) * t);
      }
      actor.record();
    },
  };
  return tl;
}
