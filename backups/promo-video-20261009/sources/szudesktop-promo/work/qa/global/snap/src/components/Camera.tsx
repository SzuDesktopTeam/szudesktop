import React, {createContext, useContext} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {C, alpha, cardShadow} from '../theme/palette';

/**
 * Virtual camera. <Camera> holds the camera state (zoom / pan / roll / tilt / shake);
 * <Layer depth> children apply it with parallax: depth 1 = mid-ground (UI cards),
 * < 1 = background (moves less), > 1 = foreground (moves more). Children that are not
 * wrapped in a <Layer> stay fixed (HUD, captions, corner tags).
 *
 *   <Camera zoom={tween(f,0,90,1,1.08)} x={…} rotate={-1.5} shake={shake(f, hitAt, 6, 14)}>
 *     <Layer depth={0.3}><Background/></Layer>
 *     <Layer depth={1}><Card3D …/></Layer>
 *     <Layer depth={1.8}><ParticleBurst …/></Layer>
 *   </Camera>
 */
export type CameraState = {zoom: number; x: number; y: number; ox: number; oy: number};
const CameraCtx = createContext<CameraState>({zoom: 1, x: 0, y: 0, ox: 960, oy: 540});
export const useCamera = () => useContext(CameraCtx);

export type CameraProps = {
  zoom?: number;
  /** Pan in px at depth 1 (positive x moves the view to the right). */
  x?: number;
  y?: number;
  /** Roll in degrees. */
  rotate?: number;
  /** 3D tilt of the whole stage (deg) — perspective is applied on the camera. */
  tiltX?: number;
  tiltY?: number;
  perspective?: number;
  /** Output of anim.shake(). */
  shake?: {x: number; y: number; rot?: number};
  /** Zoom origin in stage px (default: frame centre). */
  origin?: {x: number; y: number};
  background?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const Camera: React.FC<CameraProps> = ({
  zoom = 1,
  x = 0,
  y = 0,
  rotate = 0,
  tiltX = 0,
  tiltY = 0,
  perspective = 2200,
  shake,
  origin,
  background,
  children,
  style,
}) => {
  const {width, height} = useVideoConfig();
  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height / 2;
  const sx = shake?.x ?? 0;
  const sy = shake?.y ?? 0;
  const sr = shake?.rot ?? 0;
  return (
    <AbsoluteFill style={{overflow: 'hidden', background, perspective, perspectiveOrigin: `${ox}px ${oy}px`, ...style}}>
      <AbsoluteFill
        style={{
          transform: `translate(${sx}px, ${sy}px) rotate(${rotate + sr}deg) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
          transformOrigin: `${ox}px ${oy}px`,
          transformStyle: tiltX || tiltY ? 'preserve-3d' : undefined,
        }}
      >
        <CameraCtx.Provider value={{zoom, x, y, ox, oy}}>{children}</CameraCtx.Provider>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Camera pan that centres stage point `p` at zoom `z` (for a depth-1 layer). */
export const focusOn = (p: {x: number; y: number}, z: number, size = {width: 1920, height: 1080}) => ({
  zoom: z,
  x: z * (p.x - size.width / 2),
  y: z * (p.y - size.height / 2),
});

export const Layer: React.FC<{depth?: number; z?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({depth = 1, z = 0, children, style}) => {
  const cam = useCamera();
  const s = 1 + (cam.zoom - 1) * depth;
  const tx = -cam.x * depth;
  const ty = -cam.y * depth;
  return (
    <AbsoluteFill
      style={{
        transform: `translate3d(${tx}px, ${ty}px, ${z}px) scale(${s})`,
        transformOrigin: `${cam.ox}px ${cam.oy}px`,
        transformStyle: z ? 'preserve-3d' : undefined,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export type Card3DProps = {
  /** Centre position in stage px. */
  x?: number;
  y?: number;
  width: number;
  height: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  /** translateZ in px (towards the viewer). */
  z?: number;
  scale?: number;
  perspective?: number;
  /** Paper border width (px); 0 for none. */
  border?: number;
  borderColor?: string;
  radius?: number;
  shadow?: number;
  /** Moving specular sheen that follows rotateY (sells the 3D tilt). */
  glare?: boolean;
  opacity?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/** A UI screenshot / clip mounted on a 3D card: paper edge, soft shadow, sheen. */
export const Card3D: React.FC<Card3DProps> = ({
  x = 960,
  y = 540,
  width,
  height,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  z = 0,
  scale = 1,
  perspective = 1800,
  border = 6,
  borderColor = C.paperHi,
  radius = 14,
  shadow = 1,
  glare = true,
  opacity = 1,
  children,
  style,
}) => {
  const sheenX = 50 - rotateY * 4;
  return (
    <div style={{position: 'absolute', left: x - width / 2, top: y - height / 2, width, height, perspective, opacity}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateZ(${z}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
          transformStyle: 'preserve-3d',
          borderRadius: radius,
          background: borderColor,
          padding: border,
          boxSizing: 'border-box',
          boxShadow: shadow ? cardShadow(shadow) : undefined,
          ...style,
        }}
      >
        <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: Math.max(0, radius - border)}}>
          {children}
          {glare ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: `linear-gradient(115deg, transparent ${sheenX - 22}%, ${alpha(C.paperHi, 0.16)} ${sheenX - 6}%, ${alpha(C.paperHi, 0.04)} ${sheenX + 8}%, transparent ${sheenX + 24}%)`,
                mixBlendMode: 'screen',
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
