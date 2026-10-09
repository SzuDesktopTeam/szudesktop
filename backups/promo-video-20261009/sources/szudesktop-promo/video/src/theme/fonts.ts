/**
 * Fonts (both OFL, no system fonts):
 *  - Titles: Fusion Pixel 12px Proportional (copied from the app repo, desktop/assets/fonts/,
 *    into public/fonts/fusion-pixel/). Every unicode-range segment is registered through the
 *    FontFace API and *all* of them are loaded before the first frame (≈1.1 MB), so a pixel
 *    title can never flash a fallback glyph.
 *  - Body: Noto Sans SC from @fontsource/noto-sans-sc (500 / 700 / 900). Fontsource splits it
 *    into ~100 lazy unicode-range slices per weight, so text components call useFontsFor()
 *    which delayRender()s until the slices covering their exact string are loaded.
 *
 * The fallback chain deliberately ends in the other OFL family, never PingFang / YaHei.
 */
import {useLayoutEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import '@fontsource/noto-sans-sc/500.css';
import '@fontsource/noto-sans-sc/700.css';
import '@fontsource/noto-sans-sc/900.css';
import {FUSION_PIXEL_FACES} from './fusion-pixel-faces';

export const PIXEL_FAMILY = 'Fusion Pixel 12px Proportional Simplified Chinese';
export const BODY_FAMILY = 'Noto Sans SC';

/** CSS font-family stacks. */
export const FONT_PIXEL = `"${PIXEL_FAMILY}", "${BODY_FAMILY}", sans-serif`;
export const FONT_BODY = `"${BODY_FAMILY}", "${PIXEL_FAMILY}", sans-serif`;

/** Fusion Pixel is drawn on a 12 px grid: keep title sizes on multiples of 12. */
export const PIXEL_SIZES = [24, 36, 48, 72, 96, 120, 144, 168, 192, 240, 288] as const;

let pixelFontPromise: Promise<void> | null = null;

/** Register + load every Fusion Pixel segment. Called once from src/index.ts. */
export const loadPixelFont = (): Promise<void> => {
  if (pixelFontPromise) return pixelFontPromise;
  const handle = delayRender('Loading Fusion Pixel (all unicode-range segments)', {timeoutInMilliseconds: 60000});
  pixelFontPromise = Promise.all(
    FUSION_PIXEL_FACES.map((f) => {
      const face = new FontFace(PIXEL_FAMILY, `url("${staticFile(`fonts/fusion-pixel/${f.file}`)}") format("woff2")`, {
        unicodeRange: f.unicodeRange,
        weight: '400',
        style: 'normal',
        display: 'block',
      });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => cancelRender(err));
  return pixelFontPromise;
};

/**
 * Block the current frame until the glyphs of `text` are loaded in the given weights of
 * both families. Cheap after the first call (document.fonts.load resolves immediately).
 */
export const useFontsFor = (text: string, weights: ReadonlyArray<number> = [700]) => {
  const key = `${weights.join(',')}|${text}`;
  const label = `fonts for "${text.slice(0, 24)}"`;
  const [initial] = useState(() => delayRender(label, {timeoutInMilliseconds: 60000}));
  const first = useRef(true);
  useLayoutEffect(() => {
    // The first run reuses the handle taken during render; later text changes take a new one.
    const handle = first.current ? initial : delayRender(label, {timeoutInMilliseconds: 60000});
    first.current = false;
    if (!text.trim()) {
      continueRender(handle);
      return;
    }
    const loads: Promise<unknown>[] = [pixelFontPromise ?? loadPixelFont()];
    for (const w of weights) loads.push(document.fonts.load(`${w} 48px "${BODY_FAMILY}"`, text));
    loads.push(document.fonts.load(`400 48px "${PIXEL_FAMILY}"`, text));
    Promise.all(loads)
      .then(() => continueRender(handle))
      .catch((err) => cancelRender(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
};

/** Code-point ranges covered by Fusion Pixel (from the unicode-range of every segment). */
const PIXEL_RANGES: Array<[number, number]> = FUSION_PIXEL_FACES.flatMap((f) =>
  f.unicodeRange.split(',').map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
    const lo = parseInt(a, 16);
    return [lo, b ? parseInt(b, 16) : lo] as [number, number];
  }),
);

/** Characters of `text` that Fusion Pixel does not cover (they would fall back to Noto Sans SC). */
export const pixelMissing = (text: string): string[] =>
  Array.from(new Set(Array.from(text))).filter((ch) => {
    if (!ch.trim()) return false;
    const cp = ch.codePointAt(0)!;
    return !PIXEL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
  });
