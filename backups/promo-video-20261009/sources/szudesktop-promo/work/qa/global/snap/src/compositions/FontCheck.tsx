/**
 * Still for verifying fonts: every COPY string in Fusion Pixel (24 px = 2× grid, and a large
 * 96 px sample) and in Noto Sans SC 500/700. Render with `npm run stills` and inspect: no
 * tofu, no system-font fallback (Fusion Pixel glyphs are visibly blocky; Noto is smooth).
 */
import React, {useEffect, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender} from 'remotion';
import {BodyText} from '../components/BodyText';
import {PixelTitle} from '../components/PixelTitle';
import {allCopyStrings} from '../copy';
import {BODY_FAMILY, FONT_BODY, FONT_PIXEL, PIXEL_FAMILY, pixelMissing, useFontsFor} from '../theme/fonts';
import {C} from '../theme/palette';

export const FontCheck: React.FC = () => {
  const lines = allCopyStrings();
  const all = lines.join('');
  useFontsFor(all, [500, 700]);
  useFontsFor('已加载字面：段片中个不同字符未覆盖（回退）无0123456789 ·', [700]);
  const uniq = Array.from(new Set(Array.from(all))).filter((c) => c.trim());
  const missing = pixelMissing(all);
  // Report after the loads settle (check() is only meaningful once faces are loaded).
  const [report, setReport] = useState<string | null>(null);
  const [handle] = useState(() => delayRender('font check report'));
  useEffect(() => {
    const t = uniq.join('');
    Promise.all([
      document.fonts.load(`24px "${PIXEL_FAMILY}"`, t),
      document.fonts.load(`500 24px "${BODY_FAMILY}"`, t),
      document.fonts.load(`700 24px "${BODY_FAMILY}"`, t),
    ]).then(() => {
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded');
      const px = loaded.filter((f) => f.family.replace(/"/g, '') === PIXEL_FAMILY).length;
      const body = loaded.filter((f) => f.family.replace(/['"]/g, '') === BODY_FAMILY).length;
      setReport(`已加载字面：Fusion Pixel ${px} 段 · Noto Sans SC ${body} 段 · 片中 ${uniq.length} 个不同字符 · Fusion Pixel 未覆盖（回退 Noto）：${missing.length ? missing.join(' ') : '无'}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (report) continueRender(handle);
  }, [report, handle]);
  return (
    <AbsoluteFill style={{background: C.paper, padding: 40, color: C.ink}}>
      <PixelTitle text="szuDesktop · 荔枝庭院 字体检查" size={72} mode="none" align="left" />
      <div style={{fontFamily: FONT_BODY, fontWeight: 700, fontSize: 20, margin: '10px 0 16px'}}>
        {report}
      </div>
      <div style={{display: 'flex', gap: 40}}>
        <div style={{flex: 1, fontFamily: FONT_PIXEL, fontSize: 24, lineHeight: 1.25}}>
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div style={{flex: 1, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 20, lineHeight: 1.3}}>
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Close-up still: a 192 px pixel title to inspect edge crispness at 1:1. */
export const PixelCloseUp: React.FC = () => (
  <AbsoluteFill style={{background: C.green, alignItems: 'center', justifyContent: 'center', gap: 40}}>
    <PixelTitle text="荔宝丰收礼！2048" size={192} color={C.gold} mode="none" />
    <PixelTitle text="把深大的一小片校园" size={96} mode="none" />
    <BodyText text="把深大的一小片校园，搬到你的桌面。" size={52} color={C.paper} />
  </AbsoluteFill>
);
