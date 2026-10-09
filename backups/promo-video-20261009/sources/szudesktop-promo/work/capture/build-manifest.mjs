// 汇总 work/capture/meta/*.json → assets/footage/manifest.json，并生成每个素材的缩略图拼版与总索引拼版。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {launchBrowser, OUT, WORK, PROMO, SRC, writeJSON, log, DEMO_WALL} from './lib/harness.mjs';

const META = WORK + '/meta';
const CONTACT = OUT + '/contact';
fs.mkdirSync(CONTACT, {recursive: true});

const USED_IN = {
  ui_home_lake: ['S04', 'S07', 'S26', 'V03'], ui_home_lake_mac: ['S26'], ui_home_pixel: ['S15'],
  clip_focus_todo_add: ['S08'], clip_focus_start_timelapse: ['S09', 'V05'], clip_focus_claim: ['S10', 'V05'], ui_focus_week: ['S10'],
  ui_farm_overview: ['S11'], clip_farm_harvest: ['S12', 'V06'],
  clip_scene_lake_dolly: ['S13', 'S15'], clip_scene_bookshop_dolly: ['S14', 'S15'], clip_scene_terrace_dolly: ['S15'],
  clip_scene_lake_dolly_v: ['V07'], clip_scene_bookshop_dolly_v: ['V07'], clip_scene_terrace_dolly_v: ['V07'],
  clip_build_picnic: ['S16', 'V09'], ui_farm_picnic_built: ['S16', 'V09'], ui_build_picnic_ready: ['S16'],
  ui_arcade_won: ['S18'], clip_arcade_claim: ['S18'], clip_arcade_merge_2048: ['S17（可选：真实合成瞬间）', 'V08'],
  clip_note_write: ['S19'], clip_note_outline: ['S20', 'V10'], clip_note_to_todo: ['S21', 'V10'], ui_note_desk: ['S19'],
  ui_net_offline: ['S22'], clip_net_diag: ['S23', 'V11'], clip_net_login: ['S24'], ui_net_login_form: ['S24'], ui_net_online: ['S25', 'V11'],
  ui_services_notices: ['S25'], ui_study_calendar_strip: ['S25'],
  ui_settings_data: ['S27'], ui_settings_desktop: ['S05'],
  ui_pet_window_bubbles: ['S04', 'S06', 'S07', 'S09', 'S12', 'S30'],
  ui_home_bookshop: ['S15'], ui_home_terrace: ['S15'], clip_home_lake_live: ['S04', 'S26'], clip_home_skin_switch: ['S15'], clip_pet_room_care: ['S06（应用内对照）'],
};
const REQUIRED = ['ui_home_lake', 'ui_home_lake_mac', 'ui_home_pixel', 'clip_focus_todo_add', 'clip_focus_start_timelapse', 'clip_focus_claim', 'ui_focus_week', 'ui_farm_overview', 'clip_farm_harvest', 'clip_scene_lake_dolly', 'clip_scene_bookshop_dolly', 'clip_scene_terrace_dolly', 'clip_build_picnic', 'ui_farm_picnic_built', 'ui_arcade_won', 'clip_arcade_claim', 'clip_note_write', 'clip_note_outline', 'clip_note_to_todo', 'ui_net_offline', 'clip_net_diag', 'clip_net_login', 'ui_net_online', 'ui_services_notices', 'ui_study_calendar_strip', 'ui_settings_data', 'ui_settings_desktop', 'ui_pet_window_bubbles'];

function pngSize(file) {
  const b = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd);
  return {width: b.readUInt32BE(16), height: b.readUInt32BE(20)};
}
const rel = f => path.relative(OUT, f);

const metas = fs.readdirSync(META).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(META, f), 'utf8')));
const footage = {};
for (const m of metas.sort((a, b) => a.key.localeCompare(b.key))) {
  const entry = {kind: m.kind, used_in: USED_IN[m.key] || [], required: REQUIRED.includes(m.key), description: m.description};
  if (m.kind === 'clip') {
    const s = m.probe.streams[0], fmt = m.probe.format;
    const [num, den] = s.r_frame_rate.split('/').map(Number);
    Object.assign(entry, {
      file: m.file, width: s.width, height: s.height, fps: num / den, frames: Number(s.nb_read_frames), duration_s: Number((Number(s.nb_read_frames) / (num / den)).toFixed(3)),
      codec: `${s.codec_name} ${s.pix_fmt} CRF 12`, size_bytes: Number(fmt.size),
      first_frame: m.first, last_frame: m.last, hero_frames: m.heroes,
      contact_sheet: `contact/${m.key}.contact.jpg`,
    });
    for (const k of ['viewport', 'timelapse', 'events', 'rects', 'synthetic', 'render', 'sceneName', 'toastRect']) if (m[k] !== undefined) entry[k] = m[k];
    if (m.cursor) entry.cursor_track = {format: '[帧, x, y, 按下]，CSS 像素（视口 1600×900，×2 即 3200×1800 帧上的像素）', frames: m.cursor};
  } else if (m.key === 'ui_pet_window_bubbles') {
    Object.assign(entry, {dir: m.file, deviceScaleFactor: m.deviceScaleFactor, windowCss: m.windowCss, lines: m.lines.map(l => ({...l, window_px: pngSize(path.join(OUT, l.window)), bubble_px: pngSize(path.join(OUT, l.bubble))})), contact_sheet: `contact/${m.key}.contact.jpg`});
  } else {
    const main = path.join(OUT, m.file);
    Object.assign(entry, {file: m.file, ...pngSize(main), extra: (m.extra || []).map(f => ({file: f, ...pngSize(path.join(OUT, f))})), contact_sheet: `contact/${m.key}.contact.jpg`});
    for (const k of ['clipCss', 'viewportRects', 'viewport', 'scrollY', 'synthetic', 'sources', 'builtSceneRect', 'fontsSample']) if (m[k] !== undefined) entry[k] = m[k];
  }
  footage[m.key] = entry;
}
const missing = REQUIRED.filter(k => !footage[k]);
const git = spawnSync('git', ['-C', SRC, 'rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).stdout.trim();

// ———— 缩略图拼版 ————
function sheetForClip(key, file) {
  const out = path.join(CONTACT, key + '.contact.jpg');
  const p = footage[key];
  const step = Math.max(1, Math.floor(p.frames / 8));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, file), '-vf', `select='not(mod(n\\,${step}))',scale=${p.width >= p.height ? 640 : 270}:-1,tile=4x2:padding=10:margin=10:color=0x3F3829`, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
}
function sheetForStill(key, files) {
  const out = path.join(CONTACT, key + '.contact.jpg');
  const inputs = files.flatMap(f => ['-i', path.join(OUT, f)]);
  const n = files.length;
  const filter = files.map((_, i) => `[${i}]scale=-1:420:flags=lanczos,pad=iw+20:440:10:10:0x3F3829[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') + (n > 1 ? `hstack=inputs=${n}` : 'null');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0) throw new Error(key + ' ' + r.stderr.toString());
}
for (const [key, e] of Object.entries(footage)) {
  if (e.kind === 'clip') sheetForClip(key, e.file);
  else if (key === 'ui_pet_window_bubbles') sheetForStill(key, e.lines.map(l => l.window));
  else sheetForStill(key, [e.file, ...e.extra.map(x => x.file)]);
}

// ———— 总索引（带中文标签，用 headless Chrome 排版；字体同采集：Noto Sans SC / Fusion Pixel） ————
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/index.html') { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); return res.end(indexHTML()); }
  const file = path.resolve(PROMO, '.' + u);
  const ok = (file.startsWith(OUT + '/') || file.startsWith(WORK + '/node_modules/@fontsource/')) && fs.existsSync(file);
  if (!ok) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/png'});
  fs.createReadStream(file).pipe(res);
});
function indexHTML() {
  const cards = Object.entries(footage).map(([key, e]) => {
    const thumb = e.kind === 'clip' ? e.hero_frames?.[Math.floor((e.hero_frames.length - 1) / 2)] || e.first_frame : key === 'ui_pet_window_bubbles' ? null : e.file;
    const img = key === 'ui_pet_window_bubbles' ? e.lines.slice(0, 4).map(l => `<img class="pet" src="/assets/footage/${l.window}">`).join('') : `<img src="/assets/footage/${thumb}">`;
    const spec = e.kind === 'clip' ? `${e.width}×${e.height} · ${e.fps}fps · ${e.duration_s}s` : key === 'ui_pet_window_bubbles' ? `${e.lines.length} 句 × (窗 + 气泡) 透明 PNG` : `${e.width}×${e.height} PNG${e.extra.length ? ' + ' + e.extra.length : ''}`;
    return `<figure class="${e.required ? 'req' : 'extra'}"><div class="img">${img}</div><figcaption><b>${key}</b><span>${e.kind === 'clip' ? '动态' : '静帧'} · ${spec}</span><small>${(e.used_in || []).join(' ')}${e.required ? '' : ' · 额外素材'}</small></figcaption></figure>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/work/capture/node_modules/@fontsource/noto-sans-sc/500.css"><link rel="stylesheet" href="/work/capture/node_modules/@fontsource/noto-sans-sc/700.css"><style>
  body{margin:0;padding:28px;background:#FFF9E9;font-family:"Noto Sans SC",sans-serif;color:#3F3829;width:2160px}
  h1{margin:0 0 6px;font-size:34px;color:#6E1F35} p{margin:0 0 20px;font-size:16px;color:#88582F}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  figure{margin:0;background:#FFFDF5;border:2px solid #D6C5A2;box-shadow:4px 4px #492A1622}
  figure.extra{border-style:dashed}
  .img{height:290px;background:#3F3829;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .img img{max-width:100%;max-height:290px;image-rendering:auto} .img img.pet{max-height:250px;margin:0 2px}
  figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:3px} figcaption b{font-size:17px;color:#42654B} figcaption span{font-size:13px} figcaption small{font-size:12px;color:#88582F}
  </style></head><body><h1>szuDesktop · 荔枝庭院 宣传片采集素材索引</h1><p>源码 ${git}（beta0.9.7 内容）· 引擎真实运行 + 演示存档 · 演示日 2026-10-13 09:30 · 实线框为分镜要求的 ${REQUIRED.length} 条，虚线框为额外素材 · 详细参数见 manifest.json</p><div class="grid">${cards}</div></body></html>`;
}
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({width: 2216, height: 1200, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${port}/index.html`, {waitUntil: 'networkidle0'});
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({path: path.join(OUT, 'contact-sheet.png'), fullPage: true});
} finally {
  await browser.__close();
  server.close();
}

const manifest = {
  project: 'szuDesktop · 荔枝庭院 宣传片 — 真实应用画面采集',
  generated_at: new Date().toISOString(),
  source: {worktree: SRC, commit: git, app_version: 'beta0.9.7', engine: 'desktop/cmd/szudesktop（GOPROXY=off 本地构建，--no-open --no-auto-login --addr 127.0.0.1:0，SZUNET_CONFIG_DIR=临时目录）'},
  capture: {
    browser: 'Google Chrome 154 headless（puppeteer-core），GPU：ANGLE Metal（Apple M4），--force-color-profile=srgb',
    viewport: '界面类素材：视口 1600×900 CSS 像素，deviceScaleFactor 2 → 帧/截图 3200×1800；区域截图同为 2x。风景类：1920×1080 / 1080×1920，1x，内部 1.5 倍超采样。',
    coordinates: 'rects / clipCss / viewportRects / events / cursor_track 一律是 CSS 像素、相对当时视口左上角（视口已按 viewport.scrollY 下滚）；乘 2 得到 3200×1800 帧上的像素位置。',
    timing: '界面录制用注入的虚拟时钟逐帧推进（JS 定时器、requestAnimationFrame、CSS 动画/过渡都按 1/60 s 确定性步进），所以每段 MP4 都是严格 60fps CFR，帧与帧之间没有掉帧或卡顿。交互帧号见 events，可按拍点对齐（点击按下帧 = type:"down"）。',
    demo_clock: `墙钟固定从 2026-10-13（周二）09:30 北京时间起算（${DEMO_WALL}）；这一天的三份伙伴委托恰好来自荔宝、栗栗、小白，画面不会出现其他伙伴。2026–2027 学年第一学期第 7 周。`,
    fonts: '正文强制为 Noto Sans SC（@fontsource，OFL），像素标题为仓库自带 Fusion Pixel（OFL），符号回退 Noto Sans Symbols / Symbols 2（OFL）；已用 CDP 逐页核对实际渲染字体，没有 PingFang / 微软雅黑 / Menlo 等系统字体。',
    brand_guard: '隐藏 Pingu、Skipper（名册第 4、5 张卡）、老朋友折叠区与欢迎引导；每张截图与每段录制每 30 帧都检查可见文字不含 Pingu|Skipper|阿青|Noot|企鹅|小龟、可见 <use> 不引用 pingu/skipper/turtle，命中即失败。',
    data: '全部为演示数据：昵称「小荔」，演示卡号 123456，演示密码只显示为圆点；校园网状态、诊断、登录、校历均为请求拦截返回的合成数据（不连真实门户、不访问学校或 GitHub、不读写钥匙串、不登记登录项）。',
    reproduce: 'cd work/capture && ./run-all.sh（需要先在源码 worktree 构建 dist/promo/szudesktop，见 run-all.sh 顶部）',
  },
  required_keys: REQUIRED,
  missing_required: missing,
  contact_sheet: 'contact-sheet.png',
  footage,
};
writeJSON(path.join(OUT, 'manifest.json'), manifest);
log('manifest', Object.keys(footage).length, 'entries; missing', missing);
