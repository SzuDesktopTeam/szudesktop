// 课程笔记：书写模式键入一行 Markdown → 阅读模式展开本页大纲并跳转 → 选中一句转成学习待办。
import {startEngine, launchBrowser, newAppPage, openApp, recordFrames, saveClip, still, saveStillMeta, createActor, rectOf, sleep, log, OUT} from './lib/harness.mjs';
import {timeline} from './lib/timeline.mjs';
import {saveA, demoNotebook} from './lib/demo.mjs';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = k => !only || only.has(k);
const VP = {width: 1600, height: 900, deviceScaleFactor: 2};
const eng = await startEngine();
const browser = await launchBrowser();

async function openNotes() {
  await eng.setWorkspace(saveA());
  await eng.setNotebook(demoNotebook());
  const page = await newAppPage(browser, eng);
  await openApp(page, eng, '#study/notes');
  await page.waitForSelector('#note-body');
  await page.evaluate(() => { const el = document.querySelector('.notebook-layout'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 88); });
  await sleep(800);
  const scrollY = await page.evaluate(() => scrollY);
  const rects = {
    layout: await rectOf(page, '.notebook-layout'),
    shelf: await rectOf(page, '.notebook-layout > aside').catch(() => null),
    pages: await rectOf(page, '.note-pages').catch(() => null),
    paper: await rectOf(page, '#note-body').then(() => page.evaluate(() => { const el = document.querySelector('#note-body').closest('article, .note-paper, .note-editor') || document.querySelector('#note-body'); const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height}; })),
    textarea: await rectOf(page, '#note-body'),
  };
  return {page, scrollY, rects};
}
// 文本框里第 index 个字符在屏幕上的位置（镜像 div 测量，扣掉文本框自身的滚动）。
const charBox = (page, needle, offset = 0) => page.evaluate((t, off) => {
  const a = document.querySelector('#note-body'), cs = getComputedStyle(a), r = a.getBoundingClientRect();
  const index = a.value.indexOf(t) + off;
  const m = document.createElement('div');
  for (const p of ['boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize', 'wordBreak', 'fontVariantNumeric', 'fontFeatureSettings']) m.style[p] = cs[p];
  Object.assign(m.style, {position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', height: 'auto', overflow: 'hidden'});
  m.textContent = a.value.slice(0, index);
  const span = document.createElement('span'); span.textContent = a.value.slice(index, index + 1).replace('\n', '') || '\u200b'; m.appendChild(span);
  document.body.appendChild(m); const b = span.getBoundingClientRect(); m.remove();
  return {x: b.left, y: b.top - a.scrollTop + b.height / 2, w: b.width, h: b.height, index};
}, needle, offset);
// 把文本框光标放在某段文字之后（或选中它），并让它滚动到可见处。
const caretAfter = (page, text) => page.evaluate(t => { const a = document.querySelector('#note-body'); const i = a.value.indexOf(t); a.focus({preventScroll: true}); a.setSelectionRange(i + t.length, i + t.length); return i; }, text);

try {
  if (want('write')) {
    const {page, scrollY, rects} = await openNotes();
    await still(page, OUT + '/ui_note_desk.png');
    saveStillMeta('ui_note_desk', {file: 'ui_note_desk.png', description: '学习书屋 → 课程笔记整屏（书写模式，2x）：左为「我的课程书架」（全部笔记 / 高等数学 A / 数据结构 / 大学英语），中为页列表，右为「第三章 · 函数极限」课堂记录页。分层合成用的区域见 viewportRects。', viewportRects: rects, scrollY});
    const actor = createActor(page);
    await actor.move(1180, 760);
    const line = '- ε-δ 定义：任给 ε>0，存在 δ>0……';
    const tl = timeline(page, actor)
      .glide(0, 16, async () => { const b = await charBox(page, '左右极限都存在且相等 ⇔ 极限存在', '左右极限都存在且相等 ⇔ 极限存在'.length); return {x: b.x + 40, y: b.y}; })
      .click(18)
      .at(22, async () => { const ok = await page.evaluate(t => { const a = document.querySelector('#note-body'); return a.selectionStart === a.value.indexOf(t) + t.length; }, '左右极限都存在且相等 ⇔ 极限存在'); if (!ok) await caretAfter(page, '左右极限都存在且相等 ⇔ 极限存在'); actor.note('caret', {after: '左右极限都存在且相等 ⇔ 极限存在', native: ok}); })
      .press(26, 'Enter')
      .type(34, line, 6)
      .glide(34 + line.length * 6 + 6, 30, {x: 1280, y: 840});
    const frames = 34 + [...line].length * 6 + 60;
    const dir = await recordFrames(page, 'clip_note_write', {frames, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_note_write', {
      description: '课程笔记书写模式：第 18 帧点进正文，光标停在「- 左右极限都存在且相等 ⇔ 极限存在」行尾，第 26 帧回车，第 34 帧起每 6 帧（100 ms）一字键入「- ε-δ 定义：任给 ε>0，存在 δ>0……」（Markdown 原文），保存状态从「有待保存的修改…」回到「已保存到本机」。左侧书架、中间页列表、右侧正文三层的区域见 rects（供 3D 分层视差）。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects,
    }, {heroFrames: [60, frames - 20]});
    await page.close();
  }

  if (want('outline')) {
    const {page, scrollY, rects} = await openNotes();
    const actor = createActor(page);
    await actor.move(1100, 700);
    const tl = timeline(page, actor)
      .glide(0, 16, '[data-note-action="mode"][data-mode="read"]')
      .click(20)
      .glide(36, 18, '.note-outline > summary')
      .click(58)
      .glide(72, 20, '.note-outline-list [data-note-action="outline"][data-index="2"]')
      .click(100)
      .glide(112, 30, {x: 1300, y: 640});
    const dir = await recordFrames(page, 'clip_note_outline', {frames: 180, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_note_outline', {
      description: '同一页：第 20 帧切到「阅读」排版（Markdown 渲染），第 58 帧展开「本页大纲 · 4 个章节」（今天的主题 / 重点与例子 / 还没弄懂 / 课后要做），第 100 帧点「还没弄懂」，页面跳到该标题。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects,
    }, {heroFrames: [40, 90, 150]});
    await page.close();
  }

  if (want('todo')) {
    const {page, scrollY, rects} = await openNotes();
    const target = '课后做完习题 3.2';
    // 先让「课后要做」一段滚到文本框可见处。
    await page.evaluate(t => { const a = document.querySelector('#note-body'); const i = a.value.indexOf(t); a.focus({preventScroll: true}); a.setSelectionRange(i, i); a.blur(); const lh = parseFloat(getComputedStyle(a).lineHeight) || 28; const lines = a.value.slice(0, i).split('\n').length; a.scrollTop = Math.max(0, (lines - 3) * lh); }, target);
    await sleep(300);
    const actor = createActor(page);
    await actor.move(1050, 760);
    const n = [...target].length;
    const first = await charBox(page, target, 0), last = await charBox(page, target, n - 1);
    log('select from', first, 'to', last);
    const startPt = {x: first.x + first.w * 0.25, y: first.y}, endPt = {x: last.x + last.w + 24, y: last.y};
    const tl = timeline(page, actor)
      .glide(0, 18, startPt)
      .at(22, () => actor.down());
    for (let k = 1; k <= n * 2; k++) tl.at(22 + k, () => actor.move(startPt.x + (endPt.x - startPt.x) * k / (n * 2), startPt.y));
    tl.at(22 + n * 2 + 2, async () => { await actor.up(); const sel = await page.evaluate(() => { const a = document.querySelector('#note-body'); return a.value.slice(a.selectionStart, a.selectionEnd); }); actor.note('selected', {text: sel}); log('native selection', JSON.stringify(sel)); if (sel !== target) await page.evaluate(t => { const a = document.querySelector('#note-body'); const i = a.value.indexOf(t); a.setSelectionRange(i, i + t.length); }, target); })
      .glide(22 + n * 2 + 10, 22, '[data-note-action="task"]')
      .click(22 + n * 2 + 40)
      .glide(22 + n * 2 + 56, 30, {x: 1300, y: 840});
    const dir = await recordFrames(page, 'clip_note_to_todo', {frames: 22 + n * 2 + 130, onFrame: i => tl.run(i)});
    saveClip(dir, 'clip_note_to_todo', {
      description: '书写模式：第 22 帧在正文里按下鼠标，向右拖选「课后做完习题 3.2」（真实拖选），第 ' + (22 + n * 2 + 40) + ' 帧点工具栏「选中 → 待办」（按钮提示：把选中的一句话加入学习待办），底部提示「已加入学习待办，可以接着写」。这件小事随即写进庭院存档的待办清单。',
      viewport: {...VP, scrollY}, events: actor.events.splice(0), cursor: actor.track.splice(0), rects: {...rects, taskButton: await rectOf(page, '[data-note-action="task"]')},
    }, {heroFrames: [22 + n * 2 + 4, 22 + n * 2 + 80]});
    const todos = (await eng.getWorkspace()).todos.map(t => t.text);
    log('todos', todos);
    await page.close();
  }
} finally {
  await browser.__close();
  await eng.stop();
}
