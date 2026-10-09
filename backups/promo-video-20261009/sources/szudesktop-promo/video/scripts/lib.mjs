// Shared settings for the scripted renders (mirrors remotion.config.ts).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Full Chrome binary → must use --headless=new, which Remotion passes in this mode.
export const CHROME_MODE = 'chrome-for-testing';
export const CHROMIUM_OPTIONS = {gl: 'angle', headless: true};

/** Remotion's bundled ffmpeg / ffprobe (need their dylibs on DYLD_LIBRARY_PATH). */
export const COMPOSITOR_DIR = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');
export const FFMPEG = path.join(COMPOSITOR_DIR, 'ffmpeg');
export const FFPROBE = path.join(COMPOSITOR_DIR, 'ffprobe');
export const FF_ENV = {...process.env, DYLD_LIBRARY_PATH: COMPOSITOR_DIR};

export const probe = (file) =>
  JSON.parse(
    execFileSync(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-count_frames', '-of', 'json', file], {env: FF_ENV, encoding: 'utf8'}),
  );

/** True if the MP4's moov atom precedes mdat (i.e. +faststart). */
export const verifyFastStart = (file) => {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let off = 0;
    const head = Buffer.alloc(16);
    while (off < size) {
      fs.readSync(fd, head, 0, 16, off);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (len === 1) len = Number(head.readBigUInt64BE(8));
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len < 8) return false;
      off += len;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
};
