// 采集环境：隔离的 szuDesktop 引擎 + headless Chrome + 虚拟时钟 + 接口拦截 + 品牌守卫。
// 只读应用源码；引擎数据写在临时目录，结束时删除。不访问学校、GitHub 或任何外网。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {SRC, DEMO_WALL} from './demo.mjs';

export {SRC, DEMO_WALL};
export const PROMO = '/Users/alakazan/workplace/szudesktop-promo';
export const OUT = PROMO + '/assets/footage';
export const WORK = PROMO + '/work/capture';
export const TMP = WORK + '/tmp';
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const ENGINE = SRC + '/dist/promo/szudesktop';
const FONT_ROOT = WORK + '/node_modules/@fontsource';
const FONT_DIR = FONT_ROOT + '/noto-sans-sc';
fs.mkdirSync(OUT, {recursive: true});
fs.mkdirSync(TMP, {recursive: true});

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ———————————————————————————— 引擎 ————————————————————————————
const ENDPOINT_LINE = /^szuDesktop (已启动|已复用): (http:\/\/127\.0\.0\.1:\d+)\r?$/;
const SESSION_LINE = /^szuDesktop 会话: ([0-9a-f]{64})\r?$/;
const cleanup = new Set();
function onExit() { for (const fn of [...cleanup]) { try { fn(); } catch {} } }
process.on('exit', onExit);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { onExit(); process.exit(130); });

export async function startEngine() {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'szu-promo-cfg-'));
  const proc = spawn(ENGINE, ['--no-open', '--no-auto-login', '--addr', '127.0.0.1:0'], {
    env: {...process.env, SZUNET_CONFIG_DIR: cfg, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = () => { if (proc.exitCode === null) { try { proc.kill('SIGTERM'); } catch {} } try { fs.rmSync(cfg, {recursive: true, force: true}); } catch {} };
  cleanup.add(kill);
  let base = null, token = null, buf = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('engine did not announce')), 20000);
    proc.stdout.on('data', chunk => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const e = ENDPOINT_LINE.exec(line), s = SESSION_LINE.exec(line);
        if (e && !base) base = e[2];
        if (s && !token) token = s[1];
      }
      if (base && token) { clearTimeout(timer); resolve(); }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', code => { clearTimeout(timer); reject(new Error('engine exited ' + code)); });
  });
  const url = new URL(base);
  async function api(p, data, method) {
    const body = data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data);
    const res = await fetch(base + p, {method: method || (data === undefined ? 'GET' : 'POST'), headers: {'X-SZU-Token': token, ...(body ? {'Content-Type': 'application/json'} : {})}, body});
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = {raw: text}; }
    if (!res.ok) throw new Error(`${p} ${res.status} ${text.slice(0, 200)}`);
    return json;
  }
  for (let i = 0; i < 40; i++) { try { await api('/api/health'); break; } catch { await sleep(250); } }
  const health = await api('/api/health');
  const eng = {
    base, token, cfg, proc, port: Number(url.port), version: health.app_version || '', api,
    async setWorkspace(data) { const cur = await api('/api/workspace'); return api('/api/workspace', {version: 1, revision: cur.revision, data}); },
    async getWorkspace() { return (await api('/api/workspace')).data; },
    async setNotebook(data) { const cur = await api('/api/notebook'); return api('/api/notebook', JSON.stringify({version: 1, revision: cur.revision, data}), 'PUT'); },
    async stop() {
      if (proc.exitCode === null) {
        proc.kill('SIGTERM');
        for (let i = 0; i < 40 && proc.exitCode === null; i++) await sleep(100);
        if (proc.exitCode === null) proc.kill('SIGKILL');
      }
      fs.rmSync(cfg, {recursive: true, force: true});
      cleanup.delete(kill);
    },
  };
  log('engine', base, 'version', eng.version, 'pid', proc.pid);
  return eng;
}

// ———————————————————————————— 浏览器 ————————————————————————————
export async function launchBrowser({gpu = 'metal', extraArgs = []} = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'szu-promo-chrome-'));
  const args = [
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-component-update',
    '--disable-background-networking', '--disable-domain-reliability', '--disable-client-side-phishing-detection',
    '--disable-breakpad', '--no-pings', '--metrics-recording-only', '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,InterestFeedContentSuggestions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars', '--force-color-profile=srgb', '--lang=zh-CN', '--mute-audio',
    '--proxy-server=127.0.0.1:9',
    ...(gpu === 'metal' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] : gpu === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
    ...extraArgs,
  ];
  const browser = await puppeteer.launch({executablePath: CHROME, headless: true, userDataDir, args, defaultViewport: null, protocolTimeout: 600000});
  const pid = browser.process()?.pid;
  const kill = () => { try { browser.process()?.kill('SIGKILL'); } catch {} try { fs.rmSync(userDataDir, {recursive: true, force: true}); } catch {} };
  cleanup.add(kill);
  browser.__close = async () => { try { await browser.close(); } catch {} kill(); cleanup.delete(kill); };
  log('chrome pid', pid, 'gpu', gpu);
  return browser;
}

// ———————————————————————————— 注入 ————————————————————————————
const clockTemplate = fs.readFileSync(WORK + '/lib/clock.js', 'utf8');
export const clockSource = wallStart => clockTemplate.replace('const CFG = __CFG__;', 'const CFG = ' + JSON.stringify({wallStart}) + ';');

export function bridgeSource({platform = 'win32', petScale = 1, desktop = {}} = {}) {
  const settings = {focusNotifications: true, doNotDisturb: false, petVisible: true, petAlwaysOnTop: true, autoConnectCampus: false, launchAtLogin: false, launchAtLoginSupported: true, notificationsSupported: true, ...desktop};
  return `(() => {
    const noop = () => () => {};
    const scale = ${JSON.stringify(petScale)};
    const settings = ${JSON.stringify(settings)};
    window.szuDesktop = Object.freeze({
      shell: 'electron', platform: ${JSON.stringify(platform)},
      quit: async () => true, onBeforeQuit: noop,
      petScale: async () => scale, setPetScale: async v => v,
      desktopSettings: async () => ({...settings}), setDesktopSettings: async patch => ({...settings, ...patch}),
      onDesktopSettings: noop, onPetScale: noop, onPetCommand: noop,
      petResult: () => {}, openSchool: async () => ({ok: false}), openFeishu: async () => ({ok: false}),
      syncSchool: async () => ({ok: false}), clearSchool: async () => ({ok: true}),
    });
  })();`;
}

function fontFaceCSS() {
  const read = (pkg, w) => fs.readFileSync(`${FONT_ROOT}/${pkg}/${w}.css`, 'utf8').replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\), url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, `url(/__promo/fonts/${pkg}/$1) format('woff2')`);
  // 600 用 700 的字形（应用里的 600 粗细只出现在少数小标题上）。符号（⌄ ✦ ✓ ↗ ▼ 等）回退到 Noto Sans Symbols 2，不落到系统字体。
  return read('noto-sans-sc', 400) + read('noto-sans-sc', 500) + read('noto-sans-sc', 700) + read('noto-sans-sc', 700).replace(/font-weight: 700;/g, 'font-weight: 600;') + read('noto-sans-symbols', 400) + read('noto-sans-symbols-2', 400);
}
const FONT_CSS = fontFaceCSS();

// 品牌守卫：只隐藏 Pingu、Skipper、阿青（名册里的第 4、5 张卡、老朋友折叠区、欢迎引导），不改别的界面。
export const BRAND_CSS = `
[data-action="switchPet"][data-index="3"], [data-action="switchPet"][data-index="4"], .legacy-companions, #guide { display: none !important; }
svg:has(> use[href*="pingu"]), svg:has(> use[href*="skipper"]), svg:has(> use[href*="turtle"]) { visibility: hidden !important; }
`;
export const FONT_OVERRIDE_CSS = `
:root, body, body[data-theme] { --body: "Noto Sans SC", "Fusion Pixel 12px Proportional Simplified Chinese", "Noto Sans Symbols", "Noto Sans Symbols 2", sans-serif !important; --pixel: "Fusion Pixel 12px Proportional Simplified Chinese", "Noto Sans SC", "Noto Sans Symbols", "Noto Sans Symbols 2", sans-serif !important; }
#session-cookie, code, pre, kbd, samp { font-family: "Noto Sans SC", "Fusion Pixel 12px Proportional Simplified Chinese", "Noto Sans Symbols", "Noto Sans Symbols 2", sans-serif !important; }
#main:focus, #main:focus-visible { outline: none !important; }
`;
export function styleSource(extraCSS = '') {
  const css = FONT_CSS + FONT_OVERRIDE_CSS + BRAND_CSS + extraCSS;
  return `(() => {
    const css = ${JSON.stringify(css)};
    const add = () => { if (document.getElementById('promo-style')) return true; const root = document.head || document.documentElement; if (!root) return false; const s = document.createElement('style'); s.id = 'promo-style'; s.textContent = css; (document.head || document.documentElement).appendChild(s); return true; };
    if (!add()) document.addEventListener('readystatechange', add);
    document.addEventListener('DOMContentLoaded', () => { const s = document.getElementById('promo-style'); if (s) document.head.appendChild(s); else add(); });
  })();`;
}

// ———————————————————————————— 合成接口数据 ————————————————————————————
export function statusOffline(version) {
  return {app_version: version, zone: 'teaching', zone_label: '教学区（深澜 SRun）', internet_ok: false, online: false, online_known: true, online_error: '', online_state: 'offline', online_note: '', saved: false, store_desc: 'Windows DPAPI（用当前用户账户加密，换机器或换用户都解不开）', last_error: '', advices: []};
}
export function statusOnline(version) {
  return {app_version: version, zone: 'online', zone_label: '教学区（深澜 SRun）', internet_ok: true, online: true, online_known: true, online_error: '', online_state: 'online', online_note: '', online_zone: 'teaching', saved: false, store_desc: 'Windows DPAPI（用当前用户账户加密，换机器或换用户都解不开）', last_error: '', advices: []};
}
export const DIAG_TEACHING = {
  zone: 'teaching', zone_label: '教学区（深澜 SRun）', internet_ok: false, probed: true, teaching_portal_ok: true, dorm_portal_ok: false, dns_ok: true, dns_fake_ip: false,
  advices: ['你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，密码是统一身份认证密码', '教学办公区的上网权限是宿舍区套餐免费附带的，不用另外买', '如果报 ldap auth error 是密码错；报 Rad:userid error 是账号错'],
  notes: [],
};
export const CALENDAR = {
  terms: [
    {name: '2026–2027 学年第一学期', start: '2026-08-28', end: '2027-01-22', week_start: '2026-08-30', classes_start: '2026-08-31', image: ''},
    {name: '2025–2026 学年第二学期', start: '2026-03-04', end: '2026-07-17', week_start: '2026-03-08', classes_start: '2026-03-09', image: ''},
  ],
  images: [], checked_at: '2026-10-13T01:00:00Z', source: 'https://www.szu.edu.cn/', stale: false,
};

const json = (body, status = 200, headers = {}) => ({status, contentType: 'application/json; charset=utf-8', headers: {'Cache-Control': 'no-store', ...headers}, body: JSON.stringify(body)});
const fontCache = new Map();

// 默认接口策略：存档、笔记、健康检查、公告来源目录交给隔离引擎；其余全部由这里返回合成数据或 503，
// 引擎因此不会去探测外网、门户、学校系统，也不会读写钥匙串。
export function defaultRoutes(eng, overrides = {}) {
  const r = {
    '/api/status': () => json(statusOffline(eng.version)),
    '/api/credential': () => json({saved: false}),
    '/api/diag': () => json(DIAG_TEACHING),
    '/api/login': () => json({ok: true, zone: 'teaching', message: '认证成功'}),
    '/api/logout': () => json({ok: true, message: '已注销'}),
    '/api/autostart': () => json({supported: true, enabled: false, detail: '未开启开机自启'}),
    '/api/releases': () => json({error: '演示环境不检查更新'}, 503),
    '/api/campus/calendar': () => json(CALENDAR),
    '/api/campus/notices': () => json({error: '演示环境不读取公告'}, 503),
    '/api/campus/status': () => json({available: false}),
    '/api/academic/session': () => json({authenticated: false}),
    '/api/cas/session': () => json({authenticated: false}),
    '/api/session': () => json({saved: false, store_desc: ''}),
    '/api/feishu/status': () => json({available: false}),
    '/api/piano/status': () => json({authenticated: false}),
    '/api/window-stream': () => ({status: 200, contentType: 'text/event-stream', headers: {'Cache-Control': 'no-store'}, body: 'retry: 3600000\n\n'}),
    '/api/window': () => json({ok: true}),
    ...overrides,
  };
  return r;
}
const PASS = new Set(['/api/workspace', '/api/notebook', '/api/health', '/api/campus/notice-sources']);

export async function attachInterception(page, {eng = null, routes = {}, staticPort = 0, extraFiles = {}} = {}) {
  await page.setRequestInterception(true);
  const blocked = [];
  page.on('request', async req => {
    if (req.isInterceptResolutionHandled()) return;
    const raw = req.url();
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return req.continue();
    let u; try { u = new URL(raw); } catch { return req.abort('blockedbyclient'); }
    const local = u.hostname === '127.0.0.1' && ((eng && Number(u.port) === eng.port) || (staticPort && Number(u.port) === staticPort));
    if (!local) { blocked.push(raw); return req.abort('blockedbyclient'); }
    try {
      if (u.pathname.startsWith('/__promo/fonts/')) {
        const [, , , pkg, name] = u.pathname.split('/');
        if (!/^noto-sans-[a-z0-9-]+$/.test(pkg) || !/^[\w.-]+\.woff2$/.test(name)) return req.respond({status: 404, body: ''});
        const key = pkg + '/' + name;
        if (!fontCache.has(key)) fontCache.set(key, fs.readFileSync(`${FONT_ROOT}/${pkg}/files/${name}`));
        return req.respond({status: 200, contentType: 'font/woff2', headers: {'Cache-Control': 'max-age=3600'}, body: fontCache.get(key)});
      }
      if (Object.hasOwn(extraFiles, u.pathname)) {
        const f = extraFiles[u.pathname];
        return req.respond({status: 200, contentType: f.type, headers: {'Cache-Control': 'no-store'}, body: f.body});
      }
      if (u.pathname.startsWith('/api/')) {
        if (Object.hasOwn(routes, u.pathname)) {
          const out = await routes[u.pathname](req, u);
          return req.respond(out);
        }
        if (PASS.has(u.pathname)) return req.continue();
        return req.respond(json({error: '演示环境未启用此功能', message: '演示环境未启用此功能'}, 503));
      }
      return req.continue();
    } catch (e) {
      console.error('intercept error', raw, e);
      try { return req.respond(json({error: String(e)}, 500)); } catch {}
    }
  });
  return blocked;
}

export async function newAppPage(browser, eng, {wall = DEMO_WALL, platform = 'win32', bridge = true, petScale = 1, desktop = {}, routes = {}, viewport = {width: 1600, height: 900, deviceScaleFactor: 2}, css = ''} = {}) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport(viewport);
  await page.emulateTimezone('Asia/Shanghai');
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}, {name: 'prefers-color-scheme', value: 'light'}]);
  await page.evaluateOnNewDocument(clockSource(wall));
  if (bridge) await page.evaluateOnNewDocument(bridgeSource({platform, petScale, desktop}));
  await page.evaluateOnNewDocument(styleSource(css));
  page.on('pageerror', e => log('pageerror:', String(e.message || e).slice(0, 300)));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) { const t = m.text(); if (!/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(t)) log('console.' + m.type() + ':', t.slice(0, 300)); } });
  const blocked = await attachInterception(page, {eng, routes: defaultRoutes(eng, routes)});
  page.__blocked = blocked;
  page.__routes = routes;
  return page;
}

// 打开应用：先用 launch 令牌换 Cookie，再跳到指定路由，等存档读进来、字体就绪。
export async function openApp(page, eng, hash = '#home') {
  await page.goto(`${eng.base}/?launch=${eng.token}`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#nav')?.children.length > 0 && !document.querySelector('#main h1')?.textContent.includes('正在打开'), {timeout: 30000});
  if (hash) await gotoRoute(page, hash);
  await settleFonts(page);
}
export async function gotoRoute(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForFunction(h => location.hash === h, {timeout: 10000}, hash);
  await realWait(page, 400);
}
export async function settleFonts(page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await realWait(page, 300);
  await page.evaluate(async () => { await document.fonts.ready; });
}
export const realWait = (page, ms) => sleep(ms);

// ———————————————————————————— 品牌与字体检查 ————————————————————————————
export async function brandCheck(page, rect = null) {
  const offenders = await page.evaluate(r => {
    const bad = /Pingu|Skipper|阿青|Noot|企鹅|小龟/;
    const vw = innerWidth, vh = innerHeight;
    const box = r || {x: 0, y: 0, width: vw, height: vh};
    const inBox = b => b.width > 0 && b.height > 0 && b.right > box.x && b.left < box.x + box.width && b.bottom > box.y && b.top < box.y + box.height && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!bad.test(n.textContent)) continue;
      const el = n.parentElement;
      if (!el || !el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      if ([...range.getClientRects()].some(inBox)) out.push('text:' + n.textContent.trim().slice(0, 60));
    }
    for (const u of document.querySelectorAll('use')) {
      const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      if (!/pingu|skipper|turtle/.test(href)) continue;
      const svg = u.closest('svg');
      if (!svg || !svg.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
      if (inBox(svg.getBoundingClientRect())) out.push('use:' + href);
    }
    for (const img of document.querySelectorAll('img')) {
      if (/pingu|skipper|turtle/i.test(img.src + img.alt) && img.checkVisibility() && inBox(img.getBoundingClientRect())) out.push('img:' + img.src);
    }
    return out;
  }, rect);
  if (offenders.length) throw new Error('BRAND GUARD: ' + offenders.join(' | '));
  return true;
}

// 用 CDP 查看实际渲染字体（抽样），确认没有落到 PingFang 等系统字体。
export async function fontAudit(page, selector = 'body *', limit = 60) {
  const client = await page.createCDPSession();
  await client.send('DOM.enable'); await client.send('CSS.enable');
  const {root} = await client.send('DOM.getDocument', {depth: -1});
  const {nodeIds} = await client.send('DOM.querySelectorAll', {nodeId: root.nodeId, selector});
  const fams = new Map();
  let checked = 0;
  for (const id of nodeIds) {
    if (checked >= limit) break;
    try {
      const {fonts} = await client.send('CSS.getPlatformFontsForNode', {nodeId: id});
      if (!fonts.length) continue;
      checked++;
      for (const f of fonts) fams.set(f.familyName, (fams.get(f.familyName) || 0) + f.glyphCount);
    } catch {}
  }
  await client.detach();
  return Object.fromEntries(fams);
}

// ———————————————————————————— 截图与录制 ————————————————————————————
export async function rectOf(page, selector, pad = 0) {
  const r = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; }, selector);
  if (!r) throw new Error('no element ' + selector);
  return {x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2};
}
export function clampRect(r, vw = 1600, vh = 900) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  return {x, y, width: Math.min(vw - x, Math.ceil(r.width + (r.x - x))), height: Math.min(vh - y, Math.ceil(r.height + (r.y - y)))};
}

// puppeteer 的 clip 以文档坐标计（含滚动偏移）；这里输入的是视口坐标。
export async function docClip(page, r) {
  const vp = page.viewport();
  const c = clampRect(r, vp.width, vp.height);
  const {sx, sy} = await page.evaluate(() => ({sx: scrollX, sy: scrollY}));
  return {...c, x: c.x + sx, y: c.y + sy};
}
export async function still(page, file, {clip = null, check = true, rect = null} = {}) {
  if (check) await brandCheck(page, clip || rect);
  const buf = await page.screenshot({type: 'png', clip: clip ? await docClip(page, clip) : undefined, captureBeyondViewport: false});
  fs.writeFileSync(file, buf);
  return file;
}

// 逐帧录制：每帧 onFrame(i) → 截图 → 时钟前进 1/60 s。返回帧目录与事件记录（光标、点击、按键）。
export async function recordFrames(page, name, {frames, onFrame = null, clip = null, check = true, stepOptions = null, everyCheck = 30} = {}) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  await page.evaluate(() => window.__promoClock.manual());
  const vp = page.viewport();
  const shotClip = clip ? clampRect(clip, vp.width, vp.height) : undefined;
  const shotDocClip = clip ? await docClip(page, clip) : undefined;
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    if (onFrame) await onFrame(i);
    if (check && (i % everyCheck === 0 || i === frames - 1)) await brandCheck(page, shotClip || null);
    const buf = await page.screenshot({type: 'png', clip: shotDocClip, captureBeyondViewport: false, optimizeForSpeed: true});
    fs.writeFileSync(path.join(dir, String(i).padStart(5, '0') + '.png'), buf);
    const opts = typeof stepOptions === 'function' ? await stepOptions(i) : stepOptions;
    await page.evaluate((o) => window.__promoClock.step(1000 / 60, o || {}), opts);
  }
  log(`recorded ${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return dir;
}

export function encode(dir, outFile, {fps = 60, crf = 12} = {}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.2',
    '-x264-params', 'keyint=60:min-keyint=60', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-movflags', '+faststart', '-an', outFile];
  const r = spawnSync('ffmpeg', args, {encoding: 'utf8'});
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  return outFile;
}
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,pix_fmt,codec_name:format=duration,size', '-of', 'json', file], {encoding: 'utf8'});
  return JSON.parse(r.stdout);
}

// 光标/交互时间线：mouse 相关动作同时记录到 events，供合成时叠加像素光标。
export function createActor(page) {
  const events = [];
  let frame = 0, cursor = {x: 800, y: 450, down: false};
  const track = [];
  const api = {
    events, track,
    setFrame(f) { frame = f; },
    get cursor() { return cursor; },
    async move(x, y) { cursor = {...cursor, x, y}; await page.mouse.move(x, y); },
    async down() { cursor = {...cursor, down: true}; await page.mouse.down(); events.push({frame, type: 'down', x: cursor.x, y: cursor.y}); },
    async up() { cursor = {...cursor, down: false}; await page.mouse.up(); events.push({frame, type: 'up', x: cursor.x, y: cursor.y}); },
    async type(text) { await page.keyboard.type(text); events.push({frame, type: 'key', text}); },
    async press(key) { await page.keyboard.press(key); events.push({frame, type: 'key', key}); },
    note(type, extra = {}) { events.push({frame, type, ...extra}); },
    record() { track.push([frame, Math.round(cursor.x * 10) / 10, Math.round(cursor.y * 10) / 10, cursor.down ? 1 : 0]); },
  };
  return api;
}
export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export async function centerOf(page, selector) {
  const r = await page.evaluate(s => { const el = typeof s === 'string' ? document.querySelector(s) : null; if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; }, selector);
  if (!r) throw new Error('no element ' + selector);
  return r;
}

export function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }

export const META = WORK + '/meta';
fs.mkdirSync(META, {recursive: true});
// 把帧目录编码成 MP4，另存首帧/末帧（以及可选的关键帧）PNG，并写入该素材的元数据。
export function saveClip(dir, key, meta = {}, {keepFrames = false, heroFrames = []} = {}) {
  const out = path.join(OUT, key + '.mp4');
  encode(dir, out);
  const frames = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  fs.copyFileSync(path.join(dir, frames[0]), path.join(OUT, key + '.first.png'));
  fs.copyFileSync(path.join(dir, frames.at(-1)), path.join(OUT, key + '.last.png'));
  const heroes = [];
  for (const h of heroFrames) {
    const name = `${key}.f${String(h).padStart(4, '0')}.png`;
    fs.copyFileSync(path.join(dir, frames[Math.min(h, frames.length - 1)]), path.join(OUT, name));
    heroes.push(name);
  }
  const info = probe(out);
  writeJSON(path.join(META, key + '.json'), {key, kind: 'clip', file: key + '.mp4', first: key + '.first.png', last: key + '.last.png', heroes, frameCount: frames.length, probe: info, ...meta});
  if (!keepFrames) fs.rmSync(dir, {recursive: true, force: true});
  log('saved clip', key, info.streams?.[0]?.nb_read_frames, 'frames', (Number(info.format?.size) / 1e6).toFixed(1) + 'MB');
  return out;
}
export function saveStillMeta(key, meta) {
  writeJSON(path.join(META, key + '.json'), {key, kind: 'still', ...meta});
}
