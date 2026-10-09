// 桌面伙伴窗（desktop/electron/pet.html）真实渲染：注入 window.szuPet 替身，推送伙伴、150% 缩放与台词，截透明 PNG。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {launchBrowser, attachInterception, styleSource, saveStillMeta, sleep, log, OUT, SRC, brandCheck} from './lib/harness.mjs';

const DESKTOP = SRC + '/desktop';
const LINES = [
  {id: '01_libao_greet', species: 'libao', text: '你来啦！我给你腾出一个位置。', source: 'pet-dialogue.mjs libao.greet[0]', shot: 'S04'},
  {id: '02_libao_pat', species: 'libao', text: '嘿嘿，叶子都被你摸歪啦。', source: 'libao.pat[0]', shot: 'S06'},
  {id: '03_chestnut_signature', species: 'chestnut', text: '纸箱验收。请注意我的进入姿势。', source: 'chestnut.signature[0]', shot: 'S07'},
  {id: '04_egret_greeting', species: 'egret', text: '湖边的风很舒服，陪你坐一会儿。', source: 'pet-catalog.mjs egret.greeting', shot: 'S07'},
  {id: '05_libao_focus', species: 'libao', text: '小板凳摆好了，我坐这儿陪着。', source: 'libao.focusStart[1]', shot: 'S09'},
  {id: '06_libao_harvest', species: 'libao', text: '满满一小篮！我负责扶稳，你来放。', source: 'libao.harvest[0]', shot: 'S12'},
  {id: '07_libao_greet2', species: 'libao', text: '嗨，我是荔宝。今天先做哪件小事？', source: 'libao.greet[1]', shot: 'S30'},
];
const SCALE = 1.5, W = 260, H = 320;
const TYPES = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'};

// 只读静态服务器：只提供 desktop/electron/ 的 pet.html 与 .mjs，以及它们桥接到的 desktop/assets/garden/*.mjs，绑定 127.0.0.1 随机端口。
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  const file = path.resolve(DESKTOP, rel);
  const allowed = (file.startsWith(DESKTOP + '/electron/') || file.startsWith(DESKTOP + '/assets/garden/')) && /\.(html|mjs)$/.test(file);
  if (!allowed || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const dir = path.join(OUT, 'ui_pet_window_bubbles');
fs.mkdirSync(dir, {recursive: true});

const browser = await launchBrowser();
const outputs = [];
try {
  for (const line of LINES) {
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    await page.setViewport({width: Math.round(W * SCALE), height: Math.round(H * SCALE), deviceScaleFactor: 2});
    await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);
    await page.evaluateOnNewDocument(() => {
      window.__pet = {};
      window.szuPet = Object.freeze({
        onState: cb => { window.__pet.state = cb; }, onSay: cb => { window.__pet.say = cb; }, onAction: cb => { window.__pet.action = cb; },
        onScale: cb => { window.__pet.scale = cb; }, onReaction: cb => { window.__pet.react = cb; },
        openMenu() {}, hit() {}, scaleStep() {}, drag() {},
      });
    });
    // 气泡字体换成 Noto Sans SC（pet.html 原本按 Microsoft YaHei / PingFang 回退）。
    await page.evaluateOnNewDocument(styleSource('html, body { font-family: "Noto Sans SC", sans-serif !important; }'));
    page.on('pageerror', e => log('pageerror', e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) log('http', r.status(), r.url()); });
    await attachInterception(page, {staticPort: port});
    await page.goto(`http://127.0.0.1:${port}/electron/pet.html`, {waitUntil: 'load'});
    await page.waitForFunction(() => window.__pet.action && window.__pet.say, {timeout: 10000});
    await page.evaluate((species, scale) => { window.__pet.action({species, mood: 85, energy: 85, sleeping: false, focus: false, motion: true}); window.__pet.scale(scale); }, line.species, SCALE);
    await page.evaluate(async () => { await document.fonts.ready; });
    await sleep(400);
    await page.evaluate(text => window.__pet.say(text), line.text);
    await page.evaluate(async () => { await document.fonts.ready; });
    await sleep(900);
    await brandCheck(page);
    const full = path.join(dir, `${line.id}.window.png`);
    await page.screenshot({path: full, omitBackground: true});
    const bubble = await page.evaluate(() => { const b = document.getElementById('bubble').getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; });
    const pad = 14;
    const clip = {x: Math.max(0, bubble.x - pad), y: Math.max(0, bubble.y - pad), width: bubble.width + pad * 2, height: bubble.height + pad * 2 + 4};
    await page.evaluate(() => { document.getElementById('pet').style.visibility = 'hidden'; });
    const only = path.join(dir, `${line.id}.bubble.png`);
    await page.screenshot({path: only, omitBackground: true, clip});
    const petBox = await page.evaluate(() => { const b = document.getElementById('pet').getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; });
    outputs.push({...line, window: `ui_pet_window_bubbles/${line.id}.window.png`, bubble: `ui_pet_window_bubbles/${line.id}.bubble.png`, bubbleCss: bubble, bubbleClipCss: clip, petCss: petBox});
    log('pet bubble', line.id);
    await page.close();
  }
  saveStillMeta('ui_pet_window_bubbles', {
    file: 'ui_pet_window_bubbles/', description: `真实的桌面伙伴透明窗 pet.html（${W}×${H} × 伙伴大小 ${SCALE * 100}% = ${W * SCALE}×${H * SCALE} CSS 像素，2x 截图，透明背景）。注入 window.szuPet 替身推送伙伴、缩放与台词；气泡是 pet.html 自己的样式（#FFFDF6 底、#6E1F35 2px 边、12px 圆角、尾巴、0.28 s 弹出）。每句两张：.window.png（伙伴 + 气泡，伙伴为当时的逐帧动作帧），.bubble.png（只有气泡，含阴影与尾巴，便于贴在任意位置）。字体为 Noto Sans SC。`,
    lines: outputs, windowCss: {width: W * SCALE, height: H * SCALE}, deviceScaleFactor: 2,
  });
} finally {
  await browser.__close();
  server.close();
}
