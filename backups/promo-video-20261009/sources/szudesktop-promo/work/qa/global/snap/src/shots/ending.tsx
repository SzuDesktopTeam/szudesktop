/**
 * 结尾 — S29–S30 / V13: app icon slams out of the warm campus, title, the three companions'
 * signature moves, closing line, download board, platform chips, disclaimer held to the end.
 * The last two beats are frozen (still frame), audio carries the final hit + coin ding tail.
 *
 * v2 (review): the falling crops never cross the title / download board (masked out of the
 * text band); the campus is calmed with a 50 % deep-wood wash; the closing line fades in whole
 * and stays readable; 9:16 is re-laid out so that every compliance line sits in y 1440–1560 and
 * x 60–900 (clear of the platform UI at the bottom / right), and V13 is 3.75 s.
 */
import React from 'react';
import {AbsoluteFill, Freeze, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Layer} from '../components/Camera';
import {ParticleBurst} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {PixelPanel, WoodSign} from '../components/PixelUI';
import {ImpactRing, WhiteFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {useSpriteSrc} from '../lib/assets';
import {ease, keyframes, springAt, tween} from '../lib/anim';
import {FONT_BODY, FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {ImgBubble, WarmBG} from './kit';
import {ShotComponent} from './registry';

const Chip: React.FC<{text: string; at: number; gold?: boolean; size?: number}> = ({text, at, gold, size = 40}) => {
  const f = useCurrentFrame();
  useFontsFor(text, [400]);
  if (f < at) return null;
  const s = springAt(f, at, {damping: 11, stiffness: 240});
  return (
    <div style={{transform: `scale(${s})`}}>
      <PixelPanel fill={gold ? C.green : C.paper} border={gold ? C.greenDeep : C.wood} unit={5} shadow={7} padding="10px 22px">
        <div style={{fontFamily: FONT_PIXEL, fontSize: size, color: gold ? C.gold : C.ink, whiteSpace: 'nowrap'}}>{text}</div>
      </PixelPanel>
    </div>
  );
};

/** Mask that hides particles inside a horizontal text band [y0, y1] (soft 40 px edges). */
const bandMask = (y0: number, y1: number) =>
  `linear-gradient(180deg, #000 0px, #000 ${y0 - 40}px, transparent ${y0}px, transparent ${y1}px, #000 ${y1 + 40}px, #000 100%)`;

/**
 * Timing (local frames): iconAt = logo slam, petsAt = companions + closing line,
 * moveAt = layout moves up + download board, greetAt = 荔宝 greet + bubble, freezeAt = still.
 */
export const EndCard: React.FC<{iconAt: number; petsAt: number; moveAt: number; greetAt: number; freezeAt: number; vertical?: boolean}> = ({iconAt, petsAt, moveAt, greetAt, freezeAt, vertical}) => {
  const cur = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const src = useSpriteSrc();
  const f = Math.min(cur, freezeAt);
  const icon = springAt(f, iconAt, {damping: 8, stiffness: 150, mass: 0.9});
  const mv = tween(f, moveAt, moveAt + 18, 0, 1, ease.inOut);
  const iconSize = vertical ? (1 - mv) * 400 + mv * 210 : (1 - mv) * 360 + mv * 190;
  const iconY = vertical ? (1 - mv) * 470 + mv * 205 : (1 - mv) * 255 + mv * 150;
  const titleY = vertical ? (1 - mv) * 720 + mv * 320 : (1 - mv) * 455 + mv * 268;
  const titleScale = 1 - mv * 0.33;
  const petsIn = springAt(f, petsAt, {damping: 13, stiffness: 160});
  const petBottom = vertical ? 1440 : 1010;
  const petScaleMul = vertical ? 1 : 1 - mv * 0.25;
  const pets = vertical
    ? [
        {sp: 'chestnut' as const, x: 230, s: 11},
        {sp: 'libao' as const, x: 540, s: 5},
        {sp: 'egret' as const, x: 850, s: 8},
      ]
    : [
        {sp: 'chestnut' as const, x: 650, s: 12},
        {sp: 'libao' as const, x: 960, s: 5},
        {sp: 'egret' as const, x: 1270, s: 8},
      ];
  const boardIn = springAt(f, moveAt + 6, {damping: 14, stiffness: 160});
  useFontsFor(COPY.disclaimer + COPY.demoNote, [500, 700]);
  // 9:16 (v3): the companions pop up over y ≈ 1200 at petsAt, so the closing line only fades in once
  // the layout has moved up (line settles at y ≈ 935, between the download board and the bubble)
  const closingIn = vertical ? tween(f, moveAt + 10, moveAt + 20, 0, 1, ease.out) : tween(f, petsAt, petsAt + 10, 0, 1, ease.out);
  const closingY = vertical ? (1 - mv) * 1200 + mv * 935 : 645;
  // text band the falling crops must not cross
  const band = vertical ? (mv > 0.5 ? [90, 1060] : [280, 1300]) : mv > 0.5 ? [240, 690] : [100, 700];
  return (
    <AbsoluteFill>
      <Camera zoom={tween(f, 0, freezeAt, 1.0, 1.06, ease.linear)}>
        <Layer depth={0.4}>
          <WarmBG sprite={vertical ? 'bg_campus_1080x1920' : 'bg_campus_1920x1080'} tint={0.5} blur={1.5} />
          <AbsoluteFill style={{background: `radial-gradient(circle at 50% ${vertical ? 22 : 32}%, ${alpha(C.gold, 0.3)} 0%, transparent ${vertical ? 40 : 45}%)`, opacity: tween(f, iconAt, iconAt + 20, 0, 1)}} />
        </Layer>
        <Layer depth={1.6}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <PixelSprite key={i} sprite={i % 2 ? 'flora_berrybush' : 'flora_tallgrass'} scale={13} x={i < 3 ? -40 + i * 90 : W - 140 - (i - 3) * 90} y={H + 16 + (i % 2) * 20} anchor="bottom-left" />
          ))}
        </Layer>
      </Camera>
      <AbsoluteFill style={{WebkitMaskImage: bandMask(band[0], band[1]), maskImage: bandMask(band[0], band[1])}}>
        <ParticleBurst sprites={['crop_lychee', 'crop_radish', 'crop_strawberry', 'crop_blueberry', 'icon_coin', 'icon_flower']} count={40} at={iconAt} mode="rain" origin={{x: 0, y: 0}} area={{x: 0, y: -300, w: W, h: 240}} seed="end-rain" speed={[5, 9]} gravity={0.02} drag={0.004} scale={[4, 6]} life={[400, 460]} stagger={4} fade={20} />
      </AbsoluteFill>
      {/* logo */}
      <div style={{position: 'absolute', left: W / 2, top: iconY, transform: `translate(-50%, -50%) scale(${icon}) rotate(${(1 - icon) * 30}deg)`}}>
        <Img src={src('app_icon_1024')} style={{width: iconSize, height: iconSize, filter: `drop-shadow(0 18px 30px ${alpha(C.woodDark, 0.6)})`}} />
      </div>
      <ImpactRing at={iconAt} x={W / 2} y={iconY} frames={20} maxR={1100} unit={16} />
      <ParticleBurst squares={[C.gold, C.paperHi, C.lychee]} count={36} at={iconAt} origin={{x: W / 2, y: iconY}} seed="logo-sp" speed={[10, 26]} angle={[-180, 180]} gravity={0.15} drag={0.05} scale={[8, 16]} life={[24, 40]} />
      {/* title */}
      <div style={{position: 'absolute', left: 0, right: 0, top: titleY, transform: `scale(${titleScale})`, transformOrigin: '50% 0', display: 'flex', justifyContent: 'center', alignItems: vertical ? 'center' : 'baseline', gap: vertical ? 0 : 30, flexDirection: vertical ? 'column' : 'row'}}>
        {vertical ? (
          <>
            <PixelTitle text="szuDesktop" size={144} start={iconAt + 6} stagger={2} mode="drop" frame={f} />
            <PixelTitle text="荔枝庭院" size={192} start={iconAt + 14} stagger={5} mode="drop" color={C.gold} frame={f} />
          </>
        ) : (
          <>
            <PixelTitle text="szuDesktop" size={144} start={iconAt + 6} stagger={2} mode="drop" frame={f} />
            <PixelTitle text="·" size={144} start={iconAt + 18} mode="pop" frame={f} />
            <PixelTitle text="荔枝庭院" size={144} start={iconAt + 20} stagger={5} mode="drop" color={C.gold} frame={f} />
          </>
        )}
      </div>
      {/* closing line: fades in whole (never typed out / cut mid-sentence) */}
      {(vertical || f < moveAt + 4) && closingIn > 0 ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: closingY, display: 'flex', justifyContent: 'center', opacity: closingIn * (vertical ? 1 : 1 - mv * 4)}}>
          {vertical ? (
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${(1 - closingIn) * 16}px)`}}>
              {/* split after the second comma so the line never breaks inside a word */}
              <BodyText text={COPY.closingLine.slice(0, COPY.closingLine.indexOf('，', COPY.closingLine.indexOf('，') + 1) + 1)} size={46} weight={900} color={C.paperHi} outline={C.lycheeDeep} align="center" />
              <BodyText text={COPY.closingLine.slice(COPY.closingLine.indexOf('，', COPY.closingLine.indexOf('，') + 1) + 1)} size={46} weight={900} color={C.paperHi} outline={C.lycheeDeep} align="center" />
            </div>
          ) : (
            <BodyText text={COPY.closingLine} size={48} weight={900} color={C.paperHi} outline={C.lycheeDeep} align="center" style={{transform: `translateY(${(1 - closingIn) * 16}px)`}} />
          )}
        </div>
      ) : null}
      {/* download board + chips (S30) */}
      {f >= moveAt ? (
        vertical ? (
          <div style={{position: 'absolute', left: 0, right: 0, top: 610, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, transform: `translateY(${(1 - boardIn) * 260}px)`, opacity: Math.min(1, boardIn * 2)}}>
            <WoodSign text="下载" size={64} icon="icon_satchel" />
            <WoodSign text={COPY.repo} size={40} />
            <div style={{display: 'flex', gap: 16, transform: 'scale(0.85)', transformOrigin: '50% 0'}}>
              <Chip text={COPY.platforms[0]} at={moveAt + 14} size={40} />
              <Chip text={COPY.platforms[1]} at={moveAt + 18} size={40} />
              <Chip text={COPY.openSourceShort} at={moveAt + 22} gold size={40} />
            </div>
          </div>
        ) : (
          <div style={{position: 'absolute', left: 0, right: 0, top: 430, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, transform: `translateY(${(1 - boardIn) * 260}px)`, opacity: Math.min(1, boardIn * 2)}}>
            <WoodSign text={COPY.download} size={60} icon="icon_satchel" />
            <div style={{display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center'}}>
              <Chip text={COPY.platforms[0]} at={moveAt + 14} size={40} />
              <Chip text={COPY.platforms[1]} at={moveAt + 18} size={40} />
              <Chip text={COPY.openSourceShort} at={moveAt + 22} gold size={40} />
            </div>
          </div>
        )
      ) : null}
      {/* companions */}
      {f >= petsAt
        ? pets.map((p, i) => {
            const isLibao = p.sp === 'libao';
            const clips = isLibao
              ? [
                  {action: 'signature' as const, at: petsAt + i * 6, step: 10},
                  {action: 'idle' as const, at: petsAt + 60, step: 'native' as const, loop: true},
                  {action: 'greet' as const, at: greetAt, step: 9},
                ]
              : [
                  {action: 'signature' as const, at: petsAt + i * 6, step: 10},
                  {action: 'idle' as const, at: petsAt + 70, step: 'native' as const, loop: true},
                ];
            return (
              <div key={p.sp} style={{position: 'absolute', left: p.x, top: petBottom + (1 - petsIn) * 500, transform: `scale(${petScaleMul})`, transformOrigin: '0 0'}}>
                <PetSprite species={p.sp} frame={f} scale={p.s} x={0} y={0} anchor="bottom" flipX={p.sp === 'egret'} clips={clips} shadow={8} groundShadow />
              </div>
            );
          })
        : null}
      <ImgBubble id="outro" x={vertical ? 560 : 1150} y={vertical ? 1172 : 815} at={greetAt + 14} scale={vertical ? 0.8 : 0.8} />
      {/* disclaimer, held to the last frame (9:16: in the y 1440–1560 safe band, under the companions' feet) */}
      {vertical ? (
        <div style={{position: 'absolute', left: 60, width: 840, top: 1452, padding: '12px 0 14px', background: alpha(C.woodDark, 0.8), borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: `3px solid ${C.wood}`}}>
          <span style={{fontFamily: FONT_BODY, fontWeight: 700, fontSize: 34, color: C.paper}}>{COPY.disclaimer}</span>
          <span style={{fontFamily: FONT_BODY, fontWeight: 500, fontSize: 24, color: alpha(C.paper, 0.78)}}>{COPY.demoNote}</span>
        </div>
      ) : (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, background: alpha(C.woodDark, 0.82), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, borderTop: `3px solid ${C.wood}`}}>
          <span style={{fontFamily: FONT_BODY, fontWeight: 700, fontSize: 30, color: C.paper}}>{COPY.disclaimer}</span>
          <span style={{fontFamily: FONT_BODY, fontWeight: 500, fontSize: 20, color: alpha(C.paper, 0.7)}}>{COPY.demoNote}</span>
        </div>
      )}
      <WhiteFlash at={iconAt} frames={2} fadeFrames={5} />
    </AbsoluteFill>
  );
};

export const EndingShots: ShotComponent = () => {
  const f = useCurrentFrame();
  // S29 starts at bar 29 (local 0); bar 30 = local 113; S30 = local 225; bar 32 beat 1 = local 338.
  const content = <EndCard iconAt={0} petsAt={113} moveAt={225} greetAt={338} freezeAt={394} />;
  return f >= 394 ? <Freeze frame={394}>{content}</Freeze> : content;
};

export const _e = {keyframes};
