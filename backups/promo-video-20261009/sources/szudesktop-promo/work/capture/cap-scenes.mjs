// 三渲二风景真 3D 推镜：荔湖晴昼 / 雨后书屋 / 蓝调晚庭，横版 1920×1080 与竖版 1080×1920，各 210 帧 60fps，逐帧确定性渲染。
import fs from 'node:fs';
import path from 'node:path';
import {startEngine, launchBrowser, attachInterception, saveClip, sleep, log, WORK, TMP, OUT} from './lib/harness.mjs';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const FRAMES = 210;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const SHOTS = [
  {key: 'clip_scene_lake_dolly', skin: 'lake', name: '荔湖晴昼', cam: t => ({dist: lerp(1.12, 0.86, t), yaw: lerp(-3, 3, t)}), move: '相机距离系数 1.12→0.86（easeInOut），绕 Y 轴 -3°→+3°'},
  {key: 'clip_scene_bookshop_dolly', skin: 'bookshop', name: '雨后书屋', cam: t => ({dist: lerp(1.10, 0.88, t), pitch: lerp(2, -1, t)}), move: '相机距离系数 1.10→0.88，俯仰 +2°→-1°'},
  {key: 'clip_scene_terrace_dolly', skin: 'terrace', name: '蓝调晚庭', cam: t => ({dist: lerp(1.08, 0.86, t), lift: lerp(0, 1.2, t)}), move: '相机距离系数 1.08→0.86，目标点上移 0→+1.2（升降感）'},
];
const FORMATS = [
  {suffix: '', width: 1920, height: 1080, retreat: null, note: '横版 1920×1080'},
  // 竖版：首页窄卡片会把相机退到 2.6 倍远，主体太小；这里固定后退 1.55 倍，主体居中，左右由画面裁掉。
  {suffix: '_v', width: 1080, height: 1920, retreat: 1.55, note: '竖版 1080×1920'},
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style></head><body><script type="module">import {setup} from './__promo_scene.mjs';window.__promoSetup=setup;window.__promoReady=true;</script></body></html>`;
const mod = fs.readFileSync(WORK + '/lib/promo-scene.mjs');

const eng = await startEngine();
const browser = await launchBrowser({gpu: process.env.PROMO_GPU || 'metal'});
try {
  for (const shot of SHOTS) {
    for (const fmt of FORMATS) {
      const key = shot.key + fmt.suffix;
      if (only && !only.has(key) && !only.has(shot.skin)) continue;
      const page = await browser.newPage();
      await page.setViewport({width: fmt.width, height: fmt.height, deviceScaleFactor: 1});
      page.on('pageerror', e => log('pageerror', e.message));
      page.on('console', m => { if (m.type() === 'error') log('console', m.text()); });
      await attachInterception(page, {eng, extraFiles: {
        '/assets/garden/__promo_scene.html': {type: 'text/html; charset=utf-8', body: html},
        '/assets/garden/__promo_scene.mjs': {type: 'text/javascript; charset=utf-8', body: mod},
      }});
      await page.goto(eng.base + '/assets/garden/__promo_scene.html', {waitUntil: 'load'});
      await page.waitForFunction(() => window.__promoReady === true, {timeout: 20000});
      const info = await page.evaluate(o => { window.__scene = window.__promoSetup(o); return {...window.__scene.info, gl: (() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()}; }, {skin: shot.skin, width: fmt.width, height: fmt.height, retreatOverride: fmt.retreat});
      log(key, JSON.stringify(info));
      // 预热两帧（着色器编译、阴影贴图）。
      for (let w = 0; w < 2; w++) await page.evaluate(c => window.__scene.frame(2, c), shot.cam(0));
      const dir = path.join(TMP, key);
      fs.rmSync(dir, {recursive: true, force: true});
      fs.mkdirSync(dir, {recursive: true});
      const t0 = Date.now();
      for (let f = 0; f < FRAMES; f++) {
        const t = easeInOut(f / (FRAMES - 1));
        await page.evaluate((time, c) => window.__scene.frame(time, c), 2 + f / 60, shot.cam(t));
        const buf = await page.screenshot({type: 'png', captureBeyondViewport: false, optimizeForSpeed: true});
        fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.png'), buf);
      }
      log(`rendered ${key} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      saveClip(dir, key, {
        description: `应用自带三渲二场景「${shot.name}」（home-scene-world.mjs skin='${shot.skin}'）的真 3D 推镜，${fmt.note}，逐帧确定性渲染：${shot.move}，湖面波纹、棕榈、灯串照常动画（world.update(2 + f/60)）。灯光、天空、雾、描线、调色与 FXAA 照 home-scene-renderer.mjs 复刻，内部 1.5 倍超采样（与首页小卡片同精度）。不含任何界面文字。`,
        render: {...info, frames: FRAMES, fps: 60, easing: 'easeInOut', internalScale: 1.5},
        sceneName: shot.name,
      }, {heroFrames: [0, 105, 209]});
      await page.close();
    }
  }
} finally {
  await browser.__close();
  await eng.stop();
}
