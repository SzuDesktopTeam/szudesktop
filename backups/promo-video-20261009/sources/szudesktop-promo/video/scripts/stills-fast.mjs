// Fast inspection stills: one bundle, one browser, many frames; writes PNGs and a JPEG sheet.
//   node scripts/stills-fast.mjs --comp Main16x9 --frames 0,30,60 --out ../work/iter [--sheet name] [--scale 0.5]
import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {CHROME, CHROMIUM_OPTIONS, CHROME_MODE, ROOT} from './lib.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const comp = arg('comp', 'Main16x9');
const frames = arg('frames', '0').split(',').map(Number);
const outDir = path.resolve(ROOT, arg('out', '../work/iter'));
const scale = Number(arg('scale', '0.5'));
const props = JSON.parse(arg('props', '{}'));
fs.mkdirSync(outDir, {recursive: true});
const t0 = Date.now();
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const browser = await openBrowser('chrome', {browserExecutable: CHROME, chromeMode: CHROME_MODE, chromiumOptions: CHROMIUM_OPTIONS});
const composition = await selectComposition({serveUrl, id: comp, inputProps: props, puppeteerInstance: browser, chromeMode: CHROME_MODE});
const conc = Number(arg('concurrency', '4'));
const queue = [...frames];
const worker = async () => {
  while (queue.length) {
    const frame = queue.shift();
    const output = path.join(outDir, `${comp}-${String(frame).padStart(4, '0')}.png`);
    await renderStill({serveUrl, composition, frame, output, inputProps: props, imageFormat: 'png', scale, puppeteerInstance: browser, chromeMode: CHROME_MODE, overwrite: true, timeoutInMilliseconds: 120000});
    console.log(`[still] ${frame}`);
  }
};
await Promise.all(Array.from({length: conc}, worker));
await browser.close({silent: true});
console.log(`[stills] ${frames.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
