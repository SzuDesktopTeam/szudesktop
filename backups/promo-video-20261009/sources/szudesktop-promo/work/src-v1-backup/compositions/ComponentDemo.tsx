/**
 * 5-second component demo (1920×1080, 60 fps, 300 frames ≈ 10⅔ beats at 128 BPM).
 * Exercises every reusable component with genuine app art from public/demo/sprites:
 *   A  0–56    MosaicImage campus 96→32→8 px, giant pixel lychee drop with ghost trail, WhiteFlash
 *   B  56–169  Camera + parallax Layers, PetSprite (celebrate→signature), ParticleBurst, PixelDust,
 *              ImpactRing, screen shake, PixelTitle drop-in, BodyText typewriter, WhipPan out
 *   C  169–239 WhipPan in, DesktopScene + taskbar, WindowFrame (win + mac) on Card3D tilt,
 *              desktop pet + SpeechBubble, PixelCursor, NativeMenu (pet menu), hearts, CornerTag
 *   D  239–267 BlockDissolve in, "断网了？" PixelTitle slam + jitter, Glitch, Scanlines
 *   E  267–300 MosaicCut (Pixelate) into 2048 "荔宝丰收礼" slam, confetti, ZoomPunch,
 *              attract coins into a Counter, WoodBadge, disclaimer
 */
import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {BodyText} from '../components/BodyText';
import {SpeechBubble} from '../components/Bubble';
import {Camera, Card3D, Layer} from '../components/Camera';
import {DesktopScene, WindowFrame} from '../components/Desktop';
import {NativeMenu, petMenuItems} from '../components/NativeMenu';
import {ParticleBurst, PixelDust, attractArrival} from '../components/ParticleBurst';
import {PixelCursor} from '../components/PixelCursor';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag, Counter, WoodBadge} from '../components/PixelUI';
import {Backdrop} from '../components/Shot';
import {BlockDissolve, Glitch, ImpactRing, MosaicCut, MosaicImage, Scanlines, Veil, WhiteFlash, WhipPan, ZoomPunch} from '../components/Transitions';
import {COPY} from '../copy';
import {DEMO_SPRITE_ROOT, PARTICLES, SpriteRoot} from '../lib/assets';
import {ease, hit, keyframes, shake, springAt, tween} from '../lib/anim';
import {BEAT, EIGHTH, beatFrame} from '../lib/beat';
import {C, alpha} from '../theme/palette';

export const DEMO_FRAMES = 300;

export const ComponentDemo: React.FC = () => (
  <SpriteRoot.Provider value={DEMO_SPRITE_ROOT}>
    <AbsoluteFill style={{background: C.ink}}>
      <Sequence from={0} durationInFrames={57} name="A mosaic + drop">
        <PartA />
      </Sequence>
      <Sequence from={56} durationInFrames={120} name="B hero">
        <PartB />
      </Sequence>
      <Sequence from={169} durationInFrames={100} name="C desktop">
        <PartC />
      </Sequence>
      <Sequence from={239} durationInFrames={61} name="D/E glitch → 2048">
        <BlockDissolve at={0} steps={3} step={7} block={160} seed="demo">
          <MosaicCut at={28} step={3} sizes={[9, 17, 33]} from={<PartD />} to={<PartE at={28} />} />
        </BlockDissolve>
      </Sequence>
    </AbsoluteFill>
  </SpriteRoot.Provider>
);

/* ---------- A: mosaic campus + lychee drop ---------- */
const PartA: React.FC = () => {
  const f = useCurrentFrame();
  const block = f < beatFrame(1) ? 96 : f < beatFrame(1.5) ? 32 : 8;
  const land = 56;
  const y = (t: number) => tween(t, 36, land, -40, 600, ease.in);
  const scale = 24; // 16×16 brand lychee → 384 px
  return (
    <AbsoluteFill>
      <MosaicImage sprite="bg_campus" block={block} zoom={tween(f, 0, 56, 1, 1.04, ease.linear)} />
      {[3, 2, 1].map((g) =>
        f - g * 1.5 >= 36 ? (
          <PixelSprite key={g} sprite="brand_lychee" scale={scale} x={960} y={y(f - g * 1.5)} anchor="bottom" opacity={0.18 * (4 - g)} />
        ) : null,
      )}
      {f >= 36 ? <PixelSprite sprite="brand_lychee" scale={scale} x={960} y={y(f)} anchor="bottom" shadow={12} /> : null}
      <WhiteFlash at={land - 1} frames={2} />
    </AbsoluteFill>
  );
};

/* ---------- B: hero ---------- */
const PartB: React.FC = () => {
  const f = useCurrentFrame();
  const zoom = keyframes(f, [
    [0, 1],
    [85, 1.08, ease.out],
    [113, 1.0, ease.inOut],
  ]);
  const sh = shake(f, 0, 8, 14, 3);
  const cheX = tween(f, 57, 72, -500, 470, ease.outBack);
  const egX = tween(f, 85, 100, 2400, 1450, ease.outBack);
  return (
    <WhipPan at={106} frames={7} mode="out" direction="left">
      <Camera zoom={zoom} rotate={tween(f, 0, 100, 0, -1.5)} shake={sh}>
        <Layer depth={0.35}>
          <Backdrop sprite="bg_campus" zoom={1.06} />
          <Veil from={0} to={1} max={0.18} color={C.woodDark} />
        </Layer>
        <Layer depth={1}>
          {/* 荔宝 ×12 — celebrate retimed to 8th notes, then signature */}
          <PetSprite
            species="libao"
            frame={f}
            clips={[
              {action: 'celebrate', at: 0, step: EIGHTH / 2},
              {action: 'signature', at: 57, step: 8, loop: true},
            ]}
            scale={12}
            x={960}
            y={1040}
            anchor="bottom"
            groundShadow
          />
          {f >= 57 ? <PetSprite species="chestnut" frame={f} clips={[{action: 'walk', at: 57, step: 4, loop: true}, {action: 'idle', at: 72}]} scale={16} x={cheX} y={1040} anchor="bottom" groundShadow /> : null}
          {f >= 85 ? <PetSprite species="egret" frame={f} clips={[{action: 'walk', at: 85, step: 4, loop: true}, {action: 'idle', at: 100}]} scale={10} x={egX} y={1040} anchor="bottom" flipX groundShadow /> : null}
          <PixelDust at={72} origin={{x: 470, y: 1030}} seed="d1" />
          <PixelDust at={100} origin={{x: 1450, y: 1030}} seed="d2" />
        </Layer>
        <Layer depth={1.8}>
          <ParticleBurst sprites={PARTICLES.harvest} count={40} at={0} origin={{x: 960, y: 700}} seed="hero" angle={[-170, -10]} speed={[16, 34]} scale={[4, 7]} life={[60, 110]} shadow={4} />
          <PixelSprite sprite="flora_tallgrass" scale={18} x={tween(f, 0, 110, -40, 60)} y={1100} anchor="bottom-left" />
          <PixelSprite sprite="flora_berrybush" scale={20} x={tween(f, 0, 110, 1980, 1880)} y={1110} anchor="bottom-right" />
        </Layer>
        <ImpactRing at={0} x={960} y={760} />
      </Camera>
      {/* Titles are HUD (not inside a Layer) so they stay crisp at integer positions. */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 70}}>
        <PixelTitle text={COPY.title} size={120} start={4} stagger={4} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', justifyContent: 'center'}}>
        <BodyText text={COPY.tagline} size={52} typeAt={62} typeStep={3} caret plate="ink" />
      </div>
      <WhiteFlash at={0} frames={1} fadeFrames={5} />
    </WhipPan>
  );
};

/* ---------- C: desktop ---------- */
const PartC: React.FC = () => {
  const f = useCurrentFrame();
  const win = springAt(f, 0, {damping: 14, stiffness: 140});
  const macIn = springAt(f, 6, {damping: 14, stiffness: 140});
  const petHop = springAt(f, 14, {damping: 9, stiffness: 260});
  const menuAt = Math.round(BEAT * 1.5); // beat 7.5 globally
  const patAt = menuAt + 21;
  const tilt = {x: tween(f, 0, 70, 6, 2), y: tween(f, 0, 70, -8, -3)};
  // Pet sits on the main window's top edge (window spans x 620..1700, y 340..940 in desktop space).
  const petX = 1380;
  const restY = 340;
  const petY = restY - (1 - petHop) * 260;
  return (
    <WhipPan at={0} frames={7} mode="in" direction="left">
      {/* Desktop as a tilted monitor: bezel + wood backdrop make the revealed edges intentional. */}
      <Camera zoom={tween(f, 0, 70, 0.9, 0.96)} tiltX={tilt.x} tiltY={tilt.y} perspective={2400} background={`radial-gradient(circle at 50% 40%, ${C.wood} 0%, ${C.woodDark} 75%)`}>
        <Layer depth={1}>
          <DesktopScene bezel={28}>
            <Card3D x={420} y={560} width={640} height={420} rotateY={(1 - macIn) * -30} z={-60} scale={0.6 + 0.4 * macIn} border={0} radius={12} glare={false} shadow={0.6}>
              <WindowFrame variant="mac" width={640} height={420} shadow={false}>
                <Backdrop sprite="bg_campus" />
              </WindowFrame>
            </Card3D>
            <Card3D x={1160} y={640} width={1080} height={600} rotateY={(1 - win) * -18} scale={0.88 + 0.12 * win} border={0} radius={8} shadow={1.2}>
              <WindowFrame variant="win" width={1080} height={600} shadow={false}>
                <Backdrop sprite="bg_courtyard" zoom={1.02} />
                <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(C.paper, 0.0)} 60%, ${alpha(C.paper, 0.6)} 100%)`}} />
              </WindowFrame>
            </Card3D>
          </DesktopScene>
        </Layer>
        <Layer depth={1.4}>
          {f >= 14 ? (
            <PetSprite
              species="libao"
              frame={f}
              clips={[
                {action: 'greet', at: 14, step: 5},
                {action: 'idle', at: 50, step: 'native', loop: true},
                {action: 'pat', at: patAt, step: 5},
              ]}
              scale={3}
              x={petX}
              y={petY}
              anchor="bottom"
              style={{filter: 'drop-shadow(0 18px 18px rgba(40, 20, 10, .25))'}}
            />
          ) : null}
          <SpeechBubble text={COPY.bubbles.greet} x={petX - 10} y={petY - 160} at={28} outAt={menuAt - 6} scale={2.4} tail={0.62} />
          <ParticleBurst sprites={PARTICLES.hearts} count={6} at={patAt} origin={{x: petX, y: petY - 150}} seed="hearts" mode="fountain" speed={[9, 15]} angle={[-120, -60]} gravity={0.25} scale={[3, 4]} life={[30, 40]} />
          <NativeMenu items={petMenuItems({name: '荔宝', lv: 3, hunger: 80, mood: 85, energy: 85, food: 3, scalePct: 100})} x={petX + 40} y={restY - 120} at={menuAt} closeAt={patAt} highlight={f >= menuAt + 10 ? 4 : undefined} scale={1.6} />
          <PixelCursor
            scale={4}
            inAt={20}
            path={[
              [20, 1900, 980],
              [menuAt - 2, petX + 10, restY - 70],
              // 摸摸头 row centre: menu top + 1.6 × (4 pad + 24 + 24 + 8.5 sep + 24 + 12)
              [menuAt + 10, petX + 150, restY - 120 + 1.6 * 96.5],
              [patAt + 12, petX + 150, restY - 120 + 1.6 * 96.5],
            ]}
            clicks={[menuAt - 1, patAt - 1]}
          />
        </Layer>
      </Camera>
      <CornerTag text={COPY.sections[0]} at={4} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 110}}>
        <PixelTitle text={COPY.petHeadline} size={96} start={10} stagger={3} mode="pop" />
      </div>
    </WhipPan>
  );
};

/* ---------- D: glitch ---------- */
const PartD: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Glitch at={5} frames={16} split={6} slices={5} blackFrames={[6, 7]} seed="demo">
        <AbsoluteFill>
          <Backdrop sprite="bg_campus" darken={0.62} zoom={tween(f, 0, 30, 1.0, 1.1)} />
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 60}}>
            <PixelSprite sprite="icon_disconnect" scale={16} shadow={10} />
            <PixelTitle text={COPY.netOffline} size={168} color={C.error} outline={C.paperHi} mode="slam" start={4} stagger={3} jitter={3} jitterHold={3} />
          </AbsoluteFill>
        </AbsoluteFill>
      </Glitch>
      <Scanlines opacity={0.12} />
    </AbsoluteFill>
  );
};

/* ---------- E: 2048 climax ---------- */
const PartE: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const t = at + 3; // tile slam
  const coinCfg = {at: t + 2, stagger: 0.7, flight: 16, seed: 'coins'} as const;
  const arrived = Array.from({length: 24}).filter((_, i) => f >= attractArrival(i, coinCfg)).length;
  const bumps = Array.from({length: 24}).map((_, i) => attractArrival(i, coinCfg));
  const s = tween(f, t, t + 5, 3.2, 1, ease.outQuint) - hit(f, t + 5, 6) * 0.06;
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 46%, ${C.woodLight} 0%, ${C.wood} 38%, ${C.woodDark} 100%)`}}>
      <ZoomPunch at={t + 5} amp={0.06} frames={10}>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          {f >= t ? (
            <div style={{transform: `scale(${s}) translateY(-90px)`}}>
              <PixelSprite sprite="tile_2048" scale={11} shadow={14} />
            </div>
          ) : null}
        </AbsoluteFill>
        <ImpactRing at={t + 5} x={960} y={450} maxR={900} />
        <ParticleBurst sprites={PARTICLES.confetti} count={56} at={t + 5} origin={{x: 960, y: 450}} angle={[-180, 180]} speed={[18, 40]} gravity={0.7} scale={[4, 7]} life={[40, 70]} seed="conf" shadow={3} />
        <ParticleBurst sprites={PARTICLES.coins} count={24} mode="attract" target={{x: 1700, y: 90}} origin={{x: 960, y: 450}} scale={[4, 5]} {...coinCfg} flip />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 150}}>
          <PixelTitle text={COPY.arcadeClimax} size={144} color={C.gold} start={t + 6} stagger={2} mode="slam" />
        </div>
      </ZoomPunch>
      <div style={{position: 'absolute', right: 70, top: 46}}>
        <Counter value={40 + arrived} bumpAt={bumps} size={54} />
      </div>
      <div style={{position: 'absolute', left: 70, top: 46}}>
        <WoodBadge text={COPY.openSource} icon="icon_book" at={t + 8} size={48} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', justifyContent: 'center'}}>
        <BodyText text={COPY.disclaimer} size={30} weight={500} color={C.paper} inAt={t + 4} plate="ink" />
      </div>
    </AbsoluteFill>
  );
};
