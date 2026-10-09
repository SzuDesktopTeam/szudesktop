// 庭院：农田总览与收获、湖畔野餐角建设、伙伴小桌 2048（合成丰收礼、领取备种礼）。
import {startEngine, launchBrowser, newAppPage, openApp, recordFrames, saveClip, saveStillMeta, still, createActor, rectOf, sleep, log, OUT} from './lib/harness.mjs';
import {timeline} from './lib/timeline.mjs';
import {saveA, saveB, withWonPuzzle, withAlmostPuzzle, demoNotebook, SRC} from './lib/demo.mjs';
import {pathToFileURL} from 'node:url';
const loop = await import(pathToFileURL(SRC + '/desktop/assets/garden/garden-loop.mjs').href);

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = k => !only || only.has(k);
const VP = {width: 1600, height: 900, deviceScaleFactor: 2};

const eng = await startEngine();
const browser = await launchBrowser();
try {
  await eng.setNotebook(demoNotebook());

  // ———————— 农田：总览 + 收获 ————————
  if (want('farm')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#garden/farm');
    await page.evaluate(() => window.scrollTo(0, 340));
    await sleep(1500);
    const farmMain = await rectOf(page, '.farm-main', 6);
    await still(page, OUT + '/ui_farm_overview.png', {clip: farmMain});
    await still(page, OUT + '/ui_farm_overview.viewport.png');
    const rects = {farmMain, landscape: await rectOf(page, '.farm-landscape'), controls: await rectOf(page, '#farm-controls'), plots: await page.evaluate(() => [...document.querySelectorAll('[data-farm-plot]')].map(el => { const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; }))};
    saveStillMeta('ui_farm_overview', {file: 'ui_farm_overview.png', extra: ['ui_farm_overview.viewport.png'], description: '荔枝庭院 → 我的农田：「湖畔的六块小田」卡片区域（2x）。田1、田2 小萝卜成熟（带闪光），田3 草莓已浇水（还需 02:xx），田4 蓝莓生长中，田5 空地，田6 未开垦；左上角荔宝在田边（「荔宝陪你照料小田」小气泡）。.viewport.png 是同一时刻的整屏（下滚 340px，含右侧「我的农具箱」）。', clipCss: farmMain, viewportRects: rects, scrollY: 340});

    const actor = createActor(page);
    await actor.move(1040, 720);
    const tl = timeline(page, actor)
      .glide(0, 18, '[data-farm-plot="0"]')
      .click(22)
      .glide(34, 18, '#farm-plot-actions [data-action="harvest"]')
      .click(58)
      .glide(70, 30, {x: 1180, y: 860});
    const dir = await recordFrames(page, 'clip_farm_harvest', {frames: 210, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_farm_harvest', {
      description: '我的农田：第 22 帧点田 1（成熟小萝卜），第 58 帧在「我的农具箱」点「收获 ×2」。田 1 变回空地，底部弹出真实奖励提示「收获入仓 · 小萝卜 +2 · 荔宝成长 +1」，田边荔宝播 harvest 动作，小气泡换成「满满一小篮！我负责扶稳，你来放。」，右侧收获篮小萝卜 ×1→×3。视口下滚 340px。',
      viewport: {...VP, scrollY: 340}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects,
    }, {heroFrames: [30, 90, 150]});
    await page.close();
  }

  // ———————— 建设：湖畔野餐角 ————————
  if (want('build')) {
    await eng.setWorkspace(saveB());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#garden/journal');
    await page.evaluate(() => { const el = document.getElementById('garden-projects'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 160); });
    await sleep(1200);
    const scrollY = await page.evaluate(() => scrollY);
    const card = await rectOf(page, '#garden-projects', 6);
    await still(page, OUT + '/ui_build_picnic_ready.png', {clip: card});
    saveStillMeta('ui_build_picnic_ready', {file: 'ui_build_picnic_ready.png', description: '回忆与建设：「下一处小变化 · 湖畔野餐角」卡片（材料已齐：小萝卜 6/4、草莓 3/2、荔枝币 120/60、收获 3/3 次），右下是「布置湖畔野餐角 →」按钮。clip_build_picnic 的第 0 帧状态。', clipCss: card});
    const actor = createActor(page);
    await actor.move(900, 700);
    const tl = timeline(page, actor)
      .glide(0, 20, '[data-action="decor"][data-id="picnic"].primary')
      .click(28)
      .glide(44, 30, {x: 1250, y: 820});
    const dir = await recordFrames(page, 'clip_build_picnic', {frames: 180, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_build_picnic', {
      description: '荔枝庭院 → 回忆与建设：第 28 帧点「布置湖畔野餐角 →」，提示「湖畔野餐角建好啦 · 小萝卜 −4、草莓 −2 · 荔枝币 −60 · 小屋与湖畔已经有了新的样子」，卡片换成下一项「窗边育苗架」。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects: {card},
    }, {heroFrames: [40, 100]});
    await page.evaluate(() => window.__promoClock.live());
    await sleep(500);
    // 建成后的农田场景
    await page.evaluate(() => { location.hash = '#garden/farm'; });
    await sleep(1500);
    await page.evaluate(() => window.scrollTo(0, 340));
    await sleep(1000);
    const land = await rectOf(page, '.farm-landscape', 0);
    await still(page, OUT + '/ui_farm_picnic_built.png', {clip: land});
    await still(page, OUT + '/ui_farm_picnic_built.viewport.png');
    const built = await page.evaluate(() => { const el = document.querySelector('.garden-built-scene--farm'); if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height, html: el.outerHTML.slice(0, 200)}; });
    saveStillMeta('ui_farm_picnic_built', {file: 'ui_farm_picnic_built.png', extra: ['ui_farm_picnic_built.viewport.png'], description: '建好湖畔野餐角后的农田场景（.farm-landscape 区域，2x）：野餐毯与点心篮出现在湖畔菜园里。', clipCss: land, builtSceneRect: built});
    await page.close();
  }

  // ———————— 伙伴小桌 2048 ————————
  if (want('arcade')) {
    const base = saveA();
    // 让备种礼给的是草莓种子：清掉草莓库存与种子后，野餐角缺草莓，puzzleSupply 会选草莓。
    base.game.stock.strawberry = 0; base.game.seeds.strawberry = 0;
    const won = withWonPuzzle(base);
    log('supply', loop.puzzleSupply(won.game));

    // a) 真实走子：两枚 1024 左滑合成「荔宝丰收礼」2048
    await eng.setWorkspace(withAlmostPuzzle(base));
    let page = await newAppPage(browser, eng);
    await openApp(page, eng, '#garden/arcade');
    await page.evaluate(() => { const el = document.querySelector('.arcade-board-top') || document.querySelector('.arcade-board'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 104); });
    await sleep(1200);
    let scrollY = await page.evaluate(() => scrollY);
    let actor = createActor(page);
    await actor.move(700, 640);
    let tl = timeline(page, actor)
      .glide(0, 20, '.arcade-move[data-dir="left"]')
      .click(30)
      .glide(50, 40, {x: 1180, y: 700});
    let dir = await recordFrames(page, 'clip_arcade_merge_2048', {frames: 210, onFrame: i => tl.run(i)});
    const arcadeRects = {heading: await rectOf(page, '.arcade-heading'), scores: await rectOf(page, '.arcade-scores'), board: await rectOf(page, '.arcade-board'), table: await rectOf(page, '.arcade-table').catch(() => null), side: await rectOf(page, '.arcade-side').catch(() => null), feedback: await rectOf(page, '.arcade-feedback')};
    saveClip(dir, 'clip_arcade_merge_2048', {
      description: '伙伴小桌 2048 的真实走子（额外素材）：第一行两枚「荔枝篮 1024」，第 30 帧点「←」，两枚相撞合成「荔宝丰收礼 2048」，棋盘下方提示变成「荔宝丰收礼合成啦！已经达到 2048，还可以继续挑战自己的纪录。」，右侧荔宝播 celebrate。右上角有本局得分/最高纪录（rects.scores），合成时请裁掉。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects: arcadeRects,
    }, {heroFrames: [36, 60, 120]});
    await page.close();

    // b) 已合出 2048 的棋盘 + 领取备种礼
    await eng.setWorkspace(won);
    page = await newAppPage(browser, eng);
    await openApp(page, eng, '#garden/arcade');
    await page.evaluate(() => { const el = document.querySelector('.arcade-board-top') || document.querySelector('.arcade-board'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 104); });
    await sleep(1500);
    scrollY = await page.evaluate(() => scrollY);
    const board = await page.evaluate(() => {
      const els = ['.arcade-board-top', '.arcade-board', '.arcade-harvest-trail', '.arcade-feedback'].map(s => document.querySelector(s)).filter(Boolean);
      const bs = els.map(e => e.getBoundingClientRect());
      const x = Math.min(...bs.map(b => b.left)) - 12, y = Math.min(...bs.map(b => b.top)) - 12;
      return {x, y, width: Math.max(...bs.map(b => b.right)) + 12 - x, height: Math.max(...bs.map(b => b.bottom)) + 12 - y};
    });
    log('arcade union', board);
    await still(page, OUT + '/ui_arcade_won.png', {clip: board});
    await still(page, OUT + '/ui_arcade_won.grid.png', {clip: await rectOf(page, '.arcade-board', 2)});
    await still(page, OUT + '/ui_arcade_won.viewport.png');
    const rects = {board, heading: await rectOf(page, '.arcade-heading'), scores: await rectOf(page, '.arcade-scores'), side: await rectOf(page, '.arcade-side').catch(() => null), claim: await rectOf(page, '.arcade-claim'), supply: await rectOf(page, '.arcade-supply').catch(() => null)};
    saveStillMeta('ui_arcade_won', {file: 'ui_arcade_won.png', extra: ['ui_arcade_won.viewport.png', 'ui_arcade_won.grid.png'], description: '伙伴小桌：已合出「荔宝丰收礼 2048」的棋盘卡片（只含棋盘、「这局合到了」与提示「荔宝丰收礼合成啦！已经达到 2048，还可以继续挑战自己的纪录。」，不含本局得分与最高纪录）。.grid.png 只有 4×4 棋盘；.viewport.png 是整屏，右上角得分栏位置见 viewportRects.scores，使用整屏时请裁掉。', clipCss: board, viewportRects: rects, scrollY});
    actor = createActor(page);
    await actor.move(760, 600);
    tl = timeline(page, actor)
      .glide(0, 22, '.arcade-claim')
      .click(30)
      .glide(48, 30, {x: 1250, y: 820});
    dir = await recordFrames(page, 'clip_arcade_claim', {frames: 180, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_arcade_claim', {
      description: '伙伴小桌：第 30 帧点「领取种子与小礼」，提示「备种礼已收进背包 · 草莓种子 +1 · 荔枝币 +8 · 荔宝成长 +3 · 亲密 +2」，按钮变成「今天已领取」并出现去播种的按钮；荔宝播 gift 动作。左侧棋盘为已合出 2048 的局面；右上角得分栏见 rects.scores（需要时裁掉）。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects,
    }, {heroFrames: [60, 120]});
    await page.close();
  }
} finally {
  await browser.__close();
  await eng.stop();
}
