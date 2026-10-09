import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import {useSpriteSrc} from '../lib/assets';
import {FONT_BODY, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {PixelSprite} from './PixelSprite';

/**
 * A believable but OS-neutral computer desktop, composed in code (never a system screenshot):
 * wallpaper (campus.png by default), a generic bottom taskbar with a launcher glyph, pinned
 * app tiles, the szuDesktop icon (running), tray (szuDesktop tray icon + network + clock).
 * No Windows / Apple logos anywhere. Children are laid out in desktop pixel coordinates.
 */
export type DesktopSceneProps = {
  wallpaper?: string;
  /** Wallpaper softening in px (storyboard: "轻微柔化"). */
  blur?: number;
  /** Wallpaper zoom (slow push); origin centre. */
  wallpaperZoom?: number;
  time?: string;
  date?: string;
  taskbar?: boolean;
  /** Overall UI scale (1 = 1080p desktop; use 2 when composing at 3840×2160). */
  ui?: number;
  width?: number;
  height?: number;
  /**
   * Monitor bezel width in px drawn *outside* the screen area. Use it when the desktop is
   * tilted in 3D, so the revealed edges read as a physical screen instead of a hole.
   */
  bezel?: number;
  children?: React.ReactNode;
};

export const TASKBAR_H = 60;

export const DesktopScene: React.FC<DesktopSceneProps> = ({
  wallpaper = 'bg_campus',
  blur = 1.5,
  wallpaperZoom = 1,
  time = '09:30',
  date = '2026/10/12',
  taskbar = true,
  ui = 1,
  width = 1920,
  height = 1080,
  bezel = 0,
  children,
}) => {
  const src = useSpriteSrc();
  return (
    <>
      {bezel ? (
        <div
          style={{
            position: 'absolute',
            left: -bezel,
            top: -bezel,
            width: width + bezel * 2,
            height: height + bezel * 2,
            borderRadius: bezel * 0.7,
            background: 'linear-gradient(160deg, #2a251d 0%, #14110c 55%, #0d0b08 100%)',
            boxShadow: `0 ${bezel * 1.5}px ${bezel * 4}px rgba(20,12,6,.55), inset 0 0 0 ${Math.max(1, bezel / 14)}px rgba(255,255,255,.08)`,
          }}
        />
      ) : null}
    <div style={{position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden', background: C.ink}}>
      <Img
        src={src(wallpaper)}
        style={{
          position: 'absolute',
          inset: -blur * 4,
          width: `calc(100% + ${blur * 8}px)`,
          height: `calc(100% + ${blur * 8}px)`,
          objectFit: 'cover',
          filter: blur ? `blur(${blur}px) saturate(1.05)` : undefined,
          transform: `scale(${wallpaperZoom})`,
        }}
      />
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${alpha(C.woodDark, 0.28)} 100%)`}} />
      {children}
      {taskbar ? <Taskbar time={time} date={date} ui={ui} /> : null}
    </div>
    </>
  );
};

const Tile: React.FC<{ui: number; active?: boolean; children: React.ReactNode}> = ({ui, active, children}) => (
  <div
    style={{
      position: 'relative',
      width: 44 * ui,
      height: 44 * ui,
      borderRadius: 8 * ui,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? 'rgba(255,255,255,.14)' : 'transparent',
    }}
  >
    {children}
    {active ? <div style={{position: 'absolute', bottom: 2 * ui, left: '35%', right: '35%', height: 3 * ui, borderRadius: 2 * ui, background: C.gold}} /> : null}
  </div>
);

const Taskbar: React.FC<{time: string; date: string; ui: number}> = ({time, date, ui}) => {
  const src = useSpriteSrc();
  useFontsFor(time + date, [500]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: TASKBAR_H * ui,
        background: 'rgba(28, 25, 20, 0.80)',
        backdropFilter: `blur(${18 * ui}px)`,
        borderTop: `${ui}px solid rgba(255,255,255,.10)`,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${14 * ui}px`,
        gap: 6 * ui,
        fontFamily: FONT_BODY,
        color: C.paper,
      }}
    >
      {/* Generic launcher: 3×3 dot grid (not any OS logo). */}
      <Tile ui={ui}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 * ui}}>
          {Array.from({length: 9}).map((_, i) => (
            <div key={i} style={{width: 5 * ui, height: 5 * ui, borderRadius: 1 * ui, background: C.paper, opacity: 0.9}} />
          ))}
        </div>
      </Tile>
      {/* Generic folder tile. */}
      <Tile ui={ui}>
        <div style={{position: 'relative', width: 28 * ui, height: 22 * ui}}>
          <div style={{position: 'absolute', left: 0, top: 0, width: 12 * ui, height: 6 * ui, borderRadius: `${2 * ui}px ${2 * ui}px 0 0`, background: C.orange}} />
          <div style={{position: 'absolute', left: 0, top: 4 * ui, right: 0, bottom: 0, borderRadius: 3 * ui, background: C.gold}} />
        </div>
      </Tile>
      <Tile ui={ui} active>
        <Img src={src('app_icon_1024')} style={{width: 34 * ui, height: 34 * ui}} />
      </Tile>
      <div style={{flex: 1}} />
      <div style={{display: 'flex', alignItems: 'center', gap: 14 * ui, paddingRight: 6 * ui}}>
        <Img src={src('tray_icon')} style={{width: 20 * ui, height: 20 * ui, filter: 'invert(1) sepia(.2)', imageRendering: 'pixelated'}} />
        <PixelSprite sprite="icon_signal" scale={1.25 * ui} />
        <div style={{textAlign: 'right', lineHeight: 1.15}}>
          <div style={{fontSize: 15 * ui, fontWeight: 500}}>{time}</div>
          <div style={{fontSize: 12 * ui, fontWeight: 500, opacity: 0.75}}>{date}</div>
        </div>
      </div>
    </div>
  );
};

export type WindowVariant = 'win' | 'mac' | 'pixel';

/**
 * App window chrome around a screenshot / clip. 'win' = neutral caption bar with
 * minimise/maximise/close glyphs; 'mac' = traffic lights, centred title; 'pixel' = wooden
 * pixel frame for in-film UI cards. Content area = width × (height − title bar).
 */
export const WindowFrame: React.FC<{
  variant?: WindowVariant;
  title?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  ui?: number;
  shadow?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({variant = 'win', title = 'szuDesktop · 荔枝庭院', width, height, x = 0, y = 0, ui = 1, shadow = true, children, style}) => {
  const src = useSpriteSrc();
  useFontsFor(title, [500]);
  const barH = (variant === 'mac' ? 30 : 34) * ui;
  if (variant === 'pixel') {
    const u = 6 * ui;
    return (
      <div style={{position: 'absolute', left: x, top: y, width, height, ...style}}>
        <div style={{position: 'absolute', inset: 0, transform: `translate(${u * 1.5}px, ${u * 1.5}px)`, background: C.woodDark}} />
        <div style={{position: 'absolute', inset: 0, background: C.wood, boxShadow: `inset 0 0 0 ${u / 2}px ${C.woodDark}`}} />
        <div style={{position: 'absolute', inset: u * 1.5, overflow: 'hidden', background: C.paper, boxShadow: `0 0 0 ${u / 2}px ${C.woodLight}`}}>{children}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderRadius: (variant === 'mac' ? 12 : 8) * ui,
        overflow: 'hidden',
        background: C.paperHi,
        border: `${ui}px solid rgba(0,0,0,.18)`,
        boxShadow: shadow ? `0 ${24 * ui}px ${60 * ui}px rgba(20,12,6,.45), 0 ${4 * ui}px ${14 * ui}px rgba(20,12,6,.25)` : undefined,
        ...style,
      }}
    >
      <div
        style={{
          height: barH,
          display: 'flex',
          alignItems: 'center',
          background: variant === 'mac' ? '#ECE7DC' : C.paperHi,
          borderBottom: `${ui}px solid rgba(0,0,0,.08)`,
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize: 13 * ui,
          color: C.ink,
          position: 'relative',
        }}
      >
        {variant === 'mac' ? (
          <>
            <div style={{display: 'flex', gap: 8 * ui, paddingLeft: 12 * ui}}>
              {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                <div key={c} style={{width: 12 * ui, height: 12 * ui, borderRadius: '50%', background: c, boxShadow: `inset 0 0 0 ${0.5 * ui}px rgba(0,0,0,.18)`}} />
              ))}
            </div>
            <div style={{position: 'absolute', left: 0, right: 0, textAlign: 'center'}}>{title}</div>
          </>
        ) : (
          <>
            <Img src={src('app_icon_1024')} style={{width: 18 * ui, height: 18 * ui, marginLeft: 12 * ui, marginRight: 10 * ui}} />
            <div style={{flex: 1}}>{title}</div>
            <CaptionButtons ui={ui} h={barH} />
          </>
        )}
      </div>
      <div style={{position: 'relative', width: '100%', height: height - barH - 2 * ui, overflow: 'hidden', background: C.paper}}>{children}</div>
    </div>
  );
};

const CaptionButtons: React.FC<{ui: number; h: number}> = ({ui, h}) => {
  const line = (w: number, rot = 0): React.CSSProperties => ({position: 'absolute', left: '50%', top: '50%', width: w * ui, height: ui, background: C.ink, transform: `translate(-50%, -50%) rotate(${rot}deg)`});
  return (
    <div style={{display: 'flex', height: h}}>
      <div style={{position: 'relative', width: 46 * ui}}>
        <div style={line(10)} />
      </div>
      <div style={{position: 'relative', width: 46 * ui}}>
        <div style={{position: 'absolute', left: '50%', top: '50%', width: 9 * ui, height: 9 * ui, border: `${ui}px solid ${C.ink}`, transform: 'translate(-50%, -50%)'}} />
      </div>
      <div style={{position: 'relative', width: 46 * ui}}>
        <div style={line(13, 45)} />
        <div style={line(13, -45)} />
      </div>
    </div>
  );
};

/** Screenshot/clip filling its container (object-fit cover, top-left anchored by default). */
export const ScreenImage: React.FC<{src: string; fit?: 'cover' | 'contain'; position?: string; style?: React.CSSProperties}> = ({src, fit = 'cover', position = '50% 0%', style}) => (
  <Img src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition: position, ...style}} />
);
