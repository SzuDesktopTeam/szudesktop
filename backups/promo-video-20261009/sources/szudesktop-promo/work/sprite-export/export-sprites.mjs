// Export app-native pixel art for the promo video.
//
// Reads the app's own art modules from the read-only source worktree (no edits,
// no git), wraps every drawing as a standalone crispEdges SVG and rasterises it
// at 1x with headless Chrome (transparent background). Python (post.py) then
// verifies colours, builds nearest-neighbour HD copies, atlases and the manifest.
// Chrome runs with --disable-gpu: its software rasteriser honours the authored
// shape-rendering=crispEdges on diagonal polygon edges; the GPU path antialiases them.
//
// Only the three original companions are exported: libao (荔宝), chestnut (栗栗,
// sprite id "cat") and egret (小白). Pingu, Skipper and turtle (阿青) are never
// drawn, parsed into defs or written to disk.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';

const SRC = '/Users/alakazan/workplace/szudesktop-promo-src/desktop';
const GARDEN = path.join(SRC, 'assets/garden');
const OUT = '/Users/alakazan/workplace/szudesktop-promo/assets/sprites';
const WORK = '/Users/alakazan/workplace/szudesktop-promo/work/sprite-export';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SPECIES = [
  {species: 'libao', sprite: 'libao'},
  {species: 'chestnut', sprite: 'cat'},
  {species: 'egret', sprite: 'egret'},
];
const ALLOWED_PET_SYMBOL = /^(libao|cat|egret)(-(normal|happy|sad|sleep))?$/;
const FORBIDDEN = /pingu|skipper|turtle|企鹅|小龟|阿青|noot/i;

const {animationFrames} = await import(path.join(GARDEN, 'pet-animation-art.mjs'));
const {PET_CLIPS, PET_ACTIONS, ACTION_LABELS, signatureLabel} = await import(path.join(GARDEN, 'pet-animation.mjs'));
const {PETS} = await import(path.join(GARDEN, 'pet-catalog.mjs'));
const {PET_SYMBOLS} = await import(path.join(GARDEN, 'pet-art.mjs'));
const {tileArtwork, TILE_LEVELS, tileIdentity} = await import(path.join(GARDEN, 'arcade-art.mjs'));
const {cropIcon} = await import(path.join(GARDEN, 'garden-items.mjs'));
const {projectArt} = await import(path.join(GARDEN, 'garden-loop-ui.mjs'));
const {CROPS, PROJECTS} = await import(path.join(GARDEN, 'garden-loop.mjs'));

const symbolRe = /<symbol id="([^"]+)" viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g;
function parseSymbols(text) {
  const map = new Map();
  for (const m of text.matchAll(symbolRe)) map.set(m[1], {id: m[1], viewBox: m[2], body: m[3].trim(), raw: m[0]});
  return map;
}
const indexSymbols = parseSymbols(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'));
const petSymbols = new Map([...parseSymbols(PET_SYMBOLS)].filter(([id]) => ALLOWED_PET_SYMBOL.test(id)));

const dims = viewBox => viewBox.trim().split(/\s+/).map(Number).slice(2);
const standalone = (viewBox, body, defs = '') => {
  const [w, h] = dims(viewBox);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" shape-rendering="crispEdges">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
};
// Strip an app <svg ...> wrapper (class/aria attributes) and keep its viewBox + body.
function unwrap(svg) {
  const m = svg.match(/^<svg([^>]*)>([\s\S]*)<\/svg>$/);
  if (!m) throw new Error('not an svg: ' + svg.slice(0, 80));
  const vb = m[1].match(/viewBox="([^"]+)"/);
  return {viewBox: vb ? vb[1] : null, body: m[2]};
}

const jobs = [];
function addJob(job) {
  const text = job.svg;
  if (FORBIDDEN.test(text)) throw new Error(`forbidden companion leaked into ${job.key}`);
  jobs.push(job);
}

// 1) Companion animation frames: 3 companions x 18 actions x 6 frames = 324.
const petMeta = {};
for (const {species, sprite} of SPECIES) {
  const frames = animationFrames(species);
  if (frames.length !== PET_ACTIONS.length * 6) throw new Error(`${species}: expected 108 frames, got ${frames.length}`);
  petMeta[sprite] = {species, sprite, name: PETS[species].name, viewBox: PETS[species].viewBox, signature_label: signatureLabel(species), actions: {}};
  for (const f of frames) {
    const clip = PET_CLIPS[species][f.action];
    const key = `pet_${sprite}_${f.action}`;
    petMeta[sprite].actions[f.action] ??= {key, action: f.action, label: f.action === 'signature' ? `${ACTION_LABELS[f.action]}（${signatureLabel(species)}）` : ACTION_LABELS[f.action], loop: clip.loop, total_ms: clip.duration, frames: []};
    petMeta[sprite].actions[f.action].frames.push({index: f.index, symbol_id: f.id, duration_ms: clip.frames[f.index].duration});
    addJob({group: 'pets', key, frame: f.index, name: `${key}_${f.index}`, viewBox: f.viewBox, svg: standalone(f.viewBox, f.art), source: `pet-animation-art.mjs animationFrames('${species}') → ${f.id}`});
  }
}

// 2) Static expressions from pet-art.mjs PET_SYMBOLS (base symbol == normal).
for (const {sprite} of SPECIES) for (const state of ['normal', 'happy', 'sad', 'sleep']) {
  const sym = petSymbols.get(`${sprite}-${state}`);
  if (!sym) throw new Error(`missing ${sprite}-${state}`);
  addJob({group: 'pets_static', key: `pet_${sprite}_static_${state}`, name: `pet_${sprite}_static_${state}`, viewBox: sym.viewBox, svg: standalone(sym.viewBox, sym.body), source: `pet-art.mjs PET_SYMBOLS #${sym.id}`});
}

// 3) Crops (shared by the farm and the 2048 table) and the brand lychee.
const radish = unwrap(cropIcon('radish'));
addJob({group: 'items', key: 'crop_radish', name: 'crop_radish', viewBox: radish.viewBox, svg: standalone(radish.viewBox, radish.body), source: "garden-items.mjs cropIcon('radish')", label: CROPS.radish.name});
for (const [crop, id] of [['strawberry', 'f-straw'], ['blueberry', 'f-blue'], ['lychee', 'f-lychee']]) {
  const sym = indexSymbols.get(id);
  addJob({group: 'items', key: `crop_${crop}`, name: `crop_${crop}`, viewBox: sym.viewBox, svg: standalone(sym.viewBox, sym.body), source: `desktop/index.html <symbol id="${id}"> (cropIcon('${crop}'))`, label: CROPS[crop].name});
}

// 4) UI / inventory icons actually referenced by the app (i-oak is defined but unused).
const SKIPPED_SYMBOLS = ['f-star', 'f-pump', 'f-cherry', 'i-oak'];
for (const [id, sym] of indexSymbols) {
  if (!id.startsWith('i-') || SKIPPED_SYMBOLS.includes(id)) continue;
  const name = `icon_${id.slice(2)}`;
  addJob({group: 'items', key: name, name, viewBox: sym.viewBox, svg: standalone(sym.viewBox, sym.body), source: `desktop/index.html <symbol id="${id}">`});
}

// 5) 2048 tiles: tileArtwork(value) with the symbols it <use>s.
const tileDefs = [petSymbols.get('libao-happy').raw, ...['i-seed', 'f-straw', 'f-blue', 'f-lychee'].map(id => indexSymbols.get(id).raw)].join('');
for (const value of [...TILE_LEVELS.map(l => l.value), 4096]) {
  const {viewBox, body} = unwrap(tileArtwork(value));
  const ident = tileIdentity(value);
  addJob({group: 'tiles', key: `tile_${value}`, name: `tile_${value}`, viewBox, svg: standalone(viewBox, body, tileDefs), source: `arcade-art.mjs tileArtwork(${value})`, label: ident.name, kind: ident.kind, value});
}

// 6) Courtyard construction projects (decorations placed into the farm scene).
for (const id of Object.keys(PROJECTS)) {
  const {viewBox, body} = unwrap(projectArt(id));
  addJob({group: 'projects', key: `project_${id}`, name: `project_${id}`, viewBox, svg: standalone(viewBox, body), source: `garden-loop-ui.mjs projectArt('${id}')`, label: PROJECTS[id].name});
}

// ---- render 1x with headless Chrome ----
for (const sub of ['pets', 'pets_static', 'items', 'tiles', 'projects']) for (const res of ['1x', 'svg']) fs.mkdirSync(path.join(OUT, sub, res), {recursive: true});
const vecDir = path.join(WORK, 'tmp_vector');
fs.mkdirSync(vecDir, {recursive: true});

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'szu-promo-sprites-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-extensions', '--mute-audio'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1100, height: 1100, deviceScaleFactor: 1});
  await page.setContent('<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body></body></html>');
  const render = async (svgText, w, h, file) => {
    await page.evaluate(html => { document.body.innerHTML = html; }, svgText);
    await page.screenshot({path: file, clip: {x: 0, y: 0, width: w, height: h}, omitBackground: true, type: 'png'});
  };
  for (const job of jobs) {
    const [w, h] = dims(job.viewBox);
    const svgFile = path.join(OUT, job.group, 'svg', `${job.name}.svg`);
    fs.writeFileSync(svgFile, job.svg + '\n');
    job.svg_file = path.relative(OUT, svgFile);
    const png = path.join(OUT, job.group, '1x', `${job.name}.png`);
    await render(job.svg, w, h, png);
    job.png_1x = path.relative(OUT, png);
    job.size_1x = [w, h];
    // Vector render at the HD integer scale, only to measure how far Chrome's
    // at-scale rasterisation differs from a nearest-neighbour upscale.
    const scale = Math.floor(1024 / Math.max(w, h));
    const scaled = job.svg.replace(/width="\d+" height="\d+"/, `width="${w * scale}" height="${h * scale}"`);
    await render(scaled, w * scale, h * scale, path.join(vecDir, `${job.name}.png`));
  }
} finally {
  await browser.close();
  fs.rmSync(profile, {recursive: true, force: true});
}

fs.writeFileSync(path.join(WORK, 'jobs.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  pet_meta: petMeta,
  pet_actions: PET_ACTIONS,
  skipped_symbols: SKIPPED_SYMBOLS,
  tile_levels: TILE_LEVELS,
  crops: CROPS,
  projects: Object.fromEntries(Object.entries(PROJECTS).map(([id, p]) => [id, {name: p.name, description: p.description}])),
  jobs: jobs.map(({svg, ...rest}) => ({...rest, fills: [...new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map(m => m[1].toUpperCase()))]})),
}, null, 1));
console.log(`rendered ${jobs.length} sprites`);
