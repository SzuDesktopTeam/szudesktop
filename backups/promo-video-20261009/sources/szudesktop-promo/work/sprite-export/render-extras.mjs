// Chrome-rendered extras that need the repo's Fusion Pixel font.
//   node render-extras.mjs cards     → tiles/card/tile_card_<value>.png (arcade.css look, ×3)
//   node render-extras.mjs overview  → overview.png (contact sheet of everything in manifest.json)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';

const SRC = '/Users/alakazan/workplace/szudesktop-promo-src/desktop';
const OUT = '/Users/alakazan/workplace/szudesktop-promo/assets/sprites';
const WORK = '/Users/alakazan/workplace/szudesktop-promo/work/sprite-export';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT_CSS = pathToFileURL(path.join(SRC, 'assets/fonts/fusion-pixel.css')).href;
const PIXEL = '"Fusion Pixel 12px Proportional Simplified Chinese"';
const mode = process.argv[2];

async function withPage(viewport, fn) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'szu-promo-extras-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir: profile,
    args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', '--hide-scrollbars', '--allow-file-access-from-files', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({...viewport, deviceScaleFactor: 1});
    return await fn(page);
  } finally {
    await browser.close();
    fs.rmSync(profile, {recursive: true, force: true});
  }
}
async function loadHtml(page, name, html) {
  const file = path.join(WORK, name);
  fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load'});
  await page.evaluate(async () => { await document.fonts.ready; });
}

// arcade.css tile colours (desktop/assets/garden/arcade.css), geometry ×3 of a ~112 px tile.
const TILE_STYLE = {
  2: ['#f1e5c9', '#d3bc91'], 4: ['#dce7bb', '#b6ca91'], 8: ['#f0d2b6', '#dab28b'], 16: ['#f0c4c4', '#d5a1a5'],
  32: ['#d4d7eb', '#b1b7d4'], 64: ['#e7c0ca', '#c994a4'], 128: ['#dfba83', '#c59656'], 256: ['#d89b89', '#bd7b69'],
  512: ['#aaa6cc', '#8986b1'], 1024: ['#c18b9a', '#a7687c'], 2048: ['#e7c474', '#b88b37'], 4096: ['#e7c474', '#b88b37'],
};

if (mode === 'cards') {
  const values = Object.keys(TILE_STYLE).map(Number);
  const T = 336, ART = 224; // art = 32 px grid ×7
  const cards = values.map(v => {
    const [bg, edge] = TILE_STYLE[v], celebration = v >= 2048, digits = String(v).length;
    const size = digits >= 4 ? 60 : 72; // Fusion Pixel at 12 px multiples
    return `<div class="card" id="t${v}" style="--bg:${bg};--edge:${edge}"><div class="tile${celebration ? ' cele' : ''}"><img src="${pathToFileURL(path.join(OUT, 'tiles/1x', `tile_${v}.png`)).href}" width="${ART}" height="${ART}"><strong style="font-size:${size}px">${v}</strong></div></div>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_CSS}"><style>
    html,body{margin:0;background:transparent}
    body{display:flex;flex-wrap:wrap;gap:24px;padding:0;width:${(T + 24) * 4}px}
    .card{width:${T}px;height:${T + 6}px;position:relative}
    .tile{position:absolute;left:0;top:0;width:${T}px;height:${T}px;box-sizing:border-box;background:var(--bg);border:3px solid var(--edge);box-shadow:inset 0 6px #ffffff99,0 6px #65462640;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 0 15px}
    .tile.cele{box-shadow:inset 0 0 0 6px #f8df9e,0 6px #65462640}
    img{position:absolute;left:${(T - 6 - ART) / 2}px;top:6px;image-rendering:pixelated}
    strong{position:relative;z-index:1;padding:3px 12px;border:3px solid #7b5b3329;background:#fff4dbe8;color:#513c29;font-family:${PIXEL};font-weight:400;line-height:1;letter-spacing:0;-webkit-font-smoothing:none;font-variant-numeric:tabular-nums}
  </style></head><body>${cards}</body></html>`;
  fs.mkdirSync(path.join(OUT, 'tiles/card'), {recursive: true});
  await withPage({width: 1600, height: 1200}, async page => {
    await loadHtml(page, 'cards.tmp.html', html);
    await page.evaluate(async font => { await document.fonts.load(`72px ${font}`, '0123456789'); await document.fonts.load(`60px ${font}`, '0123456789'); }, PIXEL);
    const ok = await page.evaluate(font => document.fonts.check(`72px ${font}`, '2048'), PIXEL);
    if (!ok) throw new Error('Fusion Pixel did not load');
    for (const v of values) {
      const el = await page.$(`#t${v}`);
      await el.screenshot({path: path.join(OUT, 'tiles/card', `tile_card_${v}.png`), omitBackground: true});
    }
  });
  fs.rmSync(path.join(WORK, 'cards.tmp.html'));
  console.log(`rendered ${values.length} tile cards`);
} else if (mode === 'overview') {
  const M = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const src = rel => pathToFileURL(path.join(OUT, rel)).href;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const S = M.sprites;
  const img = (rel, w, h, cls = '') => `<img class="px ${cls}" src="${src(rel)}" width="${w}" height="${h}">`;
  const cell = (inner, label, sub = '') => `<figure>${inner}<figcaption>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</figcaption></figure>`;

  // Companions: one block per companion, 18 action rows × 6 frames.
  const petBlocks = M.companions.map(c => {
    const rows = M.pet_actions.map(action => {
      const s = S[`pet_${c.sprite_id}_${action}`];
      const [w, h] = s.native_size, k = c.overview_scale;
      const frames = s.frames.map(f => `<div class="fr">${img(f.png_1x, w * k, h * k)}<i>${f.duration_ms}</i></div>`).join('');
      return `<div class="row"><div class="lab">${esc(action)}<small>${esc(s.action_label)}${s.loop ? ' · 循环' : ''}</small></div>${frames}</div>`;
    }).join('');
    return `<section class="pet"><h3>${esc(c.name)} <small>pet_${c.sprite_id}_* · ${c.native_size.join('×')} · hd ×${c.hd_scale}</small></h3>${rows}</section>`;
  }).join('');
  const ORDER = {libao: 0, cat: 1, egret: 2}, STATE = {normal: 0, happy: 1, sad: 2, sleep: 3};
  const statics = Object.values(S).filter(s => s.group === 'pets_static').sort((a, b) => {const [, pa, , sa] = a.key.split('_'), [, pb, , sb] = b.key.split('_'); return ORDER[pa] - ORDER[pb] || STATE[sa] - STATE[sb];}).map(s => cell(img(s.png_1x, s.native_size[0] * s.overview_scale, s.native_size[1] * s.overview_scale), s.key.replace('pet_', '').replace('_static', ''))).join('');
  const itemRank = k => k.startsWith('crop_') ? 0 : k === 'brand_lychee' ? 1 : 2;
  const items = Object.values(S).filter(s => s.group === 'items').sort((a, b) => itemRank(a.key) - itemRank(b.key) || a.key.localeCompare(b.key)).map(s => cell(img(s.png_1x, s.native_size[0] * 5, s.native_size[1] * 5), s.key, s.label || '')).join('');
  const tiles = Object.values(S).filter(s => s.group === 'tiles').sort((a, b) => a.value - b.value).map(s => cell(`<div class="pair">${img(s.png_1x, 128, 128)}<img src="${src(s.card)}" width="168" height="171"></div>`, s.key, s.label)).join('');
  const projects = Object.values(S).filter(s => s.group === 'projects').map(s => cell(img(s.png_1x, 288, 168), s.key, s.label)).join('');
  const build = S.project_picnic.build_steps_1x.map((f, i) => cell(img(f, 144, 84), `build ${String(i + 1).padStart(2, '0')}`)).join('');
  const flora = ['flora_tallgrass', 'flora_berrybush'].map(k => cell(img(S[k].png_1x, S[k].native_size[0] * 12, S[k].native_size[1] * 12), k)).join('');
  const misc = [
    cell(img(S.app_icon_1024.png, 256, 256, 'smooth'), 'app_icon_1024', '1024×1024'),
    cell(`<div class="dark">${img(S.tray_icon.png_paper_1x, 128, 128)}</div>`, 'tray_icon', '暖纸着色 ×4'),
    cell(img(S.cursor_pixel.png_1x.normal, 72, 114), 'cursor_pixel', '常态 ×6'),
    cell(img(S.cursor_pixel.png_1x.pressed, 72, 114), 'cursor_pixel', '按下 ×6'),
  ].join('');
  const bgs = [
    cell(img(S.bg_campus.png, 560, 315, 'smooth'), 'bg_campus', '1672×941 原图'),
    cell(img(S.bg_courtyard.png, 472, 315, 'smooth'), 'bg_courtyard', '1536×1024 原图'),
    cell(img(S.bg_campus.cover['1080x1920'], 177, 315, 'smooth'), 'bg_campus 竖版', '1080×1920'),
  ].join('');
  const mosaics = S.bg_campus.mosaic['1920x1080'].map(m => cell(img(m.png, 320, 180), `m${m.block}`, `${m.block}px 块`)).join('');
  const wall = cell(img(S.pet_wall_324.phases[0], 540, 540, 'smooth'), 'pet_wall_324', `phase 0 / 6 · ${S.pet_wall_324.size.join('×')}`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_CSS}"><style>
    html,body{margin:0;background:#fff9e9;color:#3f3829}
    body{width:2600px;padding:40px 48px 60px;box-sizing:border-box;font-family:${PIXEL};-webkit-font-smoothing:none}
    h1{font-size:48px;font-weight:400;margin:0 0 6px;color:#6e1f35}
    h2{font-size:36px;font-weight:400;margin:44px 0 16px;padding:6px 16px;background:#88582f;color:#ffd36f;display:inline-block}
    h3{font-size:24px;font-weight:400;margin:0 0 10px;color:#6e1f35}
    h3 small,.lab small,figcaption small{display:block;font-size:12px;color:#88582f}
    p.meta{font-size:24px;margin:0;color:#88582f}
    .px{image-rendering:pixelated;display:block}.smooth{image-rendering:auto}
    .pets{display:flex;gap:28px;align-items:flex-start}
    .pet{background:#f3e7cd;padding:14px;border:3px solid #d6c5a2}
    .row{display:flex;align-items:flex-end;gap:4px;margin-bottom:4px}
    .lab{width:104px;font-size:12px;align-self:center}
    .fr{background:#fffdf5;position:relative;padding:2px;display:flex;align-items:flex-end;justify-content:center;min-width:${0}px}
    .fr:nth-child(odd){background:#eadcc1}
    .fr i{position:absolute;right:2px;top:1px;font-size:12px;font-style:normal;color:#88582f}
    .grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
    figure{margin:0;padding:10px;background:#f3e7cd;border:2px solid #d6c5a2;display:flex;flex-direction:column;align-items:center;gap:6px}
    figcaption{font-size:12px;text-align:center}
    .pair{display:flex;gap:10px;align-items:center}
    .dark{background:#2e4d36;padding:12px}
  </style></head><body>
    <h1>szuDesktop · 荔枝庭院 · 宣传片像素素材总览</h1>
    <p class="meta">源码 ${esc(M.source.commit)} · 只含荔宝、栗栗、小白 · ${M.stats.files} 个文件 · 1x 原生像素 + hd 最近邻整数放大（最长边 ≤ 1024）</p>
    <h2>伙伴动画 3 × 18 动作 × 6 帧 = 324 帧（角标为毫秒）</h2><div class="pets">${petBlocks}</div>
    <h2>伙伴静态表情</h2><div class="grid">${statics}</div>
    <h2>作物与界面图标（×5）</h2><div class="grid">${items}</div>
    <h2>伙伴小桌 2048 棋子（原画 ×4 / arcade.css 棋子卡）</h2><div class="grid">${tiles}</div>
    <h2>庭院建设（×6）与野餐角逐行搭建（×3）</h2><div class="grid">${projects}</div><div class="grid" style="margin-top:14px">${build}</div>
    <h2>花草、图标、光标</h2><div class="grid">${flora}${misc}</div>
    <h2>背景、开场马赛克、动作墙</h2><div class="grid">${bgs}</div><div class="grid" style="margin-top:14px">${mosaics}</div><div class="grid" style="margin-top:14px">${wall}</div>
  </body></html>`;
  await withPage({width: 2600, height: 1200}, async page => {
    await loadHtml(page, 'overview.tmp.html', html);
    await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    const broken = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
    if (broken.length) throw new Error('broken images: ' + broken.slice(0, 5).join(', '));
    await page.screenshot({path: path.join(OUT, 'overview.png'), fullPage: true});
  });
  fs.rmSync(path.join(WORK, 'overview.tmp.html'));
  console.log('rendered overview.png');
} else {
  console.error('usage: node render-extras.mjs cards|overview');
  process.exit(2);
}
