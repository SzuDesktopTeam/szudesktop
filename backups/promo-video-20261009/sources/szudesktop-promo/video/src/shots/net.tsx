/**
 * 05 校园网 — S22–S25 (39.375–46.875 s): offline glitch, the real network diagnosis with a
 * beat-by-beat checklist, zone auto-detection + demo login, back online, then the college
 * notice picker and the official calendar. Every frame carries the demo-data footnote.
 */
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {BodyText} from '../components/BodyText';
import {Camera, Card3D, Layer} from '../components/Camera';
import {ParticleBurst, PixelDust} from '../components/ParticleBurst';
import {PetSprite, PixelSprite} from '../components/PixelSprite';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag, PixelPanel} from '../components/PixelUI';
import {Glitch, ImpactRing, Scanlines, SoftFlash} from '../components/Transitions';
import {COPY} from '../copy';
import {ease, jitter, keyframes, lerp, shake, springAt, tween} from '../lib/anim';
import {useShotClock} from '../lib/beat';
import {FONT_BODY, FONT_PIXEL, useFontsFor} from '../theme/fonts';
import {C, alpha} from '../theme/palette';
import {camAt} from './focus';
import {At, Footnote, PaperCard, PixelMark, Plate, Rect, SignalBars, UICrop, WarmBG, footage, retime} from './kit';
import {ShotComponent} from './registry';

export const NetBG: React.FC<{frame: number; dark?: number; vertical?: boolean}> = ({frame, dark = 0.6, vertical}) => (
  <>
    <WarmBG sprite={vertical ? 'bg_campus_1080x1920' : 'bg_campus_1920x1080'} blur={12} tint={dark} zoom={1.25 + frame * 0.0005} color={C.ink} />
    <Scanlines opacity={0.06} gap={6} />
  </>
);

export const NetFootnote: React.FC<{vertical?: boolean}> = ({vertical}) => (
  <At right={vertical ? undefined : 96} center={vertical} bottom={vertical ? 70 : 36}>
    <Footnote text={vertical ? COPY.vertical.netFootnote : COPY.netFootnote} size={vertical ? 30 : 26} />
  </At>
);

/** Height (CSS px) of the 当前连接 card down to the bottom of its two status cells — excludes the
 * static hint「外网能用，不代表…」which contradicts the offline beat. */
export const NET_CELLS_H = 170;

/* ------------------------------------------------------------------ S22 */
export const S22: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const offs = [at(1), at(1.25), at(1.5), at(1.75)];
  const lit = 4 - offs.filter((o) => f >= o).length;
  const micro = f % 2 === 0 ? 0 : 2;
  const z = tween(f, 0, at(4), 1.0, 1.1, ease.linear);
  const j = jitter(f, 2, 'off', 3);
  const content = (
    <AbsoluteFill>
      <Camera zoom={z}>
        <Layer depth={0.3}>
          <NetBG frame={f} dark={0.7} />
        </Layer>
        <Layer depth={0.7}>
          <div style={{position: 'absolute', left: 260, top: 330, transform: 'perspective(1600px) rotateX(18deg) rotateZ(-4deg)', opacity: 0.55}}>
            <Img src={footage('ui_net_offline.viewport.png')} style={{width: 1500, borderRadius: 10, filter: 'blur(4px)'}} />
          </div>
        </Layer>
        <Layer depth={1}>
          <Card3D x={1060 + micro} y={630} width={1194 * 1.2 + 12} height={NET_CELLS_H * 1.2 + 12} rotateX={-4} rotateY={-6}>
            <UICrop still="ui_net_offline.png" rect={{x: 0, y: 0, width: 1194, height: NET_CELLS_H}} k={1.2} full={{w: 1194, h: 227}} />
          </Card3D>
        </Layer>
      </Camera>
      {/* v3: the giant i-disconnect and the signal bars share one baseline (y 490), 30 px above the
          当前连接 card (top edge ~520), so neither sits on the card header any more */}
      <div style={{position: 'absolute', left: 120 + j.x, top: 490 - 256 + j.y}}>
        <PixelSprite sprite="icon_disconnect" scale={16} shadow={10} />
      </div>
      <div style={{position: 'absolute', left: 400, top: 490 - 144}}>
        {/* each bar sparks white for 4 frames as it dies (tallest first), on the signal_off cues */}
        <SignalBars lit={lit} unit={18} color={C.leafLight} off={alpha(C.error, 0.5)} flashAt={[offs[3], offs[2], offs[1], offs[0]]} />
      </div>
      <At x={0} y={110} w={1920} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle text={COPY.netOffline} size={168} color={C.error} outline={C.paperHi} start={at(1)} stagger={4} mode="slam" jitter={3} jitterHold={3} />
      </At>
      <CornerTag text={COPY.sections[4]} at={at(1)} />
      <NetFootnote />
    </AbsoluteFill>
  );
  // v3 (photosensitivity, WCAG 2.3.1): the only black is the cut itself — S21's last 2 frames +
  // these first 2 = one 4-frame dropout; no second dropout inside the glitch.
  return (
    <Glitch at={0} frames={at(1)} blackFrames={[0, 1]} split={10}>
      {content}
    </Glitch>
  );
};

/* ------------------------------------------------------------------ S23 */
/** 当前连接 header + the two status cells (stops above the static hint line). */
export const DIAG_CELLS: Rect = {x: 203, y: 90, width: 1194, height: NET_CELLS_H};
/** The real diagnosis result row under the hint line. */
export const DIAG_RESULT: Rect = {x: 203, y: 294, width: 1194, height: 86};

export const DiagList: React.FC<{times: number[]; size?: number; width?: number}> = ({times, size = 38, width = 860}) => {
  const f = useCurrentFrame();
  const rows = COPY.netDiagRows;
  const marks: Array<'ok' | 'fail' | 'ok' | 'dot'> = ['ok', 'fail', 'ok', 'dot'];
  const icons = ['icon_compass', 'icon_disconnect', 'icon_key', 'icon_cottage'];
  const colors = [C.success, C.error, C.success, C.muted];
  useFontsFor(rows.join(''), [700]);
  return (
    <PixelPanel fill={C.paper} border={C.wood} unit={6} shadow={10} padding="18px 26px" style={{width}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {rows.map((r, i) => {
          const a = times[i];
          const on = f >= a;
          const x = on ? tween(f, a, a + 8, -60, 0, ease.outBack) : -60;
          return (
            <div key={r} style={{display: 'flex', alignItems: 'center', gap: 18, opacity: on ? 1 : 0.18, transform: `translateX(${x}px)`, background: on && f < a + 10 ? alpha(C.gold, 0.35) : 'transparent', padding: '4px 8px'}}>
              <PixelSprite sprite={icons[i]} scale={3} />
              <span style={{flex: 1, fontFamily: FONT_BODY, fontWeight: 700, fontSize: size, color: C.ink, whiteSpace: 'nowrap'}}>{r}</span>
              <div style={{transform: `scale(${on ? 1 + Math.max(0, 1 - (f - a) / 8) * 0.6 : 1})`}}>
                <PixelMark kind={marks[i]} unit={Math.round(size / 6)} color={colors[i]} />
              </div>
            </div>
          );
        })}
      </div>
    </PixelPanel>
  );
};

export const S23: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.1;
  const src = f + 24;
  // v3: the conclusion slides in with row 3 (beat 3), so its three lines hold ~0.9 s before the cut
  const adviceAt = at(2);
  const adviceIn = springAt(f, adviceAt, {damping: 14, stiffness: 200});
  const cellsH = DIAG_CELLS.height * k;
  const resH = DIAG_RESULT.height * k;
  return (
    <AbsoluteFill>
      <Camera zoom={tween(f, 0, at(4), 1.0, 1.05)} y={tween(f, 0, at(4), 0, 20)}>
        <Layer depth={0.3}>
          <NetBG frame={f + 113} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={1150} y={60 + (cellsH + resH + 12) / 2} width={DIAG_CELLS.width * k + 12} height={cellsH + resH + 12} rotateX={tween(f, 0, 20, 10, 2, ease.out)}>
            <UICrop clip="clip_net_diag" frame={src} rect={DIAG_CELLS} k={k} />
            <UICrop clip="clip_net_diag" frame={src} rect={DIAG_RESULT} k={k} />
          </Card3D>
          <ImpactRing at={0} x={1150 + (1304 - 800) * k} y={60 + 50 * k} frames={14} maxR={140} unit={8} color={C.gold} />
        </Layer>
      </Camera>
      <At x={96} y={470}>
        <PixelTitle text={COPY.netDiagHeadline} size={84} start={at(0) + 2} stagger={3} mode="drop" align="left" />
      </At>
      <At x={96} y={600}>
        <DiagList times={[at(0), at(1), at(2), at(3)]} />
      </At>
      {f >= adviceAt ? (
        <div style={{position: 'absolute', left: 1040, top: 560, width: 760, transform: `translateX(${(1 - adviceIn) * 300}px)`, opacity: Math.min(1, adviceIn * 2)}}>
          <PixelPanel fill={C.wood} border={C.woodDark} highlight={C.woodLight} unit={6} shadow={10} padding="22px 28px" style={{width: 760, boxSizing: 'border-box'}}>
            <div style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
              <div style={{flex: '0 0 56px', paddingTop: 4}}>
                <PixelSprite sprite="icon_compass" scale={3.5} />
              </div>
              <BodyText text={COPY.netDiagAdvice} size={34} weight={700} color={C.paperHi} lineHeight={1.45} maxWidth={760 - 56 - 16 - 56 - 12} />
            </div>
          </PixelPanel>
        </div>
      ) : null}
      <At x={96} y={400}>
        <Footnote text={COPY.demoData} size={24} />
      </At>
      <CornerTag text={COPY.sections[4]} at={-30} />
      <NetFootnote />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S24 */
const LOGIN_RECT: Rect = {x: 209, y: 96, width: 581, height: 626};

export const ZoneDropdown: React.FC<{at: number; closeAt: number; x: number; y: number; scale: number}> = ({at, closeAt, x, y, scale}) => {
  const f = useCurrentFrame();
  const opts = COPY.netZoneOptions;
  useFontsFor(opts.join('') + '✓', [500]);
  if (f < at || f >= closeAt) return null;
  const s = tween(f, at, at + 5, 0.9, 1, ease.out);
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `scale(${s})`, transformOrigin: '0 0', background: '#fff', border: `${scale}px solid ${alpha(C.ink, 0.25)}`, borderRadius: 6 * scale, boxShadow: `0 ${8 * scale}px ${20 * scale}px ${alpha(C.woodDark, 0.4)}`, padding: `${4 * scale}px 0`, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 15 * scale, color: C.ink, minWidth: 260 * scale}}>
      {opts.map((o, i) => (
        <div key={o} style={{padding: `${6 * scale}px ${14 * scale}px`, background: i === 0 ? C.green : 'transparent', color: i === 0 ? '#fff' : C.ink, whiteSpace: 'nowrap'}}>
          {o}
        </div>
      ))}
    </div>
  );
};

export const ZoneCards: React.FC<{at: number; pickAt: number; vertical?: boolean}> = ({at, pickAt, vertical}) => {
  const f = useCurrentFrame();
  const cards = [
    {name: '教学区', sub: '深澜 SRun', icon: 'icon_book'},
    {name: '宿舍区', sub: 'Dr.COM', icon: 'icon_cottage'},
  ];
  useFontsFor('教学区宿舍区深澜 SRunDr.COM', [700]);
  if (f < at) return null;
  const scanT = tween(f, at + 4, pickAt, 0, 1, ease.inOut);
  // scan bounces across both cards and settles on 教学区 (index 0)
  const scanX = Math.abs(Math.cos(scanT * Math.PI * 1.5));
  const picked = f >= pickAt;
  return (
    <div style={{display: 'flex', gap: 30, flexDirection: vertical ? 'row' : 'row', position: 'relative'}}>
      {cards.map((c, i) => {
        const ry = tween(f, at, at + 10, i === 0 ? 20 : -20, 0, ease.outBack);
        const sel = picked && i === 0;
        return (
          <div key={c.name} style={{transform: `perspective(1200px) rotateY(${ry}deg) scale(${sel ? 1 + Math.max(0, 1 - (f - pickAt) / 10) * 0.08 : 1})`, opacity: picked && i === 1 ? 0.45 : 1}}>
            <PixelPanel fill={sel ? C.green : C.paper} border={sel ? C.gold : C.wood} unit={6} shadow={10} padding="22px 30px">
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: vertical ? 300 : 300}}>
                <PixelSprite sprite={c.icon} scale={6} />
                <div style={{fontFamily: FONT_PIXEL, fontSize: 60, color: sel ? C.gold : C.ink}}>{c.name}</div>
                <div style={{fontFamily: FONT_BODY, fontWeight: 700, fontSize: 30, color: sel ? C.paper : C.muted}}>{c.sub}</div>
              </div>
            </PixelPanel>
          </div>
        );
      })}
      {f < pickAt + 4 ? (
        <div style={{position: 'absolute', top: -20, bottom: -20, left: `${scanX * 50 + 2}%`, width: 14, background: C.gold, boxShadow: `0 0 0 4px ${alpha(C.paperHi, 0.6)}, 0 0 30px ${C.gold}`}} />
      ) : null}
    </div>
  );
};

export const S24: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const k = 1.25;
  const cw = LOGIN_RECT.width * k;
  const ch = LOGIN_RECT.height * k;
  const cx = 480;
  const cy = 560;
  const ox = cx - cw / 2;
  const oy = cy - ch / 2;
  const src = retime(f, [
    [0, 0],
    [at(2), 26],
    [at(2.85), 130],
    [at(3), 160],
  ], 1.5);
  const zone = {x: ox + (232 - LOGIN_RECT.x) * k, y: oy + (521 - LOGIN_RECT.y) * k};
  const submit = {x: ox + (303 - LOGIN_RECT.x) * k, y: oy + (678 - LOGIN_RECT.y) * k};
  const push = tween(f, at(3), at(4), 0, 1, ease.inExpo);
  const cam = push > 0 ? camAt({x: lerp(960, submit.x, push), y: lerp(540, submit.y, push)}, lerp(1, 1.6, push)) : {zoom: 1, x: 0, y: 0};
  return (
    <AbsoluteFill>
      <Camera {...cam}>
        <Layer depth={0.3}>
          <NetBG frame={f + 226} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={cx} y={cy} width={cw + 12} height={ch + 12} rotateY={tween(f, 0, 16, -14, 4, ease.out)}>
            <UICrop clip="clip_net_login" frame={src} rect={LOGIN_RECT} k={k} />
          </Card3D>
          <ZoneDropdown at={0} closeAt={at(1)} x={zone.x} y={zone.y + 4} scale={1.25 * 1.0} />
          <ImpactRing at={at(3)} x={submit.x} y={submit.y} frames={14} maxR={140} unit={8} color={C.gold} />
        </Layer>
      </Camera>
      <At x={1010} y={96}>
        <PixelTitle text={[{text: '自动判断\n'}, {text: '教学区', color: C.gold}, {text: ' / '}, {text: '宿舍区'}]} size={84} start={at(0) + 2} stagger={3} mode="drop" align="left" />
      </At>
      <At x={1010} y={400}>
        <ZoneCards at={at(1)} pickAt={at(1.85)} />
      </At>
      <CornerTag text={COPY.sections[4]} at={-30} />
      <NetFootnote />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ S25 */
export const S25: ShotComponent = () => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  const {width: W} = useVideoConfig();
  const ons = [at(0.25), at(0.5), at(0.75), at(1)];
  const lit = ons.filter((o) => f >= o).length;
  const whip = at(2) + 10;
  const partA = (
    <AbsoluteFill>
      <Camera zoom={tween(f, 0, whip, 1.06, 1.0, ease.out)}>
        <Layer depth={0.3}>
          <NetBG frame={f + 339} dark={0.45} />
        </Layer>
        <Layer depth={1}>
          <Card3D x={1060} y={600} width={1194 * 1.2 + 12} height={227 * 1.2 + 12} rotateY={-5}>
            <Img src={footage('ui_net_online.png')} style={{width: 1194 * 1.2, height: 227 * 1.2, display: 'block'}} />
          </Card3D>
        </Layer>
      </Camera>
      <div style={{position: 'absolute', left: 150, top: 330}}>
        <SignalBars lit={lit} unit={20} color={C.leafLight} flashAt={ons} />
      </div>
      <ParticleBurst sprites={['icon_coin', 'icon_heart', 'icon_flower']} count={24} at={0} origin={{x: 260, y: 360}} seed="online" speed={[10, 24]} angle={[-170, -10]} gravity={0.7} scale={[4, 6]} life={[40, 60]} shadow={3} />
      <div style={{position: 'absolute', left: 1700, top: 1030}}>
        <PetSprite species="libao" frame={f} scale={7} x={0} y={0} anchor="bottom" clips={[{action: 'celebrate', at: 2, step: 8}]} shadow={8} />
      </div>
      <At x={0} y={110} w={W} style={{display: 'flex', justifyContent: 'center'}}>
        <PixelTitle text={COPY.netLoginHeadline} size={108} start={0} stagger={3} mode="slam" color={C.paperHi} />
      </At>
    </AbsoluteFill>
  );
  // part B (v2): notice picker at ~65 % of frame width, calendar strip at ~45 %, slanted and
  // overlapping in 3D, with a 1.0 → 1.15 push.
  const pushB = tween(f, whip, at(4), 1.0, 1.15, ease.out);
  const partB = (
    <AbsoluteFill>
      <NetBG frame={f + 339} dark={0.5} />
      <AbsoluteFill style={{transform: `scale(${pushB})`, transformOrigin: '50% 58%'}}>
        <div style={{position: 'absolute', left: 70, top: 300, transform: `perspective(1800px) rotateY(12deg) rotateZ(-2deg)`, transformOrigin: '0% 50%'}}>
          <PaperCard>
            <Img src={footage('ui_services_notices.png')} style={{width: 1250, display: 'block'}} />
          </PaperCard>
        </div>
        <div style={{position: 'absolute', left: 1010, top: 230, transform: `perspective(1800px) rotateY(-14deg) rotateZ(3deg) translateY(${tween(f, whip, whip + 14, 300, 0, ease.outBack)}px)`, transformOrigin: '100% 50%'}}>
          <PaperCard>
            <Img src={footage('ui_study_calendar_strip.png')} style={{width: 840, display: 'block'}} />
          </PaperCard>
        </div>
        <div style={{position: 'absolute', left: 90, top: 760}}>
          <PixelSprite sprite="icon_bell" scale={8} shadow={6} />
        </div>
      </AbsoluteFill>
      <At x={0} y={96} w={W} style={{display: 'flex', justifyContent: 'center'}}>
        <Plate at={whip}>
          <BodyText text={COPY.netServices} size={56} weight={900} color={C.paperHi} inAt={whip + 2} />
        </Plate>
      </At>
    </AbsoluteFill>
  );
  // continuous whip: B rides exactly one frame width behind A (never a gap)
  const win = {a: whip - 6, b: whip + 6};
  const pr = tween(f, win.a, win.b, 0, 1, ease.inOut);
  const vel = Math.abs(tween(f + 0.5, win.a, win.b, 0, 1, ease.inOut) - tween(f - 0.5, win.a, win.b, 0, 1, ease.inOut)) * W;
  const blur = Math.min(60, vel * 0.22);
  const ride = (node: React.ReactNode, off: number, id: string) => (
    <AbsoluteFill style={{transform: `translateX(${off}px)`}}>
      {blur > 0.6 ? (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id={id} x="-10%" y="0" width="120%" height="100%">
            <feGaussianBlur stdDeviation={`${blur} 0`} />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{filter: blur > 0.6 ? `url(#${id})` : undefined}}>{node}</AbsoluteFill>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      {f < win.b ? ride(partA, -pr * W, 's25a') : null}
      {f >= win.a ? ride(partB, W - pr * W, 's25b') : null}
      <NetFootnote />
      <SoftFlash at={0} />
    </AbsoluteFill>
  );
};

export const _unused = {PixelDust, keyframes, shake};
