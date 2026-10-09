// 演示存档（全部为合成数据）：用应用自己的 engine.mjs 生成并校验，保证结构合法。
// 不含任何真实姓名、学号或账号。昵称「小荔」。
import {pathToFileURL} from 'node:url';
export const SRC = '/Users/alakazan/workplace/szudesktop-promo-src';
const G = SRC + '/desktop/assets/garden/';
const engine = await import(pathToFileURL(G + 'engine.mjs').href);
const {createState, normalize, act, dayKey, CROPS} = engine;
const dialogue = await import(pathToFileURL(G + 'pet-dialogue.mjs').href);

// 让下一次某个情境的台词正好是指定的那句：按 pickPetDialogue 的确定性洗牌算出游标。
export function presetLine(s, species, context, text) {
  const g = s.game, p = g.pets.find(x => x.species === species);
  const pool = dialogue.PET_DIALOGUE[species][context];
  for (let cursor = 0; cursor < pool.length * 2; cursor++) {
    const pick = dialogue.pickPetDialogue(species, context, {cursor, last: p.say, seed: g.created});
    if (pick.text === text) { p.dialogue = {...(p.dialogue || {}), [context]: cursor}; return s; }
  }
  throw new Error('line not found ' + text);
}
const LINES = [
  ['libao', 'harvest', '满满一小篮！我负责扶稳，你来放。'],
  ['libao', 'focusStart', '小板凳摆好了，我坐这儿陪着。'],
  ['libao', 'pat', '嘿嘿，叶子都被你摸歪啦。'],
  ['libao', 'build', '搭起来啦！我先绕一圈，慢慢绕，怕撞上。'],
  ['libao', 'supply', '种子到手啦！握松一点，别捂成点心。'],
  ['libao', 'gameWin', '赢啦！我举一下叶子，庆祝完就放下。'],
  ['libao', 'water', '哗啦！我浇的是地，叶子只是顺便洗了脸。'],
  ['libao', 'focus', '这一段做完啦，我的安静陪伴任务也完成了！'],
  ['libao', 'task', '划掉一件啦！我替你把小旗子插好。'],
];

// 演示日：2026-10-13（周二）09:30，北京时间。2026–2027 学年第一学期第 7 周。
// 选这一天是因为当天的三份伙伴委托恰好来自荔宝、栗栗、小白（garden-orders.mjs 按日期轮换），
// 画面里不会出现别的伙伴。
export const DEMO_WALL = Date.UTC(2026, 9, 13, 1, 30, 0);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

const at = (dayOffset, h, m = 0) => DEMO_WALL + dayOffset * DAY + (h - 9.5) * HOUR + m * MIN;

export function saveA(now = DEMO_WALL) {
  const created = now - 6 * DAY - 2 * HOUR;
  const s = createState(created);
  s.profile = {name: '小荔', college: ''};
  s.preferences = {theme: 'day', homeSkin: 'lake', motion: true, onboarded: true, noticeSource: 'undergrad', studentLevel: 'undergrad'};
  const g = s.game;
  g.created = created;
  g.last = now;
  g.coins = 40;
  g.food = 3;
  g.seeds = {radish: 4, strawberry: 2, blueberry: 2, lychee: 0};
  g.stock = {radish: 1, strawberry: 2, blueberry: 0, lychee: 0};
  g.plots = [
    {crop: 'radish', planted: now - 35 * MIN, ready: now - 34 * MIN, watered: false},
    {crop: 'radish', planted: now - 20 * MIN, ready: now - 19 * MIN, watered: false},
    {crop: 'strawberry', planted: now - 2 * MIN, ready: now + 2 * MIN + 15000, watered: true},
    {crop: 'blueberry', planted: now - 6 * MIN, ready: now + 14 * MIN, watered: false},
    null,
    'locked',
  ];
  const byId = Object.fromEntries(g.pets.map(p => [p.species, p]));
  Object.assign(byId.libao, {xp: 122, bond: 46, hunger: 80, mood: 85, energy: 85, sleeping: false, lastPat: 0, lastPlay: 0, say: '嗨，我是荔宝。今天先做哪件小事？', saidAt: now - 10 * MIN});
  Object.assign(byId.chestnut, {xp: 64, bond: 28, hunger: 76, mood: 82, energy: 80, say: '喵。这个位置我试过了，可以坐。', saidAt: now - DAY});
  Object.assign(byId.egret, {xp: 58, bond: 24, hunger: 78, mood: 84, energy: 82, say: '湖边的风很舒服，陪你坐一会儿。', saidAt: now - DAY});
  g.active = g.pets.findIndex(p => p.species === 'libao');
  g.stats = {harvest: 2, focus: 5, minutes: 175, planted: 6, tasks: 3};
  g.discovered = ['radish', 'strawberry'];
  g.achievements = ['harvest'];
  // 近 7 天专注：25 / 45 / 30 / 25 / 0 / 50 分钟（前六天），今天还没开始。
  const history = [
    [-6, 20, 25, '背 30 个单词'], [-5, 15, 45, '整理数据结构笔记'], [-4, 21, 30, '预习线性代数 2.3'],
    [-3, 19, 25, '复习英语听力'], [-1, 16, 50, '写数据结构实验报告'],
  ];
  g.focusHistory = history.map(([d, h, minutes, task]) => ({startedAt: at(d, h) - minutes * MIN, endedAt: at(d, h), minutes, todoId: '', task})).sort((a, b) => b.endedAt - a.endedAt);
  g.journey = {days: [dayKey(now - 4 * DAY), dayKey(now - 2 * DAY), dayKey(now)], claimed: ['hello', 'lake']};
  g.daily = {day: dayKey(now), gift: false, care: 1, plant: 0, harvest: 0, focus: 0, claimed: [], pats: [0, 0, 0, 0, 0], todoRewards: 0};
  g.log = [
    {time: now - 19 * MIN, text: '浇水完成，剩余生长时间缩短四分之一。'},
    {time: now - 35 * MIN, text: '种下了小萝卜，离线时也会继续生长。'},
    {time: at(-1, 16), text: '完成 50 分钟专注，获得等量荔枝币与成长。'},
    {time: at(-2, 12), text: '收获 草莓 ×2，已放入背包。'},
  ];
  s.todos = [
    {id: 'demo-todo-english', text: '交英语作文', done: false, rewarded: false, date: dayKey(now), createdAt: at(-1, 21), completedAt: 0, archived: false},
    {id: 'demo-todo-words', text: '背 30 个单词', done: false, rewarded: false, date: dayKey(now), createdAt: at(0, 8), completedAt: 0, archived: false},
    {id: 'demo-todo-ds', text: '整理数据结构笔记', done: true, rewarded: true, date: dayKey(now - DAY), createdAt: at(-2, 20), completedAt: at(-1, 17), archived: false},
  ];
  const out = normalize(s, now);
  for (const [species, context, text] of LINES) presetLine(out, species, context, text);
  return out;
}

// 存档 B「建设」：累计收获 3 次、荔枝币 120、小萝卜 6 / 草莓 3，湖畔野餐角可以布置。
export function saveB(now = DEMO_WALL) {
  const s = saveA(now);
  const g = s.game;
  g.coins = 120;
  g.stock = {radish: 6, strawberry: 3, blueberry: 1, lychee: 0};
  g.stats.harvest = 3;
  g.discovered = ['radish', 'strawberry', 'blueberry'];
  return normalize(s, now);
}

// 2048：已合出过 2048 的棋盘（won），五枚里程碑都已得，今天达到 128 条件但还没领备种礼。
export function withWonPuzzle(s, now = DEMO_WALL) {
  const next = structuredClone(s);
  next.game.puzzle = {
    board: [2048, 512, 128, 32, 4, 256, 64, 16, 2, 8, 4, 2, 0, 0, 2, 0],
    score: 26840, best: 26840, rng: 20261013, moves: 1187, over: false, won: true,
    milestones: [128, 256, 512, 1024, 2048], undo: null, earnedDay: '', qualifiedDay: dayKey(now), supplyClaim: null,
  };
  return normalize(next, now);
}

// 2048：差一步合成 2048——左滑时第一行两枚 1024 相撞（真实走子，录合成瞬间）。
export function withAlmostPuzzle(s, now = DEMO_WALL) {
  const next = structuredClone(s);
  next.game.puzzle = {
    board: [1024, 1024, 128, 32, 512, 256, 64, 16, 2, 8, 4, 2, 0, 0, 2, 0],
    score: 24720, best: 24720, rng: 20261013, moves: 1186, over: false, won: false,
    milestones: [128, 256, 512, 1024], undo: null, earnedDay: '', qualifiedDay: dayKey(now), supplyClaim: null,
  };
  return normalize(next, now);
}

export function withFocusRunning(s, minutes, startedAt) {
  return act(s, {type: 'focusStart', minutes}, startedAt);
}

// 课程笔记（演示）：三门课，当前页「第三章 · 函数极限」，课堂记录模板。
export function demoNotebook(now = DEMO_WALL) {
  const t = (d, h, m = 0) => at(d, h, m);
  const courses = [
    {id: 'demo-course-math', name: '高等数学 A'},
    {id: 'demo-course-ds', name: '数据结构'},
    {id: 'demo-course-en', name: '大学英语'},
  ];
  const lecture = [
    '## 今天的主题',
    '',
    '函数极限的定义与性质：从数列极限推广到函数，重点是 ε-δ 语言。',
    '',
    '## 重点与例子',
    '',
    '- 例：证明 lim(x→2) (3x − 1) = 5，取 δ = ε/3',
    '- 左右极限都存在且相等 ⇔ 极限存在',
    '',
    '## 还没弄懂',
    '',
    '- [ ] 无穷远处的极限怎么用 ε-X 语言写',
    '- [ ] 夹逼准则的条件能不能放宽',
    '',
    '## 课后要做',
    '',
    '- [ ] 课后做完习题 3.2',
    '- [ ] 预习 3.3 无穷小的比较',
    '',
  ].join('\n');
  const notes = [
    {id: 'demo-note-limit', title: '第三章 · 函数极限', body: lecture, courseId: 'demo-course-math', createdAt: t(0, 8, 5), updatedAt: t(0, 9, 20)},
    {id: 'demo-note-seq', title: '第二章 · 数列极限', body: '## 今天的主题\n\n数列极限的 ε-N 定义。\n\n## 重点与例子\n\n- 收敛数列必有界\n- 单调有界准则\n', courseId: 'demo-course-math', createdAt: t(-6, 8), updatedAt: t(-6, 10)},
    {id: 'demo-note-tree', title: '二叉树的遍历', body: '## 今天的主题\n\n前序、中序、后序与层序遍历。\n\n## 重点与例子\n\n- 递归写法三行就够\n- 非递归中序用一个栈\n', courseId: 'demo-course-ds', createdAt: t(-1, 14), updatedAt: t(-1, 16)},
    {id: 'demo-note-essay', title: 'Unit 4 · Writing', body: '## 今天的主题\n\nArgumentative essay 的结构。\n\n## 课后要做\n\n- [ ] 交英语作文\n', courseId: 'demo-course-en', createdAt: t(-2, 10), updatedAt: t(-2, 11)},
  ];
  return {courses, notes, preferences: {selectedNoteId: 'demo-note-limit', selectedCourseId: 'demo-course-math'}};
}

export {engine, CROPS};
