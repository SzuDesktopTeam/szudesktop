/**
 * Every on-screen string of the film, verbatim from the storyboard copy checklist (which cites
 * README / docs / app source for each). Shots should import from here instead of retyping, so
 * the FontCheck still verifies glyph coverage of exactly what ships.
 *
 * Never add: 课表 / 成绩 / 学校登录 / 应用内预约 / 琴房 as selling points, Pingu / Skipper /
 * 阿青 / 企鹅 / 小龟 / Noot, "免费" / "最" / "第一" / "全部学院", or a hard-coded version number.
 */
export const COPY = {
  title: 'szuDesktop · 荔枝庭院',
  tagline: '把深大的一小片校园，搬到你的桌面。',
  closingLine: '选一位像素伙伴，专注一会儿，回来收一颗萝卜。',
  disclaimer: '学生自制 · 与深圳大学官方无关',
  repo: 'github.com/SzuDesktopTeam/szudesktop',
  download: '下载 · github.com/SzuDesktopTeam/szudesktop',
  demoNote: '画面中的账号与记录均为演示数据',
  sections: ['01 桌面伙伴', '02 专注奖励', '03 庭院世界', '04 课程笔记', '05 校园网', '06 放心用'],
  pets: {libao: '荔宝', chestnut: '栗栗', egret: '小白'},

  // 01 桌面伙伴
  petHeadline: '伙伴，常驻桌面',
  petDrag: '拖到哪都行 · 滚轮缩放 40%–200%',
  petSizeHud: '伙伴大小（150%）',
  /** v2: promo caption (not app UI) for the scroll-wheel resize beat. */
  petScrollCaption: '滚轮缩放 110% → 150%',
  petMenuHeadline: '点一下：聊两句 · 摸摸头 · 喂食',
  petSwitchHeadline: '荔宝 · 栗栗 · 小白，随时切换',
  petPlatformNote: '桌面伙伴：Windows 安装版 · macOS 预览版',
  bubbles: {
    greet: '你来啦！我给你腾出一个位置。',
    pat: '嘿嘿，叶子都被你摸歪啦。',
    chestnutSignature: '纸箱验收。请注意我的进入姿势。',
    egretGreeting: '湖边的风很舒服，陪你坐一会儿。',
    focus: '小板凳摆好了，我坐这儿陪着。',
    harvest: '满满一小篮！我负责扶稳，你来放。',
    outro: '嗨，我是荔宝。今天先做哪件小事？',
  },

  // 02 专注奖励
  todoHeadline: '写一件小事',
  todoPlaceholder: '留一件值得完成的小事',
  todoDemo: '复习高数第三章',
  focusHeadline: '专注 25 分钟',
  focusChips: ['5', '25', '45', '自定 1–120 分钟'],
  rewardHeadline: '+25 荔枝币 · +25 成长',
  rewardToast: '完成 25 分钟专注 · 荔枝币 +25 · 荔宝成长 +25',
  rewardNote: '每完成 1 分钟 = 1 荔枝币 + 1 成长',
  farmHeadline: '种菜 · 浇水 · 离线也在长',
  harvestHeadline: '回来收一颗萝卜',
  harvestToast: '收获入仓 · 小萝卜 +2 · 荔宝成长 +1',

  // 03 庭院世界
  scenes: ['荔湖晴昼', '雨后书屋', '蓝调晚庭'],
  sceneNote: '校园主题创作',
  scenesSub: '三套风景 + 像素庭院，整个应用一起换',
  buildHeadline: '收成 + 荔枝币 → 庭院建设',
  buildProjects: '湖畔野餐角 · 窗边育苗架 · 湖畔灯径',
  buildToast: '湖畔野餐角建好啦',
  arcadeLabel: '伙伴小桌 · 2048',
  arcadeClimax: '荔宝丰收礼！2048',
  arcadeWon: '荔宝丰收礼合成啦！已经达到 2048，还可以继续挑战自己的纪录。',
  arcadeDaily: '每天合出 128，领一份备种礼',
  arcadeNoPay: '没有充值 · 没有排行榜 · 只和自己的纪录比',
  arcadeClaimToast: '备种礼已收进背包 · 草莓种子 +1 · 荔枝币 +8 · 荔宝成长 +3',

  // 04 课程笔记
  notesHeadline: '课程笔记 · Markdown',
  notesOutline: '本页大纲，一点就跳',
  notesToTodo: '选一句，转成待办',
  notesNote: '笔记保存在本机 · 可导出 .md',
  notesDemoLine: '- ε-δ 定义：任给 ε>0，存在 δ>0……',

  // 05 校园网
  netOffline: '断网了？',
  netDiagHeadline: '网络诊断，逐项排查',
  netDiagRows: ['区域判定：教学区（深澜 SRun）', '互联网：不可用', '教学区门户：可达', '宿舍区门户：未确认'],
  netDiagAdvice: '你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，密码是统一身份认证密码',
  netZoneHeadline: '自动判断 教学区 / 宿舍区',
  netZoneOptions: ['自动识别', '教学区 · 深澜', '宿舍区 · Dr.COM'],
  netLoginHeadline: '一个按钮，登录校园网',
  netServices: '学院公告 · 官方校历，不用登录也能看',
  netFootnote: '校园网认证仍在现场验收 · 画面为演示数据',
  demoData: '演示数据',

  // 06 放心用
  platforms: ['Windows', 'macOS（预览版）'],
  trustBadges: ['数据只存本机', '没有遥测', '断网也能用'],
  trustNote: '庭院、待办、专注、课程笔记不需要学校账号',
  openSource: '开源 · MIT',
  openSourceSub: '3 位原创伙伴 · 324 帧逐帧像素动作 · 学生自制',
  openSourceShort: '开源 MIT',

  // 竖版短句
  vertical: {
    titleLines: ['szuDesktop', '荔枝庭院'],
    taglineLines: ['把深大的一小片校园，', '搬到你的桌面'],
    pet: '伙伴常驻桌面',
    petDrag: '拖动 · 滚轮缩放',
    focus: '专注 25 分钟',
    reward: '+25 荔枝币',
    scenes: '三套风景，随心换',
    arcade: '伙伴小桌 2048',
    arcadeClimax: '荔宝丰收礼！',
    build: '收成变成庭院建设',
    notes: '课程笔记 · 选句转待办',
    net: '连不上？先诊断',
    netFootnote: '校园网认证仍在现场验收 · 演示数据',
    platforms: 'Windows · macOS（预览版）',
  },
} as const;

/** Flattened list of every string (FontCheck / glyph coverage). */
export const allCopyStrings = (): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(COPY);
  return out;
};
