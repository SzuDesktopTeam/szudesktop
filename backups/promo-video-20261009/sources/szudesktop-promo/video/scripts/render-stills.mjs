// Render inspection stills (PNG, lossless) for font / sharpness checks.
//
//   node scripts/render-stills.mjs [--comp ComponentDemo --frames 30,90,150] [--out ../work/remotion-check/stills]
// Without --comp it renders the default set: FontCheck, PixelCloseUp and key demo frames.
import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {CHROME, CHROMIUM_OPTIONS, CHROME_MODE, ROOT} from './lib.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const outDir = path.resolve(ROOT, arg('out', '../work/remotion-check/stills'));
const jobs = arg('comp')
  ? arg('frames', '0').split(',').map((f) => ({comp: arg('comp'), frame: Number(f)}))
  : [
      {comp: 'FontCheck', frame: 0},
      {comp: 'PixelCloseUp', frame: 0},
      ...[20, 50, 100, 150, 200, 232, 255, 285, 299].map((frame) => ({comp: 'ComponentDemo', frame})),
      {comp: 'Main16x9', frame: 1700},
      {comp: 'Main9x16', frame: 900},
    ];
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
for (const {comp, frame} of jobs) {
  const composition = await selectComposition({serveUrl, id: comp, browserExecutable: CHROME, chromeMode: CHROME_MODE, chromiumOptions: CHROMIUM_OPTIONS});
  const output = path.join(outDir, `${comp}-${String(frame).padStart(4, '0')}.png`);
  await renderStill({serveUrl, composition, frame, output, imageFormat: 'png', browserExecutable: CHROME, chromeMode: CHROME_MODE, chromiumOptions: CHROMIUM_OPTIONS, overwrite: true, timeoutInMilliseconds: 120000});
  console.log(`[still] ${path.relative(path.dirname(ROOT), output)}`);
}
