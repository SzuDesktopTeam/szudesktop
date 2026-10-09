/**
 * Shot lists from the storyboard (work/storyboard.md). Times are the storyboard's seconds;
 * they are snapped to the 16th-note grid (secToBeat) when turned into Sequences, so 0.938 →
 * beat 2 → frame 56. Shot components are registered by id in src/shots/registry.ts.
 */
export type ShotSpec = {id: string; start: number; end: number; section: string; label: string};

export const SHOTS_16x9: ShotSpec[] = [
  {id: 'S01', start: 0, end: 0.938, section: '开场钩子', label: 'campus.png 巨型马赛克逐级清晰 · 像素荔枝砸下'},
  {id: 'S02', start: 0.938, end: 2.813, section: '开场钩子', label: '荔宝 ×16 炸开登场 · 片名逐字砸入 · 素材粒子'},
  {id: 'S03', start: 2.813, end: 3.75, section: '开场钩子', label: '栗栗、小白滑入 · 标语打字 · 甩镜'},
  {id: 'S04', start: 3.75, end: 5.625, section: '桌面伙伴', label: '拟真桌面 · 主窗口飞入 · 荔宝坐窗边冒气泡'},
  {id: 'S05', start: 5.625, end: 7.5, section: '桌面伙伴', label: '光标拖动荔宝 · 滚轮逐档放大到 150%'},
  {id: 'S06', start: 7.5, end: 9.375, section: '桌面伙伴', label: '伙伴菜单 · 摸摸头 · 爱心'},
  {id: 'S07', start: 9.375, end: 11.25, section: '桌面伙伴', label: '切换伙伴：荔宝 → 栗栗 → 小白 · 穿屏推入'},
  {id: 'S08', start: 11.25, end: 13.125, section: '专注换奖励', label: '学习书屋：写一件小事「复习高数第三章」'},
  {id: 'S09', start: 13.125, end: 15, section: '专注换奖励', label: '专注 25 分钟延时 25:00 → 00:00'},
  {id: 'S10', start: 15, end: 16.875, section: '专注换奖励', label: '完成并领取奖励 · 荔枝币喷射 40→65'},
  {id: 'S11', start: 16.875, end: 18.75, section: '专注换奖励', label: '湖畔的六块小田 · 浇水'},
  {id: 'S12', start: 18.75, end: 20.625, section: '专注换奖励', label: '收获小萝卜冲镜头 · 压暗蓄力'},
  {id: 'S13', start: 20.625, end: 22.5, section: '庭院世界', label: 'DROP · 荔湖晴昼 3D 推镜'},
  {id: 'S14', start: 22.5, end: 24.375, section: '庭院世界', label: '雨后书屋 3D 推镜'},
  {id: 'S15', start: 24.375, end: 26.25, section: '庭院世界', label: '蓝调晚庭 · 四宫格翻出'},
  {id: 'S16', start: 26.25, end: 28.125, section: '庭院世界', label: '回忆与建设 · 湖畔野餐角逐行搭建'},
  {id: 'S17', start: 28.125, end: 31.875, section: '庭院世界（高潮）', label: '伙伴小桌 2048 每拍合并 → 荔宝丰收礼爆炸'},
  {id: 'S18', start: 31.875, end: 33.75, section: '庭院世界', label: '真实棋盘 · 领取种子与小礼'},
  {id: 'S19', start: 33.75, end: 35.625, section: '课程笔记', label: '课程笔记书写 Markdown'},
  {id: 'S20', start: 35.625, end: 37.5, section: '课程笔记', label: '阅读 · 本页大纲跳转'},
  {id: 'S21', start: 37.5, end: 39.375, section: '课程笔记', label: '选一句 → 加入学习待办 · 故障转场'},
  {id: 'S22', start: 39.375, end: 41.25, section: '校园网', label: '断网了？· 信号柱熄灭'},
  {id: 'S23', start: 41.25, end: 43.125, section: '校园网', label: '网络诊断四行清单逐拍点亮'},
  {id: 'S24', start: 43.125, end: 45, section: '校园网', label: '自动识别区域 · 键入演示卡号 · 登录'},
  {id: 'S25', start: 45, end: 46.875, section: '校园网', label: '上线 · 学院公告与官方校历'},
  {id: 'S26', start: 46.875, end: 48.75, section: '信任与平台', label: 'Windows / macOS（预览版）两窗交汇'},
  {id: 'S27', start: 48.75, end: 50.625, section: '信任与平台', label: '三块木框徽章砸下'},
  {id: 'S28', start: 50.625, end: 52.5, section: '信任与平台', label: '324 格伙伴动作墙 · 开源 MIT'},
  {id: 'S29', start: 52.5, end: 56.25, section: '结尾', label: '应用图标砸出 · 片名 · 三位伙伴拿手动作'},
  {id: 'S30', start: 56.25, end: 60, section: '结尾', label: '下载牌 · 平台 · 声明条常驻'},
];

export const SHOTS_9x16: ShotSpec[] = [
  {id: 'V01', start: 0, end: 0.938, section: '开场钩子', label: '竖向马赛克 · 荔枝砸下'},
  {id: 'V02', start: 0.938, end: 3.75, section: '开场钩子', label: '荔宝 ×18 · 片名两行 · 栗栗小白滑入'},
  {id: 'V03', start: 3.75, end: 5.625, section: '桌面伙伴', label: '竖向桌面 · 拖动 · 滚轮放大'},
  {id: 'V04', start: 5.625, end: 7.5, section: '桌面伙伴', label: '摸摸头 · 切换三位伙伴'},
  {id: 'V05', start: 7.5, end: 9.375, section: '专注换奖励', label: '25:00 → 00:00 · 荔枝币爆发'},
  {id: 'V06', start: 9.375, end: 11.25, section: '专注换奖励', label: '收获萝卜冲镜头'},
  {id: 'V07', start: 11.25, end: 13.125, section: '庭院世界', label: '三套风景 3D 推镜竖裁'},
  {id: 'V08', start: 13.125, end: 16.875, section: '庭院世界（高潮）', label: '2048 每 8 分音符合并 → 荔宝丰收礼'},
  {id: 'V09', start: 16.875, end: 18.75, section: '庭院世界', label: '布置湖畔野餐角'},
  {id: 'V10', start: 18.75, end: 20.625, section: '课程笔记', label: '本页大纲 · 选句转待办'},
  {id: 'V11', start: 20.625, end: 22.5, section: '校园网', label: '诊断清单 · 已在线'},
  {id: 'V12', start: 22.5, end: 24.375, section: '信任与平台', label: '三块徽章 · 动作墙'},
  {id: 'V13', start: 24.375, end: 30, section: '结尾', label: '图标 · 片名 · 伙伴 · 下载牌 · 声明'},
];
