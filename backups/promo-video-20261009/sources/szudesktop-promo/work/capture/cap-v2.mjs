// v2 补采（审片意见）：
//  ① 三渲二风景按成片镜长逐帧重渲（上屏 playbackRate = 1，不再用 1.7× / 2.2× 抽帧），内部 2 倍超采样；
//     相机路径按镜长压缩，world.update 按真实时间（f/60）走。
//  ② 在同一个隔离存档里：专注页写下「复习高数第三章」→ 课程笔记里选中「课后做完习题 3.2」点「选中 → 待办」
//     → 回到专注页，采一张「我的小事」卡片（4 条待完成）。
// 用法：node cap-v2.mjs [scenes|todo]（缺省两项都做）
import fs from 'node:fs';
import path from 'node:path';
import {startEngine, launchBrowser, attachInterception, newAppPage, openApp, gotoRoute, saveClip, still, saveStillMeta, rectOf, sleep, log, WORK, TMP, OUT} from './lib/harness.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = k => !only || only.has(k);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 2.4);
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 镜长：横版 S13/S14/S15 各 112–113 帧（多渲 8 帧给转场余量）；竖版 V07 三段 56 / 28 / 28 帧。
const SCENES = [
  {key: 'clip_scene_lake_s13', skin: 'lake', w: 1920, h: 1080, retreat: null, frames: 120, cam: f => { const t = easeOut(f / 112); return {dist: lerp(1.18, 0.78, t), yaw: lerp(-7, 6, t)}; }, move: 'DROP：相机距离 1.18→0.78（easeOut，前快后慢），绕 Y 轴 -7°→+6°'},
  {key: 'clip_scene_bookshop_s14', skin: 'bookshop', w: 1920, h: 1080, retreat: null, frames: 120, cam: f => { const t = easeInOut(Math.min(1, f / 112)); return {dist: lerp(1.12, 0.84, t), pitch: lerp(2.5, -1.5, t), yaw: lerp(3, -3, t)}; }, move: '相机距离 1.12→0.84，俯仰 +2.5°→-1.5°，绕 Y 轴 +3°→-3°'},
  {key: 'clip_scene_terrace_s15', skin: 'terrace', w: 1920, h: 1080, retreat: null, frames: 120, cam: f => { const t = easeOut(f / 90); return {dist: lerp(1.1, 0.84, t), lift: lerp(0, 1.3, t), yaw: lerp(-3, 2, t)}; }, move: '相机距离 1.10→0.84（前 90 帧走完），目标点上移 0→1.3，绕 Y 轴 -3°→+2°'},
  {key: 'clip_scene_lake_v7', skin: 'lake', w: 1080, h: 1920, retreat: 1.55, frames: 64, cam: f => { const t = easeOut(f / 56); return {dist: lerp(1.16, 0.8, t), yaw: lerp(-6, 5, t)}; }, move: '竖版 DROP：相机距离 1.16→0.80（easeOut），绕 Y 轴 -6°→+5°'},
  {key: 'clip_scene_bookshop_v7', skin: 'bookshop', w: 1080, h: 1920, retreat: 1.55, frames: 36, cam: f => { const t = easeOut(f / 28); return {dist: lerp(1.04, 0.86, t), pitch: lerp(2, -1, t)}; }, move: '竖版：相机距离 1.04→0.86，俯仰 +2°→-1°'},
  {key: 'clip_scene_terrace_v7', skin: 'terrace', w: 1080, h: 1920, retreat: 1.55, frames: 36, cam: f => { const t = easeOut(f / 28); return {dist: lerp(1.02, 0.86, t), lift: lerp(0, 1.0, t)}; }, move: '竖版：相机距离 1.02→0.86，目标点上移 0→1.0'},
];

async function scenes() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style></head><body><script type="module">import {setup} from './__promo_scene.mjs';window.__promoSetup=setup;window.__promoReady=true;</script></body></html>`;
  const mod = fs.readFileSync(WORK + '/lib/promo-scene.mjs');
  const eng = await startEngine();
  const browser = await launchBrowser({gpu: process.env.PROMO_GPU || 'metal'});
  try {
    for (const s of SCENES) {
      const page = await browser.newPage();
      await page.setViewport({width: s.w, height: s.h, deviceScaleFactor: 1});
      page.on('pageerror', e => log('pageerror', e.message));
      await attachInterception(page, {eng, extraFiles: {
        '/assets/garden/__promo_scene.html': {type: 'text/html; charset=utf-8', body: html},
        '/assets/garden/__promo_scene.mjs': {type: 'text/javascript; charset=utf-8', body: mod},
      }});
      await page.goto(eng.base + '/assets/garden/__promo_scene.html', {waitUntil: 'load'});
      await page.waitForFunction(() => window.__promoReady === true, {timeout: 20000});
      const info = await page.evaluate(o => { window.__scene = window.__promoSetup(o); return window.__scene.info; }, {skin: s.skin, width: s.w, height: s.h, retreatOverride: s.retreat, scale: 2});
      for (let k = 0; k < 2; k++) await page.evaluate(c => window.__scene.frame(2, c), s.cam(0));
      const dir = path.join(TMP, s.key);
      fs.rmSync(dir, {recursive: true, force: true});
      fs.mkdirSync(dir, {recursive: true});
      const t0 = Date.now();
      let internal = null;
      for (let f = 0; f < s.frames; f++) {
        const r = await page.evaluate((time, c) => window.__scene.frame(time, c), 2 + f / 60, s.cam(f));
        internal = r.internal;
        fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.png'), await page.screenshot({type: 'png', optimizeForSpeed: true}));
      }
      log(`rendered ${s.key} (${s.frames} f, internal ${internal}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      saveClip(dir, s.key, {
        description: `v2 逐镜重渲：应用自带三渲二场景（home-scene-world.mjs skin='${s.skin}'），${s.w}×${s.h}，${s.frames} 帧 60fps，上屏 1× 播放（无抽帧）。${s.move}；world.update(2 + f/60) 真实时间。内部 2 倍超采样（${internal}），其余管线同 cap-scenes.mjs。不含任何界面文字。`,
        render: {...info, frames: s.frames, fps: 60, internalScale: 2, internal},
      }, {heroFrames: [0, Math.floor(s.frames / 2), s.frames - 1]});
      await page.close();
    }
  } finally {
    await browser.__close();
    await eng.stop();
  }
}

async function todo() {
  const eng = await startEngine();
  const browser = await launchBrowser();
  try {
    await eng.setWorkspace(saveA());
    await eng.setNotebook(demoNotebook());
    const page = await newAppPage(browser, eng);
    // 1. 专注页：写下「复习高数第三章」（与 clip_focus_todo_add 相同的操作）。
    await openApp(page, eng, '#study/focus');
    await page.evaluate(() => document.querySelector('#todo-text').scrollIntoView({block: 'center'}));
    await sleep(300);
    await page.focus('#todo-text');
    await page.keyboard.type('复习高数第三章');
    await page.evaluate(() => document.querySelector('#todo-form button.primary').click());
    await sleep(800);
    log('todos after add', (await eng.getWorkspace()).todos.map(t => t.text));
    // 2. 课程笔记：选中「课后做完习题 3.2」，点工具栏「选中 → 待办」（与 clip_note_to_todo 相同）。
    await gotoRoute(page, '#study/notes');
    await page.waitForSelector('#note-body');
    await sleep(800);
    const target = '课后做完习题 3.2';
    await page.evaluate(t => { const a = document.querySelector('#note-body'); const i = a.value.indexOf(t); a.focus(); a.setSelectionRange(i, i + t.length); }, target);
    await page.evaluate(() => document.querySelector('[data-note-action="task"]').click());
    await sleep(900);
    const toast = await page.evaluate(() => document.querySelector('#toast')?.textContent?.trim() || '');
    log('toast after note→todo:', toast);
    const todos = (await eng.getWorkspace()).todos.map(t => t.text);
    log('todos', todos);
    if (!todos.includes(target)) throw new Error('note→todo did not add the item');
    // 3. 回到专注页，采「我的小事」卡片。
    await gotoRoute(page, '#study/focus');
    await sleep(1200);
    await page.evaluate(() => window.scrollTo(0, 310));
    await sleep(800);
    const card = await rectOf(page, '.focus-layout > section.card:nth-of-type(2)', 6);
    log('todo card rect', card);
    await still(page, OUT + '/ui_focus_todos_after_note.png', {clip: card});
    saveStillMeta('ui_focus_todos_after_note', {
      file: 'ui_focus_todos_after_note.png',
      description: '同一个隔离存档里先在专注页写下「复习高数第三章」，再在课程笔记里选中「课后做完习题 3.2」点「选中 → 待办」（提示：' + toast + '），回到学习书屋 → 专注与小事后的「我的小事」卡片（2x），待完成 4 条：' + todos.join(' / ') + '。',
      clipCss: card, todos, toast,
    });
  } finally {
    await browser.__close();
    await eng.stop();
  }
}

if (want('todo')) await todo();
if (want('scenes')) await scenes();
