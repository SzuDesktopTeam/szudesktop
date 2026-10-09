// 静帧：首页（Windows / macOS 文案 / 像素庭院）、学校公告学院列表、官方校历教学周、设置（存档与隐私、伙伴大小）。
import {startEngine, launchBrowser, newAppPage, openApp, still, saveStillMeta, rectOf, sleep, log, OUT, fontAudit} from './lib/harness.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = k => !only || only.has(k);
const eng = await startEngine();
const browser = await launchBrowser();
const sectionRect = (page, heading, pad = 6) => page.evaluate((h, p) => {
  const el = [...document.querySelectorAll('#main section.card, #main .card')].find(s => s.querySelector('h2')?.textContent.includes(h));
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return {x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p};
}, heading, pad);
const scrollToRect = (page, selectorOrHeading, top = 96) => page.evaluate((s, t) => {
  const el = document.querySelector(s) || [...document.querySelectorAll('#main section.card, #main .card')].find(x => x.querySelector('h2')?.textContent.includes(s));
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - t);
}, selectorOrHeading, top);

try {
  await eng.setNotebook(demoNotebook());
  async function home(key, {platform = 'win32', skin = 'lake', note}) {
    const s = saveA();
    s.preferences.homeSkin = skin;
    await eng.setWorkspace(s);
    const page = await newAppPage(browser, eng, {platform});
    await openApp(page, eng, '#home');
    if (skin !== 'pixel') await page.waitForFunction(() => document.querySelector('[data-home-scene]')?.dataset.sceneState === 'ready', {timeout: 30000});
    await sleep(1500);
    await page.mouse.move(1599, 899);
    await sleep(200);
    await still(page, `${OUT}/${key}.png`);
    const rects = {
      landscape: await rectOf(page, '.home-landscape').catch(() => null),
      scene: await rectOf(page, '[data-home-scene]').catch(() => null),
      letter: await rectOf(page, '.home-letter').catch(() => null),
      nav: await rectOf(page, '#nav').catch(() => null),
      mast: await rectOf(page, 'header.mast').catch(() => null),
      shell: await rectOf(page, '.shell').catch(() => null),
      learnNav: await page.evaluate(() => { const el = [...document.querySelectorAll('#nav [data-page="study"]')][0]; if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; }),
    };
    if (rects.landscape) await still(page, `${OUT}/${key}.landscape.png`, {clip: rects.landscape});
    const fonts = await fontAudit(page, '#main *', 80);
    saveStillMeta(key, {file: key + '.png', extra: rects.landscape ? [key + '.landscape.png'] : [], description: note, viewport: {width: 1600, height: 900, deviceScaleFactor: 2, scrollY: 0}, viewportRects: rects, fontsSample: fonts});
    await page.close();
  }
  if (want('home')) {
    await home('ui_home_lake', {note: '「今日」首页整屏（Windows 安装版界面，3200×1800）：荔湖晴昼风景（真实三渲二 WebGL 渲染）、「欢迎回来，庭院在等你。」、右下角荔宝「点点我 · 摸摸头」。顶栏版本号为引擎真实值 beta0.9.7。套通用窗口框用于 S04/S07/S26；S07 穿屏推入「学习书屋」导航块的位置见 viewportRects.learnNav。'});
    await home('ui_home_lake_mac', {platform: 'darwin', note: '同 ui_home_lake，桥接替身 platform=darwin（macOS 预览版文案）。用于 S26 右侧 Mac 风窗口。'});
    await home('ui_home_pixel', {skin: 'pixel', note: '「今日」首页整屏，风景选「像素庭院」（campus.png 像素画背景）。用于 S15 四宫格。'});
  }

  if (want('notices')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#services/notices');
    await page.waitForSelector('#feed-source');
    await scrollToRect(page, '#notice-panel');
    await sleep(800);
    const panel = await rectOf(page, '#notice-panel', 6);
    await still(page, OUT + '/ui_services_notices.png', {clip: panel});
    const sources = await eng.api('/api/campus/notice-sources');
    // 原生下拉截不到展开态：把同一个 <select> 临时以列表框（size）显示，露出真实的学院名单。
    await page.evaluate(() => { const s = document.querySelector('#feed-source'); s.size = 14; s.style.height = 'auto'; s.scrollTop = 0; });
    await sleep(400);
    await scrollToRect(page, '#notice-panel');
    await sleep(400);
    const panel2 = await rectOf(page, '#notice-panel', 6);
    await still(page, OUT + '/ui_services_notices.list.png', {clip: panel2});
    saveStillMeta('ui_services_notices', {file: 'ui_services_notices.png', extra: ['ui_services_notices.list.png'], description: '校园服务 → 学校公告：未选学院时的「先选你的学院」卡片（不出现任何公告标题，/api/campus/notices 全部拦截）。.list.png 把同一个「学院／部门」下拉临时以列表框展开，露出真实的公告来源名单（全校通知 / 学院与学部）。完整名单见 sources。', clipCss: panel, sources: sources.sources.map(s => ({id: s.id, name: s.name, group: s.group, readable: !!s.readable}))});
    await page.close();
  }

  if (want('calendar')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#study/timetable');
    await page.waitForFunction(() => document.body.textContent.includes('第 7 周'), {timeout: 15000});
    await scrollToRect(page, '本学期', 120);
    await sleep(800);
    const card = await sectionRect(page, '本学期');
    await still(page, OUT + '/ui_study_calendar_strip.png', {clip: card});
    saveStillMeta('ui_study_calendar_strip', {file: 'ui_study_calendar_strip.png', description: '学习书屋 → 我的课表里的「本学期 · 官方校历」卡片（只截这一张，课表登录卡片不入镜）：第 7 周 · 2026–2027 学年第一学期 · 学期 2026-08-28 — 2027-01-22。校历数据为应用内置的已核实学期（合成接口返回，演示日 10-13）。', clipCss: card});
    await page.close();
  }

  if (want('settings')) {
    await eng.setWorkspace(saveA());
    let page = await newAppPage(browser, eng, {css: 'label[for="import-file"], #import-file, #import-file + small { display: none !important; }'});
    await openApp(page, eng, '#settings/data');
    await sleep(800);
    await page.evaluate(() => { const el = document.querySelector('.settings-layout'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 96); });
    await sleep(500);
    const layout = await rectOf(page, '.settings-layout', 8);
    await still(page, OUT + '/ui_settings_data.png', {clip: layout});
    await still(page, OUT + '/ui_settings_data.viewport.png');
    saveStillMeta('ui_settings_data', {file: 'ui_settings_data.png', extra: ['ui_settings_data.viewport.png'], description: '设置 → 存档与隐私（Windows 界面）：「存档与备份」（导出庭院与待办 / 备份课程笔记 / 存档默认位于用户目录下的 .szunet / workspace-v1.json）与「账号隐私」（删除已保存凭据；本机没有保存凭据时按钮为禁用态）。注意：采集时隐藏了中间「从备份恢复」的文件选择行——headless Chrome 只能把这个系统控件画成英文「Choose File」，与中文系统上的实际样子不符。', clipCss: layout});
    await page.close();

    page = await newAppPage(browser, eng, {petScale: 1.5});
    await openApp(page, eng, '#settings/desktop');
    await page.waitForFunction(() => document.querySelector('#pet-scale-value')?.textContent === '150%', {timeout: 10000});
    await page.evaluate(() => { const el = document.querySelector('#pet-scale').closest('section'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 120); });
    await sleep(500);
    const card = await page.evaluate(() => { const sec = document.querySelector('#pet-scale').closest('section'); const parts = [sec.querySelector('h2'), document.querySelector('label[for="pet-scale"]'), document.querySelector('#pet-scale'), document.querySelector('#pet-scale-value')].map(e => e.getBoundingClientRect()); const s = sec.getBoundingClientRect(); const top = Math.min(...parts.map(b => b.top)) - 16, bottom = Math.max(...parts.map(b => b.bottom)) + 14; return {x: s.x, y: top, width: s.width, height: bottom - top}; });
    await still(page, OUT + '/ui_settings_desktop.png', {clip: card});
    const full = await page.evaluate(() => { const b = document.querySelector('#pet-scale').closest('section').getBoundingClientRect(); return {x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12}; });
    await still(page, OUT + '/ui_settings_desktop.card.png', {clip: full});
    saveStillMeta('ui_settings_desktop', {file: 'ui_settings_desktop.png', extra: ['ui_settings_desktop.card.png'], description: '设置 → 桌面陪伴 →「桌面伙伴」卡片的「伙伴大小」滑杆，桥接替身返回 1.5，显示 150%（S05 的 HUD 背板，可选）。.card.png 为整张卡片（含「拖动伙伴可以移动位置，悬停时滚轮每次调整 10%；也可以用滑杆在 40–200% 之间细调」原文）。', clipCss: card});
    await page.close();
  }
} finally {
  await browser.__close();
  await eng.stop();
}
