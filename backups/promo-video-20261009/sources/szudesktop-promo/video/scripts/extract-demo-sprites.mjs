// Rasterise a small set of the app's own pixel art into 1x transparent PNGs for the
// component demo (public/demo/sprites). The real sprite set for the film is produced
// by the asset step into ../assets/sprites with the same key names; this script only
// exists so the Remotion chain can be verified end-to-end with genuine artwork.
//
// Read-only use of the app worktree: modules are imported, nothing is written there.
// Brand guard: only libao / chestnut / egret are exported (no Pingu, Skipper, turtle).
//
//   node scripts/extract-demo-sprites.mjs [--out public/demo/sprites] [--all-actions]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';

const SRC = '/Users/alakazan/workplace/szudesktop-promo-src/desktop';
const GARDEN = path.join(SRC, 'assets/garden');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argOut = process.argv.indexOf('--out');
const OUT = path.resolve(root, argOut > 0 ? process.argv[argOut + 1] : 'public/demo/sprites');
const ALL_ACTIONS = process.argv.includes('--all-actions');

const {animationFrames} = await import(path.join(GARDEN, 'pet-animation-art.mjs'));
const {tileArtwork} = await import(path.join(GARDEN, 'arcade-art.mjs'));
const {cropIcon} = await import(path.join(GARDEN, 'garden-items.mjs'));
const {PET_SYMBOLS} = await import(path.join(GARDEN, 'pet-art.mjs'));

const indexHtml = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const appSymbols = indexHtml.match(/<symbol\b[\s\S]*?<\/symbol>/g) ?? [];
// Only the symbols that tiles/icons reference; never ship retired companions' art.
const petHappy = PET_SYMBOLS.match(/<symbol id="libao-happy"[\s\S]*?<\/symbol>/)?.[0] ?? '';
if (!petHappy) throw new Error('libao-happy symbol not found');
const DEFS = `<defs>${appSymbols.join('')}${petHappy}</defs>`;

const wrap = (inner, w, h, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${viewBox}" shape-rendering="crispEdges">${DEFS}${inner}</svg>`;
const fromTag = (svgTag, w, h) => wrap(svgTag.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''), w, h);
const fixUse = (s) => s.replace(/<use href=/g, '<use xlink:href=');

const jobs = [];
const SPECIES = {libao: 'libao', chestnut: 'cat', egret: 'egret'};
const DEMO_ACTIONS = new Set(['idle', 'walk', 'greet', 'celebrate', 'signature', 'focus', 'pat', 'look', 'harvest', 'water', 'build']);
for (const [species, key] of Object.entries(SPECIES)) {
  for (const f of animationFrames(species)) {
    if (!ALL_ACTIONS && !DEMO_ACTIONS.has(f.action)) continue;
    const [, , w, h] = f.viewBox.split(' ').map(Number);
    jobs.push({key: `pet_${key}_${f.action}_${f.index}`, w, h, svg: wrap(f.art, w, h, f.viewBox)});
  }
}
for (const crop of ['radish', 'strawberry', 'blueberry', 'lychee']) {
  jobs.push({key: `crop_${crop}`, w: 16, h: 16, svg: fixUse(fromTag(cropIcon(crop), 16, 16))});
}
jobs.push({key: 'brand_lychee', w: 16, h: 16, svg: wrap('<use xlink:href="#f-lychee" width="16" height="16"/>', 16, 16)});
for (const icon of ['coin', 'heart', 'seed', 'water', 'chest', 'shield', 'key', 'signal', 'disconnect', 'compass', 'lantern', 'flower', 'book', 'quill', 'calendar', 'medal', 'bell', 'clock', 'scroll', 'cottage']) {
  jobs.push({key: `icon_${icon}`, w: 16, h: 16, svg: wrap(`<use xlink:href="#i-${icon}" width="16" height="16"/>`, 16, 16)});
}
for (const v of [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]) {
  jobs.push({key: `tile_${v}`, w: 32, h: 32, svg: fixUse(fromTag(tileArtwork(v), 32, 32))});
}

fs.mkdirSync(OUT, {recursive: true});
const userDataDir = fs.mkdtempSync('/tmp/promo-sprites-chrome-');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const results = await page.evaluate(async (list) => {
    const out = [];
    for (const job of list) {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(job.svg);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = job.w;
      c.height = job.h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, job.w, job.h);
      const data = ctx.getImageData(0, 0, job.w, job.h).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
      out.push({key: job.key, png: c.toDataURL('image/png').split(',')[1], opaque});
    }
    return out;
  }, jobs);
  for (const r of results) {
    if (r.opaque === 0) throw new Error(`${r.key} rasterised empty`);
    fs.writeFileSync(path.join(OUT, `${r.key}.png`), Buffer.from(r.png, 'base64'));
  }
  console.log(`wrote ${results.length} sprites to ${path.relative(root, OUT)}`);
} finally {
  await browser.close();
  fs.rmSync(userDataDir, {recursive: true, force: true});
}

// Plain copies of bitmap art (flora, scene backgrounds) and the app icon.
for (const f of ['tallgrass', 'berrybush']) fs.copyFileSync(path.join(GARDEN, 'flora', `${f}.png`), path.join(OUT, `flora_${f}.png`));
fs.copyFileSync(path.join(GARDEN, 'campus.png'), path.join(OUT, 'bg_campus.png'));
fs.copyFileSync(path.join(GARDEN, 'courtyard.png'), path.join(OUT, 'bg_courtyard.png'));
fs.copyFileSync(path.join(SRC, 'assets/szudesktop-trayTemplate@2x.png'), path.join(OUT, 'tray_icon.png'));
execFileSync('/opt/miniconda3/bin/python3', ['-c',
  `from PIL import Image\nim=Image.open(r'''${path.join(SRC, 'assets/szudesktop.icns')}''')\nim.load()\nassert im.size==(1024,1024), im.size\nim.save(r'''${path.join(OUT, 'app_icon_1024.png')}''')`]);
console.log('copied flora, backgrounds, tray icon, app icon');
