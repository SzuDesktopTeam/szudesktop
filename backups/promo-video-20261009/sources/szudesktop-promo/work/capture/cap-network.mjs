// 校园网：断网状态 → 运行网络诊断 → 填写演示卡号登录 → 在线状态。全部接口为合成数据，不连真实门户。
import {startEngine, launchBrowser, newAppPage, openApp, recordFrames, saveClip, still, saveStillMeta, createActor, rectOf, sleep, log, OUT, statusOffline, statusOnline, DIAG_TEACHING} from './lib/harness.mjs';
import {timeline} from './lib/timeline.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const VP = {width: 1600, height: 900, deviceScaleFactor: 2};
const json = (body, status = 200) => ({status, contentType: 'application/json; charset=utf-8', headers: {'Cache-Control': 'no-store'}, body: JSON.stringify(body)});
// 录制时按「视频时间」等待：每录一帧 frameNow 加一；不在录制时按真实时间等。
let frameNow = 0, recording = false;
const delay = async ms => {
  if (!recording) return new Promise(r => setTimeout(r, ms));
  const until = frameNow + Math.round(ms / (1000 / 60));
  while (recording && frameNow < until) await new Promise(r => setTimeout(r, 5));
};
const rec = (tl) => async i => { recording = true; frameNow = i; await tl.run(i); };
const eng = await startEngine();
const browser = await launchBrowser();
try {
  await eng.setWorkspace(saveA());
  await eng.setNotebook(demoNotebook());
  let online = false;
  const loginBodies = [];
  const page = await newAppPage(browser, eng, {routes: {
    '/api/status': () => json(online ? statusOnline(eng.version) : statusOffline(eng.version)),
    '/api/diag': async () => { await delay(600); return json(DIAG_TEACHING); },
    '/api/login': async req => { loginBodies.push(JSON.parse(req.postData() || '{}')); await delay(700); online = true; return json({ok: true, zone: 'teaching', message: '认证成功'}); },
  }});
  await openApp(page, eng, '#network');
  await sleep(1200);
  // 页头与「当前连接」卡片都在一屏内。
  await page.evaluate(() => { const el = document.querySelector('.network-overview'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 96); });
  await sleep(600);
  const scrollY = await page.evaluate(() => scrollY);
  const overview = await rectOf(page, '.network-overview', 6);
  await still(page, OUT + '/ui_net_offline.png', {clip: overview});
  await still(page, OUT + '/ui_net_offline.viewport.png');
  const rects = {overview, summary: await rectOf(page, '#network-summary'), login: await rectOf(page, '.network-login'), diagButton: await rectOf(page, '[data-action="diagnose"]')};
  saveStillMeta('ui_net_offline', {file: 'ui_net_offline.png', extra: ['ui_net_offline.viewport.png'], description: '校园网 →「当前连接」卡片（合成状态，演示数据）：外网不可用 · 教学区（深澜 SRun），校园认证「门户未检测到在线会话。」。.viewport.png 为整屏（下方是展开的「连接 / 更换账号」表单）。', clipCss: overview, viewportRects: rects, scrollY, synthetic: '/api/status → online_known:true, online:false, internet_ok:false, zone teaching'});

  const actor = createActor(page);
  await actor.move(980, 560);
  {
    const tl = timeline(page, actor)
      .glide(0, 18, '[data-action="diagnose"]')
      .click(24)
      .glide(40, 40, {x: 1180, y: 600});
    const dir = await recordFrames(page, 'clip_net_diag', {frames: 180, onFrame: rec(tl)});
    recording = false;
    saveClip(dir, 'clip_net_diag', {
      description: '第 24 帧点「运行网络诊断」：先显示「正在检查网络与校园门户…」，约 0.6 s 后结果行出现（合成诊断数据）：「教学区（深澜 SRun） · 互联网：不可用 · 教学区门户：可达 · 宿舍区门户：未确认 · 你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，密码是统一身份认证密码 · …」，结尾是「校园网指南 ↗」。画面需常驻注脚「校园网认证仍在现场验收 · 画面为演示数据」。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects: {...rects, diagResult: await rectOf(page, '#diag-result')},
      synthetic: {'/api/diag': DIAG_TEACHING},
    }, {heroFrames: [40, 120]});
  }
  await page.evaluate(() => window.__promoClock.live());
  await sleep(300);
  // 让登录表单整块进入画面。
  await page.evaluate(() => { const el = document.querySelector('.network-login'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 96); });
  await sleep(600);
  const scrollY2 = await page.evaluate(() => scrollY);
  const loginRects = {login: await rectOf(page, '.network-login'), account: await rectOf(page, '#account'), password: await rectOf(page, '#password'), zone: await rectOf(page, '#zone'), submit: await rectOf(page, '#login-form button.primary')};
  await still(page, OUT + '/ui_net_login_form.png', {clip: await rectOf(page, '.network-login', 6)});
  saveStillMeta('ui_net_login_form', {file: 'ui_net_login_form.png', description: '「连接 / 更换账号」表单（未填写）：校园卡号、统一身份认证密码、所在区域「自动识别」（原生下拉，选项原文：自动识别 / 教学区 · 深澜 / 宿舍区 · Dr.COM）、「认证成功后记住账号密码」（不勾选）、「登录校园网」。', viewportRects: loginRects, scrollY: scrollY2});
  {
    const tl = timeline(page, actor)
      .glide(0, 16, '#account', {dx: -140})
      .click(20)
      .type(26, '123456', 6)
      .glide(64, 14, '#password', {dx: -140})
      .click(80)
      .type(86, 'demo-pass', 5)
      .glide(136, 18, '#login-form button.primary')
      .click(160)
      .glide(176, 40, {x: 1250, y: 760});
    const dir = await recordFrames(page, 'clip_net_login', {frames: 280, onFrame: rec(tl)});
    recording = false;
    saveClip(dir, 'clip_net_login', {
      description: '「连接 / 更换账号」：所在区域保持「自动识别」，第 26 帧起键入演示卡号 123456，第 86 帧起键入演示密码（显示为圆点），不勾选记住；第 160 帧点「登录校园网」→「正在认证，请稍候…」→ 约 0.7 s 后「认证成功」（合成接口），输入框清空，状态刷新为在线。区域下拉为原生控件，截不到展开态，S24 请按原文重建。',
      viewport: {...VP, scrollY: scrollY2}, events: actor.events.splice(0).map(e => e.type === 'key' && e.frame >= 86 && e.frame < 136 ? {...e, text: '•'} : e), cursor: actor.track.splice(0), rects: {...loginRects, result: await rectOf(page, '#network-result').catch(() => null)},
      synthetic: {'/api/login': {ok: true, zone: 'teaching', message: '认证成功'}},
    }, {heroFrames: [60, 130, 200, 260]});
  }
  log('login request zone', loginBodies.map(b => b.zone + '/' + (b.username ? 'demo' : '') + '/' + (b.password ? 'set' : '')));
  // 重新打开页面：清掉断网时的诊断结果行，只留在线状态。
  await openApp(page, eng, '#network');
  await sleep(1200);
  await page.evaluate(() => { const el = document.querySelector('.network-overview'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 96); });
  await sleep(1000);
  const overview2 = await rectOf(page, '.network-overview', 6);
  await still(page, OUT + '/ui_net_online.png', {clip: overview2});
  await still(page, OUT + '/ui_net_online.viewport.png');
  saveStillMeta('ui_net_online', {file: 'ui_net_online.png', extra: ['ui_net_online.viewport.png'], description: '登录后的「当前连接」卡片（合成状态，演示数据）：外网可用 · 教学区（深澜 SRun），校园认证「当前网络出口已在线。」。', clipCss: overview2, synthetic: '/api/status → online:true, internet_ok:true, online_zone teaching'});
} finally {
  await browser.__close();
  await eng.stop();
}
