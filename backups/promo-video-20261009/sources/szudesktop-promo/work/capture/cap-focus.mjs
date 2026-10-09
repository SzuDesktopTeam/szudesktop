// 专注换奖励：写一件小事 → 选中它开始 25 分钟 → 延时走完 → 领取奖励 → 本周柱状图。
import {startEngine, launchBrowser, newAppPage, openApp, recordFrames, saveClip, saveStillMeta, still, createActor, rectOf, sleep, log, OUT} from './lib/harness.mjs';
import {timeline} from './lib/timeline.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const eng = await startEngine();
const browser = await launchBrowser();
try {
  await eng.setWorkspace(saveA());
  await eng.setNotebook(demoNotebook());
  const page = await newAppPage(browser, eng);
  await openApp(page, eng, '#study/focus');
  await page.evaluate(() => window.scrollTo(0, 310));
  await sleep(800);
  const actor = createActor(page);
  await actor.move(1180, 760);
  const rects = async () => ({
    focusCard: await rectOf(page, '.focus-studio'),
    todoCard: await rectOf(page, '.focus-layout > section.card:nth-of-type(2)').catch(() => null),
    clock: await rectOf(page, '#focus-clock'),
    input: await rectOf(page, '#todo-text'),
  });
  const before = await rects();

  // ① clip_focus_todo_add：117 ms/字键入「复习高数第三章」，然后点「添加」。
  {
    const tl = timeline(page, actor)
      .glide(0, 16, '#todo-text', {dx: -120})
      .click(20)
      .type(28, '复习高数第三章', 7)
      .glide(84, 18, '#todo-form button.primary')
      .click(112);
    const dir = await recordFrames(page, 'clip_focus_todo_add', {frames: 180, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_focus_todo_add', {
      description: '学习书屋 → 专注与小事：在「留一件值得完成的小事」输入框以 7 帧/字（≈117 ms，16 分音符）键入「复习高数第三章」，第 112 帧按下「添加」，新条目出现在待完成列表末尾。视口已下滚 310px，左为专注卡、右为「我的小事」。',
      viewport: {width: 1600, height: 900, deviceScaleFactor: 2, scrollY: 310},
      events: actor.events.splice(0), cursor: actor.track.splice(0), rects: before,
    }, {heroFrames: [70, 150]});
  }

  // ② clip_focus_start_timelapse：选中这件小事，点「25 分钟」，再以 ×600 延时把 25:00 走到 00:00。
  {
    const todoId = (await eng.getWorkspace()).todos.find(t => t.text === '复习高数第三章')?.id;
    if (!todoId) throw new Error('new todo not saved');
    let end = 0, timelapseFrom = 0;
    const tl = timeline(page, actor)
      .glide(0, 14, '#focus-task')
      .at(16, () => actor.note('click', {x: actor.cursor.x, y: actor.cursor.y, target: '#focus-task'}))
      .at(22, async () => { await page.select('#focus-task', todoId); actor.note('select', {value: '复习高数第三章'}); })
      .glide(28, 14, '[data-action="focusStart"][data-minutes="25"]')
      .click(46)
      .at(58, async () => { end = (await eng.getWorkspace()).game.focus?.end || 0; if (!end) throw new Error('focus not started'); timelapseFrom = 64; actor.note('timelapse-start', {focusEnd: end}); })
      .glide(64, 40, {x: 1240, y: 820});
    let reached = -1;
    const dir = await recordFrames(page, 'clip_focus_start_timelapse', {
      frames: 228, onFrame: i => tl.run(i),
      stepOptions: async i => {
        if (!end || i < timelapseFrom || reached >= 0) return null;
        const wall = await page.evaluate(() => window.__promoClock.wall);
        const left = end - wall - 1000 / 60;
        if (left <= 10000) { reached = i; actor.note('timelapse-end', {frame: i}); return {wallExtra: Math.max(0, left), fireEvery: 1000}; }
        return {wallExtra: 10000, fireEvery: 1000};
      },
    });
    saveClip(dir, 'clip_focus_start_timelapse', {
      description: '「这次想做什么？」选中「复习高数第三章」（原生下拉框不入画，第 22 帧直接换值），第 46 帧点「25 分钟」开始专注；第 64 帧起墙钟按 ×600 推进（每帧 +10 s），计时器从 25:00 连续走到 00:00（约第 214 帧到点），到点后「完成并领取奖励」变为可点，底部弹出提示「专注完成啦，回到学习书屋领取奖励吧。」。页头出现「专注中 · mm:ss」活动条。',
      viewport: {width: 1600, height: 900, deviceScaleFactor: 2, scrollY: 310},
      timelapse: {fromFrame: timelapseFrom, endFrame: reached, wallPerFrameMs: 10000 + 1000 / 60},
      events: actor.events.splice(0), cursor: actor.track.splice(0), rects: await rects(),
    }, {heroFrames: [60, 120, 180]});
  }

  // ③ clip_focus_claim：点「完成并领取奖励」，录到奖励提示完整显示。
  {
    const tl = timeline(page, actor)
      .glide(0, 18, '#focus-claim')
      .click(26);
    const dir = await recordFrames(page, 'clip_focus_claim', {frames: 150, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_focus_claim', {
      description: '第 26 帧点「完成并领取奖励」，应用真实奖励提示「完成 25 分钟专注 · 荔枝币 +25 · 荔宝成长 +25」从底部弹出；专注卡回到可开始状态，累计分钟数更新。',
      viewport: {width: 1600, height: 900, deviceScaleFactor: 2, scrollY: 310},
      events: actor.events.splice(0), cursor: actor.track.splice(0),
      toastRect: await rectOf(page, '#toast').catch(() => null),
    }, {heroFrames: [60, 110]});
  }

  // ④ ui_focus_week：本周柱状图（含刚领取的 25 分钟）。
  await page.evaluate(() => window.__promoClock.live());
  await sleep(5200);
  let week = null;
  for (let tries = 0; tries < 10; tries++) {
    await page.evaluate(() => document.querySelector('.weekly-card')?.scrollIntoView({block: 'center'}));
    await sleep(600);
    week = await rectOf(page, '.weekly-card', 8);
    log('week rect', week);
    if (week.height > 50 && week.y >= 0 && week.y + week.height <= 900) break;
  }
  await still(page, OUT + '/ui_focus_week.png', {clip: week});
  const ws = await eng.getWorkspace();
  saveStillMeta('ui_focus_week', {file: 'ui_focus_week.png', description: '「这一周，慢慢积累」卡片区域截图（2x）：近 7 天 25 / 45 / 30 / 25 / — / 50 / 25 分钟（最后一根是刚领取的今天），合计 ' + ws.game.focusHistory.slice(0, 6).reduce((n, x) => n + x.minutes, 0) + ' 分钟。', clipCss: week});
  log('coins after claim', ws.game.coins, 'xp', ws.game.pets[0].xp);
} finally {
  await browser.__close();
  await eng.stop();
}
