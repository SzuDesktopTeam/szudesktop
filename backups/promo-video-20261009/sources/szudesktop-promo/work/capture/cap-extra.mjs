// 额外素材：另两套风景的首页整屏、首页实况（风景与伙伴在动）、首页一键换风景、伙伴小屋摸摸头与拿手动作。
import {startEngine, launchBrowser, newAppPage, openApp, recordFrames, saveClip, still, saveStillMeta, createActor, rectOf, sleep, log, OUT} from './lib/harness.mjs';
import {timeline} from './lib/timeline.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = k => !only || only.has(k);
const VP = {width: 1600, height: 900, deviceScaleFactor: 2};
const eng = await startEngine();
const browser = await launchBrowser();
const sceneReady = page => page.waitForFunction(() => document.querySelector('[data-home-scene]')?.dataset.sceneState === 'ready', {timeout: 30000});
try {
  await eng.setNotebook(demoNotebook());

  if (want('skins')) {
    for (const [skin, name] of [['bookshop', '雨后书屋'], ['terrace', '蓝调晚庭']]) {
      const s = saveA(); s.preferences.homeSkin = skin;
      await eng.setWorkspace(s);
      const page = await newAppPage(browser, eng);
      await openApp(page, eng, '#home');
      await sceneReady(page);
      await sleep(1500);
      await page.mouse.move(1599, 899);
      const key = 'ui_home_' + skin;
      await still(page, `${OUT}/${key}.png`);
      const land = await rectOf(page, '.home-landscape');
      await still(page, `${OUT}/${key}.landscape.png`, {clip: land});
      saveStillMeta(key, {file: key + '.png', extra: [key + '.landscape.png'], description: `「今日」首页整屏，风景选「${name}」（真实 WebGL 渲染）。可与 ui_home_lake、ui_home_pixel 组成 S15 的四宫格「三套风景 + 像素庭院，整个应用一起换」。`, viewportRects: {landscape: land}});
      await page.close();
    }
  }

  if (want('live')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#home');
    await sceneReady(page);
    await sleep(1200);
    await page.mouse.move(1599, 899);
    const dir = await recordFrames(page, 'clip_home_lake_live', {frames: 240});
    saveClip(dir, 'clip_home_lake_live', {description: '「今日」首页实况 4 s（无操作）：荔湖晴昼风景照常动画（湖面波纹、棕榈摆动，应用本身以 30fps 重绘），右下角荔宝按自己的节奏播放待机动作。可替代 ui_home_lake 作为桌面窗口里「活的」画面。', viewport: {...VP, scrollY: 0}}, {heroFrames: [120]});
    await page.close();
  }

  if (want('switch')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#home');
    await sceneReady(page);
    await page.evaluate(() => { const el = document.querySelector('.home-skin-picker'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80); });
    await sleep(800);
    const scrollY = await page.evaluate(() => scrollY);
    const actor = createActor(page);
    await actor.move(1300, 700);
    const tl = timeline(page, actor)
      .glide(0, 18, '#home-skin-summary')
      .click(24)
      .glide(36, 20, '[data-action="homeSkin"][data-skin="bookshop"]')
      .click(62)
      .glide(76, 24, {x: 1300, y: 640})
      .glide(150, 20, '#home-skin-summary')
      .click(174)
      .glide(186, 20, '[data-action="homeSkin"][data-skin="terrace"]')
      .click(212)
      .glide(226, 24, {x: 1300, y: 640});
    const dir = await recordFrames(page, 'clip_home_skin_switch', {frames: 330, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_home_skin_switch', {description: '首页「我的庭院 · 更换环境」：第 24 帧展开风景选择（像素庭院 / 荔湖晴昼 / 雨后书屋 / 蓝调晚庭），第 62 帧选「雨后书屋」，整页风景与配色随之换装；第 174 帧再展开，第 212 帧选「蓝调晚庭」。真实 WebGL 风景在切换后几帧内展开（中间会短暂出现「正在展开校园小景…」）。', viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0)}, {heroFrames: [50, 140, 300]});
    await page.close();
  }

  if (want('pet')) {
    await eng.setWorkspace(saveA());
    const page = await newAppPage(browser, eng);
    await openApp(page, eng, '#garden/pet');
    await page.evaluate(() => { const el = document.querySelector('.pet-living'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 90); });
    await sleep(800);
    const scrollY = await page.evaluate(() => scrollY);
    const rects = {living: await rectOf(page, '.pet-living'), portrait: await rectOf(page, '.pet-living [data-animated-pet]').catch(() => null)};
    const actor = createActor(page);
    await actor.move(900, 700);
    const tl = timeline(page, actor)
      .glide(0, 18, '.pet-living [data-action="pat"]')
      .click(26)
      .glide(40, 30, {x: 900, y: 640})
      .glide(140, 22, '[data-action="petSignature"]')
      .click(170)
      .glide(186, 30, {x: 1250, y: 700});
    const dir = await recordFrames(page, 'clip_pet_room_care', {frames: 340, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_pet_room_care', {description: '荔枝庭院 → 伙伴小屋：第 26 帧点「摸摸头」，荔宝播 pat 动作，台词「嘿嘿，叶子都被你摸歪啦。」；第 170 帧点「给你加个油」，荔宝播拿手动作（举小牌加油）。右侧是性格卡（热情 / 爱张罗 / 有点冒失）。可作 S06 的应用内对照镜头。', viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects}, {heroFrames: [50, 220, 300]});
    await page.close();
  }
} finally {
  await browser.__close();
  await eng.stop();
}
