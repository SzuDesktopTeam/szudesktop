// Scripted render with the exact delivery settings, then verification with the bundled ffprobe.
//
//   node scripts/render.mjs --comp Main16x9 --out ../out/szudesktop-promo-16x9.mp4 \
//        [--props '{"music":"assets/audio/music_16x9.wav"}'] [--frames 0-599] [--crf 14] \
//        [--maxrate 16M --bufsize 32M] [--concurrency 8] [--scale 1]
//
// H.264 High, yuv420p, x264 preset slow + tune animation, CRF (default 14) capped by maxrate,
// AAC 256k 48 kHz, +faststart. PNG intermediate frames keep pixel art sharp until x264.
import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {CHROME, CHROMIUM_OPTIONS, CHROME_MODE, ROOT, probe, verifyFastStart} from './lib.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const comp = arg('comp', 'ComponentDemo');
const out = path.resolve(ROOT, arg('out', `../work/remotion-check/${comp}.mp4`));
const inputProps = JSON.parse(arg('props', '{}'));
const frames = arg('frames');
const crf = Number(arg('crf', '14'));
// 16:9 is 60 s: 14 Mbit/s cap keeps it ≤ ~107 MB (16M would land right at ~122 MB). 9:16 is 30 s.
const maxrate = arg('maxrate', comp.includes('9x16') ? '18M' : '14M');
const bufsize = arg('bufsize', `${parseInt(maxrate, 10) * 2}M`);
const concurrency = Number(arg('concurrency', '8'));
const scale = Number(arg('scale', '1'));

fs.mkdirSync(path.dirname(out), {recursive: true});
const t0 = Date.now();
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const composition = await selectComposition({serveUrl, id: comp, inputProps, browserExecutable: CHROME, chromeMode: CHROME_MODE, chromiumOptions: CHROMIUM_OPTIONS});
console.log(`[render] ${comp} ${composition.width}x${composition.height} @${composition.fps} × ${composition.durationInFrames} frames → ${out}`);

let lastPct = -1;
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  outputLocation: out,
  codec: 'h264',
  pixelFormat: 'yuv420p',
  imageFormat: 'png',
  crf,
  x264Preset: 'slow',
  encodingMaxRate: maxrate,
  encodingBufferSize: bufsize,
  audioCodec: 'aac',
  audioBitrate: '256k',
  sampleRate: 48000,
  enforceAudioTrack: true,
  colorSpace: 'bt709',
  scale,
  concurrency,
  frameRange: frames ? frames.split('-').map(Number) : null,
  browserExecutable: CHROME,
  chromeMode: CHROME_MODE,
  chromiumOptions: CHROMIUM_OPTIONS,
  overwrite: true,
  timeoutInMilliseconds: 120000,
  // x264 -tune animation (flat colours, hard edges) — inserted right before the output path.
  ffmpegOverride: ({type, args}) => {
    if (type !== 'stitcher' && type !== 'pre-stitcher') return args;
    const iCodec = args.indexOf('libx264');
    if (iCodec < 0) return args;
    const copy = [...args];
    copy.splice(iCodec + 1, 0, '-tune', 'animation');
    return copy;
  },
  onProgress: ({progress, renderedFrames, encodedFrames}) => {
    const pct = Math.floor(progress * 20) * 5;
    if (pct !== lastPct) {
      lastPct = pct;
      console.log(`[render] ${pct}% (rendered ${renderedFrames}, encoded ${encodedFrames})`);
    }
  },
});
console.log(`[render] done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const info = probe(out);
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
const mb = fs.statSync(out).size / 1e6;
console.log(
  `[verify] video ${v.codec_name} ${v.profile} ${v.pix_fmt} ${v.width}x${v.height} ${v.r_frame_rate} frames=${v.nb_frames} | audio ${a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch` : 'none'} | ${Number(info.format.duration).toFixed(3)} s | ${mb.toFixed(1)} MB | ${(Number(info.format.bit_rate) / 1e6).toFixed(2)} Mbps | faststart=${verifyFastStart(out)}`,
);
if (mb > 120) console.warn('[verify] WARNING: file exceeds 120 MB');
