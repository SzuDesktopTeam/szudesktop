# szuDesktop · 荔枝庭院 宣传片分镜（导演版）

> 依据：README.md、docs/guide/*.md、desktop/index.html、desktop/assets/garden/*.mjs|*.css、desktop/electron/pet.html|pet-controller.mjs（源码 4b25817，beta0.9.7 内容）。
> 维护者要求：「要丰富，不要那么抽象，视觉表现要丰富有冲击力」。本片每个镜头都由**真实界面采集**或**应用自带像素素材**构成，几何图形只做描边、光斑和转场遮罩，不做主体。

---

## 0. 总纲

**一句话概念**：一颗荔枝砸进屏幕——荔宝巨幅落地，镜头从它的像素脸拉开，一路穿进桌面、书桌、农田、三套风景和伙伴小桌，在 2048 合出「荔宝丰收礼」时炸开高潮；随后笔记、校园网、信任三连击，收在 logo 与下载地址。全片 128 BPM，每一刀都落在拍点上。

| 规格 | 横版 16:9 | 竖版 9:16 |
| :-- | :-- | :-- |
| 分辨率 / 帧率 | 1920×1080 · 60fps | 1080×1920 · 60fps |
| 时长 | 60.000 s（32 小节） | 30.000 s（16 小节） |
| 编码 | H.264 High yuv420p，CRF 14–16，maxrate 16M，-tune animation，AAC 48k 256k，+faststart | 同左，maxrate 18M |
| 体积目标 | ≤ 120 MB（预计 70–100 MB） | ≤ 120 MB（预计 40–60 MB） |

**节拍网格**（128 BPM，4/4）：1 拍 = 0.46875 s = 28.125 帧；1 小节 = 1.875 s = 112.5 帧。60 s 正好 32 小节 = 128 拍，30 s 正好 16 小节。剪辑点按 `round(拍序号 × 28.125)` 取帧（误差 ≤ 1/120 s）。

| 小节 | 起始秒 | 小节 | 起始秒 | 小节 | 起始秒 | 小节 | 起始秒 |
| --: | --: | --: | --: | --: | --: | --: | --: |
| 1 | 0.000 | 9 | 15.000 | 17 | 30.000 | 25 | 45.000 |
| 2 | 1.875 | 10 | 16.875 | 18 | 31.875 | 26 | 46.875 |
| 3 | 3.750 | 11 | 18.750 | 19 | 33.750 | 27 | 48.750 |
| 4 | 5.625 | 12 | 20.625 | 20 | 35.625 | 28 | 50.625 |
| 5 | 7.500 | 13 | 22.500 | 21 | 37.500 | 29 | 52.500 |
| 6 | 9.375 | 14 | 24.375 | 22 | 39.375 | 30 | 54.375 |
| 7 | 11.250 | 15 | 26.250 | 23 | 41.250 | 31 | 56.250 |
| 8 | 13.125 | 16 | 28.125 | 24 | 43.125 | 32 | 58.125 |

---

## 1. 视觉系统

**配色**（全部取自应用 CSS 与像素画稿）

| 角色 | 色值 | 出处 |
| :-- | :-- | :-- |
| 荔枝红（主色） | `#ED4C67` | pet-art.mjs 荔宝身体 |
| 荔枝深红（标题描边、气泡边） | `#6E1F35` | 荔宝描边 / pet.html 气泡边框 |
| 荔枝果红 | `#E04848` | index.html `#f-lychee` |
| 叶绿亮 / 叶绿 | `#63C164` / `#4C9838` | `#f-lychee` 叶子 |
| 主按钮绿 / 深绿 | `#42654B` / `#2E4D36` | style.css `.primary` |
| 暖纸 / 纸高光 / 纸线 | `#FFF9E9` / `#FFFDF5` / `#D6C5A2` | style.css `--paper` `--paper-hi` `--line` |
| 木 / 深木 | `#88582F` / `#492A16` | `--wood` `--wood-dark` |
| 金（数字、奖励） | `#FFD36F` | `--gold` |
| 橙 | `#DF8A28` | `--orange` |
| 墨 | `#3F3829` | `--ink` |
| 断网红（只用于校园网段） | `#A03F3B` | `--error` |
| 信息蓝（只用于校园网段） | `#286483` | `--info` |

**字体**
- 标题：Fusion Pixel 12px Proportional（仓库自带 OFL，`desktop/assets/fonts/`，按 fusion-pixel.css 的 unicode-range 分片加载）。字号只用 12 的整数倍（48/72/96/120/144/168/192px），保证像素边齐。
- 正文与注脚：Noto Sans SC（`@fontsource/noto-sans-sc`，OFL），Medium 500 / Bold 700。**不使用 PingFang、苹方、Microsoft YaHei 等系统字体。**
- 标题样式：暖纸 `#FFF9E9` 字面 + `#6E1F35` 4px 像素描边 + `#492A16` 右下 6px 硬阴影（无模糊）。数字用金 `#FFD36F`。

**画面语言**
- 像素画一律最近邻放大（`image-rendering: pixelated`），整数倍：荔宝 52×56 用 ×16（832×896），栗栗 20×22 用 ×24，小白 32×32 用 ×16；作物与图标 16×16 用 ×6–×12；2048 棋子 32×32 用 ×8–×16。
- 界面采集图做 3D 卡片：`perspective: 1800px`，rotateX/rotateY ≤ 18°，带纸色描边和 24px 柔阴影；镜头推拉通过卡片 scale 与 translateZ。
- 视差：背景（campus.png / courtyard.png，轻微高斯模糊 2px）× 0.3 速度，中景（界面卡片）× 1.0，前景（像素作物、花草、伙伴）× 1.8。
- 段落角标：每段左上角一个木牌（`#88582F` 底、`#FFD36F` 字，Fusion Pixel 48px），写「01 桌面伙伴」「02 专注奖励」「03 庭院世界」「04 课程笔记」「05 校园网」「06 放心用」。
- 粒子：只用真实素材——荔枝币 `i-coin`、荔枝 `f-lychee`、小萝卜、草莓 `f-straw`、蓝莓 `f-blue`、爱心 `i-heart`、种子 `i-seed`、水滴 `i-water`、花 `i-flower`、灯 `i-lantern`，以及 flora 里的 tallgrass / berrybush。冲击时的尘土用 2×2 纸色像素方块（与像素风统一）。
- 转场词汇表：
  - **像素块溶解**：8→16→32→64 px 马赛克，跟 16 分音符步进；
  - **甩镜**：横向 0.12 s 位移 + 方向性拖影（同一帧重复 6 次、透明度递减）；
  - **穿屏推入**：镜头推进界面卡片里的某个元素，元素放大填满画面接下一镜；
  - **白闪**：2 帧 `#FFFDF5` 全屏；
  - **故障**：只在「断网了？」使用，RGB 分离 6px + 扫描线 + 2 帧黑场。

---

## 2. 采集总则（footage 共用）

1. **构建**（只写被忽略的目录）：`python3 desktop/sync-assets.py`（生成 desktop/assets/index.html 与 desktop/internal/ui/assets/，均在 .gitignore）；`GOPROXY=off go build -o dist/promo/szudesktop ./desktop/cmd/szudesktop`。不改受版本控制文件，不做 git 操作。
2. **隔离运行**：`SZUNET_CONFIG_DIR=$(mktemp -d)`，`dist/promo/szudesktop --no-open --no-auto-login --addr 127.0.0.1:0`；从 stdout 读「szuDesktop 会话」一行拼出 `/?launch=` 地址。不读真实 `~/.szunet`，不碰钥匙串、登录项、系统设置；结束时只结束自己启动的引擎与 Chrome 进程（记录 PID）。
3. **演示存档**：启动前在临时目录写入 `workspace-v1.json`（`{version, revision:0, data}`）和 `notebook-v1.json`。存档数据用 Node 直接 `import desktop/assets/garden/engine.mjs` 的 `createState()` + `act()` 生成，保证结构合法；昵称写「小荔」，不出现真实姓名、学号、账号。两份存档：
   - **存档 A「日常」**：建档 6 天前，`preferences.onboarded=true`，`homeSkin='lake'`，当前伙伴荔宝（Lv.3，xp≈120），栗栗、小白 Lv.2；荔枝币 40，食物 3；种子 小萝卜 4 / 草莓 2 / 蓝莓 2；六块田：田1 小萝卜已成熟、田2 小萝卜已成熟、田3 草莓生长中且已浇水、田4 蓝莓生长中、田5 空地、田6 未开垦；累计收获 2；待办「交英语作文」（未完成）「整理数据结构笔记」（已完成）；近 7 天专注记录 25/45/30/25/0/50 分钟；2048 预置棋盘见各条目。
   - **存档 B「建设」**：在 A 基础上累计收获 3、荔枝币 120、库存 小萝卜 6 / 草莓 3，「湖畔野餐角」处于可布置状态。
   - **笔记本**：课程「高等数学 A」「数据结构」「大学英语」；当前页「第三章 · 函数极限」，用「课堂记录」模板，正文见 clip_note_write。
4. **浏览器**：puppeteer-core + Chrome 154（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`），`headless: 'new'`，`--use-angle=metal --enable-webgl`（失败时 `--enable-unsafe-swiftshader`），`--user-data-dir` 用临时目录；视口 1600×900，`deviceScaleFactor: 2`（产出 3200×1800）；时区 Asia/Shanghai；`prefers-reduced-motion: no-preference`；用注入脚本把 `Date.now`/`new Date()` 固定到 **2026-10-12（周一）09:30** 起算，需要延时摄影时按倍速推进。
5. **外壳桥接**：需要「安装版」界面时，在 `evaluateOnNewDocument` 里注入 `window.szuDesktop` 替身：`{shell:'electron', platform:'win32'}` 加上 `petScale/setPetScale/desktopSettings/setDesktopSettings/onDesktopSettings/onPetScale/onPetCommand/onBeforeQuit/petResult/openSchool/openFeishu/quit` 的空实现（返回合理默认值）。Mac 窗口画面另采一份 `platform:'darwin'`。
6. **字体替换**：注入 `@font-face{font-family:"Noto Sans SC"; src:url(本地 woff2)}` 并覆盖 `:root{--body:"Noto Sans SC",sans-serif}` 与 `body, input, textarea, select, button` 的 font-family，避免截图里出现 PingFang。像素字体保持原样（Fusion Pixel）。
7. **接口拦截**（`page.setRequestInterception(true)`）：`/api/status`、`/api/diag`、`/api/login`、`/api/credential`、`/api/releases`、`/api/campus/calendar`、`/api/campus/notice-sources` 返回合成 JSON；其余 `/api/*` 交给隔离引擎；任何非 127.0.0.1 请求一律 abort（不访问学校、GitHub、联网检测地址）。
8. **品牌守卫**（每张截图、每段录制前后都跑）：注入 CSS 隐藏 `[data-action=switchPet][data-index="3"]`、`[data-index="4"]`（Pingu、Skipper 的卡片）、「老朋友」折叠区、欢迎引导对话框，以及任何 `svg:has(use[href*="pingu"]), svg:has(use[href*="skipper"]), svg:has(use[href*="turtle"])`；然后检查可见文本不含 `Pingu|Skipper|阿青|Noot|企鹅|小龟`、可见 `<use>` 不引用 pingu/skipper/turtle，命中即判失败重采。委托卡、来访故事（第 4 段提到 Pingu）一律不入镜。
9. **录制方式**：
   - `still`：`page.screenshot({type:'png'})`，必要时 `clip` 只截区域。
   - `clip`：CDP `Page.startScreencast({format:'png', everyNthFrame:1})` 记录每帧时间戳，再用 ffmpeg concat（按时间戳给 duration）转成 60fps CFR 的 PNG 序列；交互按节拍时刻驱动（键入 1 字 / 117 ms = 16 分音符；点击落在拍点前 2 帧，使界面反馈落在拍上）。3D 风景用确定性逐帧渲染（见 clip_scene_*）。
   - 原生 `<select>` 下拉、Electron 原生菜单不会出现在截图里：这两类用 Remotion 按源码里的**原文标签**重建（见各镜头说明）。

---

## 3. 横版 16:9 分镜（60 s / 32 小节）

### 段 1 · 开场钩子（0.000–3.750，小节 1–2）

**S01 · 0.000–0.938（拍 1–2）· 砸进屏幕**
- 画面：第 0 帧就是 campus.png 的 96px 巨型马赛克（文山湖），拍 1 降到 32px、拍 2 降到 8px，逐级清晰。0.70 s 一颗巨大的像素荔枝（`brand_lychee` ×40）从画面上沿砸下，0.9375 s（拍 3 起点）落地瞬间切 S02。
- 素材：bg_campus；sprite brand_lychee。
- 字：无。
- 运动：背景缓推 1.00→1.04；荔枝下落带 3 帧拖影。
- 转场：落地帧白闪 2 帧 → S02。
- 声音：2 拍军鼓滚奏 + 上扬噪声 riser；0.469 s 一声金币音 blip。

**S02 · 0.938–2.813（拍 3–6）· 荔宝巨幅登场 + 片名**
- 画面：荔枝落地炸开成荔宝——荔宝 ×16（832×896）站在画面中下，播 `celebrate` 6 帧（按 8 分音符重定时），随后接 `signature`（举小牌加油）。落地瞬间镜头震动 6 帧（±14px 衰减），四周喷出 40 颗真实素材粒子（荔枝、荔枝币、小萝卜、草莓、蓝莓）沿抛物线飞散。背景 campus.png 清晰、缓推，前景左右下角 tallgrass / berrybush ×12 视差滑入。
- 素材：bg_campus；sprites pet_libao_celebrate_0-5、pet_libao_signature_0-5、crop_*、icon_coin、flora_tallgrass、flora_berrybush。
- 字：片名「szuDesktop · 荔枝庭院」Fusion Pixel 144px，按 8 分音符逐字砸入（每字落地 4 帧回弹），位于画面上三分之一。
- 运动：镜头 1.00→1.08 慢推 + 微旋 0→-1.5°；片名每字 translateY -120→0 + scale 1.4→1。
- 转场：硬切（落在拍 7）。
- 声音：拍 3 IMPACT（低频 boom + 和弦 stab + 镲片），之后全鼓组进入，主旋律「荔-枝-庭-院」四音动机。

**S03 · 2.813–3.750（拍 7–8）· 三位伙伴到齐**
- 画面：栗栗（×24）从左边 `walk` 滑入，小白（×16）从右边 `walk` 滑入，分别在拍 7、拍 8 落位到荔宝两侧，落地各一小团纸色像素尘；荔宝切 `greet` 挥手。
- 素材：bg_campus；sprites pet_cat_walk_0-5、pet_egret_walk_0-5、pet_libao_greet_0-5。
- 字：副标题「把深大的一小片校园，搬到你的桌面。」Noto Sans SC Bold 52px，打字机效果（16 分音符一字），片名上移收小到 96px。
- 运动：整体轻微后拉 1.08→1.0，给三位伙伴留位。
- 转场：拍 8 末向右**甩镜**进入 S04。
- 声音：两记 tom 落地；甩镜 whoosh。

### 段 2 · 桌面伙伴陪你（3.750–11.250，小节 3–6）

**S04 · 3.750–5.625（小节 3）· 桌面上的荔宝**
- 画面：一张逼真的电脑桌面——壁纸用 campus.png（轻微柔化），底部一条通用任务栏（不用任何操作系统 logo）：左侧几个应用图标位、szuDesktop 应用图标、右侧托盘区放 szuDesktop 托盘图标与时钟「09:30」。中左是 szuDesktop 主窗口（ui_home_lake 截图套通用窗口框，标题「szuDesktop · 荔枝庭院」），拍 1 以 rotateY -18°→0、scale 0.88→1 飞入；拍 3 荔宝桌面伙伴（×5，与真实窗口 150px 宽 ×1.0~1.5 比例一致）从窗口右上角「跳」出来坐在窗口边沿，气泡弹出（气泡样式照搬 pet.html：`#FFFDF6` 底、`#6E1F35` 2px 边、12px 圆角、尾巴、0.28 s pop）。
- 素材：ui_home_lake、ui_pet_window_bubbles；sprites bg_campus、app_icon_1024、tray_icon、pet_libao_idle_0-5、pet_libao_greet_0-5。
- 字：左上角标「01 桌面伙伴」；主字「伙伴，常驻桌面」Fusion Pixel 96px；气泡「你来啦！我给你腾出一个位置。」。
- 运动：桌面整体做 3D 倾斜（rotateX 6°→2°、rotateY -8°→-3°）缓推 1.0→1.06；前景伙伴视差速度 1.4。
- 转场：硬切（拍 1）。
- 声音：主歌 A 起，轻四拍底鼓 + 拨弦琶音；气泡 pop 音落在拍 3。

**S05 · 5.625–7.500（小节 4）· 拖动与缩放**
- 画面：像素箭头光标（自绘 12×19 像素光标）按住荔宝，沿弧线把它拖到桌面右下角、任务栏上方（拍 1–2），荔宝在拖动中播 `look`，落地播 `pat`；拍 3–4 光标悬停，滚轮 8 分音符一档，荔宝从 100% 依次放大到 150%（每档 +10%；桌面段以 3840×2160 超采样合成后缩到 1080p，最近邻放大不出现像素宽窄不一），右侧弹出 HUD 小牌「伙伴大小（150%）」（与菜单原文同格式）。
- 素材：ui_settings_desktop（只裁「伙伴大小」滑杆做 HUD 背板，可选）；sprites pet_libao_look_0-5、pet_libao_pat_0-5、bg_campus。
- 字：「拖到哪都行 · 滚轮缩放 40%–200%」Noto Sans SC Bold 44px，跟光标走的标签。
- 运动：镜头跟随伙伴横摇 + 推近到 1.18，最后一拍回弹。
- 转场：硬切。
- 声音：拖动 whoosh；滚轮每档一个 tick（8 分音符，音高逐档上升）。

**S06 · 7.500–9.375（小节 5）· 点一下，菜单与摸摸头**
- 画面：光标点击荔宝（拍 1），弹出伙伴菜单——按 pet-controller.mjs 原文与顺序重建的原生风格菜单（浅色、Noto Sans SC 15px）：「荔宝 · Lv.3」「饱食 80 · 心情 85 · 精力 85」（灰色不可点；数值按演示存档实际值），分隔线，「聊两句」「摸摸头」「喂食（剩余 3 份）」「陪它玩」「让它睡一会」「切换伙伴 ▸」，分隔线，「看看庭院」「照看农田」「学习与专注」「伙伴大小（100%）▸」，分隔线，「打开主窗口」「伙伴置顶」「隐藏伙伴」「退出应用」。拍 2 光标滑到「摸摸头」，拍 3 点下：菜单收起，荔宝播 `pat`，头顶冒出 6 颗 `i-heart` 像素爱心，气泡「嘿嘿，叶子都被你摸歪啦。」。
- 素材：ui_pet_window_bubbles；sprites pet_libao_pat_0-5、icon_heart。
- 字：「点一下：聊两句 · 摸摸头 · 喂食」Fusion Pixel 72px。
- 运动：镜头推进到伙伴 1.18→1.32，菜单以 scale 0.9→1 弹出（4 帧）。
- 转场：硬切。
- 声音：菜单展开 click；摸头时 3 个上行三角波音符 + 爱心 sparkle。

**S07 · 9.375–11.250（小节 6）· 换伙伴**
- 画面：菜单「切换伙伴 ▸」展开子菜单，只显示「荔宝 / 栗栗 / 小白」三项（其余项裁掉）。拍 2：像素块溶解，荔宝变成栗栗——栗栗播 `signature`（检查并坐进纸箱），气泡「纸箱验收。请注意我的进入姿势。」；拍 3：再溶解成小白，播 `signature`（低头理羽毛），气泡「湖边的风很舒服，陪你坐一会儿。」；拍 4：镜头开始冲向主窗口。
- 素材：ui_home_lake、ui_pet_window_bubbles；sprites pet_cat_signature_0-5、pet_egret_signature_0-5、pet_libao_idle_0-5。
- 字：「荔宝 · 栗栗 · 小白，随时切换」Fusion Pixel 72px（三个名字分别在拍 1/2/3 点亮成各自主色）；注脚「桌面伙伴：Windows 安装版 · macOS 预览版」Noto Sans SC 24px。
- 运动：每次切换伴随 4 帧 1.0→1.06 缩放脉冲；拍 4 镜头 rotateY 0→12° 穿向主窗口。
- 转场：拍 4 **穿屏推入**：推进主窗口里的「学习书屋」导航，导航块放大填满 → S08。
- 声音：每次切换一个像素化「bloop」（音高依次 D5、F#5、A5）；拍 4 吸入 whoosh。

### 段 3 · 专注换奖励（11.250–20.625，小节 7–11）

**S08 · 11.250–13.125（小节 7）· 写一件小事**
- 画面：clip_focus_todo_add 全屏（3D 卡片 rotateX 8°→0、rotateY -10°→0 逐渐摊平）。输入框占位「留一件值得完成的小事」，键入「复习高数第三章」（16 分音符一字），拍 4 点击「添加」，新条目出现在「待完成」列表顶。
- 素材：clip_focus_todo_add；sprite icon_quill（输入框旁漂浮）。
- 字：左上「02 专注奖励」；主字「写一件小事」Fusion Pixel 120px，左侧压在卡片上方。
- 运动：卡片推近输入框 1.0→1.35，焦点跟随光标。
- 转场：硬切。
- 声音：键盘 tick 16 分音符；「添加」落拍一声 click + 小和弦。

**S09 · 13.125–15.000（小节 8）· 专注 25 分钟（延时）**
- 画面：clip_focus_start_timelapse：「这次想做什么？」选中「复习高数第三章」，拍 1 点「25 分钟」，计时器「25:00」出现；拍 2–4 时钟以约 ×600 倍速从 25:00 滚到 00:00（数字逐位翻动），右下角画中画荔宝播 `focus`（抱着小本子陪专注），气泡「小板凳摆好了，我坐这儿陪着。」。
- 素材：clip_focus_start_timelapse、ui_pet_window_bubbles；sprite pet_libao_focus_0-5、icon_clock。
- 字：「专注 25 分钟」Fusion Pixel 120px；下面一排 4 个小牌「5 · 25 · 45 · 自定 1–120 分钟」，25 高亮。
- 运动：镜头锁定计时器，1.35→1.6 慢推；倒计时期间画面边缘做 2 帧一次的微抖（节奏感）。
- 转场：00:00 那一帧白闪 → S10。
- 声音：时钟 tick 由 16 分音符加速到 32 分音符，滤波器打开，最后一拍上扬。

**S10 · 15.000–16.875（小节 9）· 荔枝币与成长飞出**
- 画面：clip_focus_claim：拍 1 点击「完成并领取奖励」，应用真实奖励提示弹出「完成 25 分钟专注 · 荔枝币 +25 · 荔宝成长 +25」。同一拍按钮处爆出 60 颗 `i-coin` 与 12 颗荔枝粒子，抛物线飞向右上角的「荔枝币」计数牌，计数 40→65 滚动；荔宝 `celebrate` 从下边跳入。背景卡片后方隐约是 ui_focus_week（这一周的专注柱状图）。
- 素材：clip_focus_claim、ui_focus_week；sprites icon_coin、crop_lychee、pet_libao_celebrate_0-5、icon_chest。
- 字：「+25 荔枝币 · +25 成长」Fusion Pixel 120px 金色；注脚「每完成 1 分钟 = 1 荔枝币 + 1 成长」Noto Sans SC 26px。
- 运动：卡片 rotateY -6°，粒子层视差 1.8；计数牌每进一枚币轻跳 2px。
- 转场：拍 4 金币往下倾泻，镜头**下摇**跟着金币落进 S11 的农田。
- 声音：拍 1 金币和弦（方波 B5→E6 + 镲），之后金币叮当按 16 分音符散落。

**S11 · 16.875–18.750（小节 10）· 种菜 · 浇水 · 离线也在长**
- 画面：ui_farm_overview（湖畔的六块小田）以 rotateX 22°→6° 的 2.5D 透视从上方摇入，镜头推近成熟的萝卜田。农田旁荔宝播 `water`，水滴 `i-water` 粒子从壶嘴落下；草莓田上「已浇水」标签闪一下。
- 素材：ui_farm_overview；sprites bg_courtyard、pet_libao_water_0-5、icon_water、crop_radish、crop_strawberry、crop_blueberry。
- 字：「种菜 · 浇水 · 离线也在长」Fusion Pixel 96px。
- 运动：透视摊平 + 1.0→1.25 推近；前景 berrybush 视差滑过。
- 转场：硬切。
- 声音：音乐过渡段，滤波逐步打开；浇水「哗」声。

**S12 · 18.750–20.625（小节 11）· 回来收一颗萝卜**
- 画面：clip_farm_harvest：拍 1 点击成熟萝卜田，真实奖励提示「收获入仓 · 小萝卜 +2 · 荔宝成长 +1」；同拍两颗小萝卜（×12）从田里蹦出、旋转着冲向镜头放大到 ×40，几乎贴脸（拍 2）。农田旁荔宝播 `harvest`，气泡「满满一小篮！我负责扶稳，你来放。」。拍 3–4 画面整体压暗，为高潮蓄力。
- 素材：clip_farm_harvest、ui_pet_window_bubbles；sprites crop_radish、pet_libao_harvest_0-5。
- 字：「回来收一颗萝卜」Fusion Pixel 120px。
- 运动：萝卜冲镜头 + 镜头轻震；拍 3–4 缓慢后拉 1.25→1.1。
- 转场：拍 4 最后一个 8 分音符全黑静音（1/8 拍「呼吸」）→ 高潮。
- 声音：收获 pop + 小号角式三音；拍 3–4 riser + 军鼓滚奏。

### 段 4 · 庭院世界（20.625–33.750，小节 12–18）

**S13 · 20.625–22.500（小节 12）· 荔湖晴昼（DROP）**
- 画面：clip_scene_lake_dolly：用应用自己的三渲二场景（buildCampusScene 'lake'）做真实 3D 推镜，镜头沿湖岸弯道向白红教学楼推进 + 5° 环绕；湖面波纹、棕榈正常动画。前景叠真实像素花草（tallgrass/berrybush ×14）高速横滑形成视差，荔宝名牌小卡在右下角。
- 素材：clip_scene_lake_dolly；sprites flora_tallgrass、flora_berrybush、pet_libao_idle_0-5。
- 字：左上「03 庭院世界」；拍 1 场景名「荔湖晴昼」Fusion Pixel 168px 砸入；注脚「校园主题创作」Noto Sans SC 22px。
- 运动：3D 真推（相机距离 1.12→0.86），前景 ×2.0 视差。
- 转场：硬切在拍 1；小节末甩镜。
- 声音：DROP——全鼓组 + 主旋律 + 低音；拍 1 镲片 + 冲击。

**S14 · 22.500–24.375（小节 13）· 雨后书屋**
- 画面：clip_scene_bookshop_dolly：镜头从石板路推向书店门面与雨棚；前景 berrybush 与几颗 `i-water` 水珠视差掠过。
- 素材：clip_scene_bookshop_dolly；sprites flora_berrybush、icon_water、icon_book。
- 字：「雨后书屋」Fusion Pixel 168px。
- 运动：3D 推镜 + 轻微俯仰。
- 转场：甩镜进，拍 3 白闪一次（音乐 accent）。
- 声音：主旋律第二句。

**S15 · 24.375–26.250（小节 14）· 蓝调晚庭**
- 画面：clip_scene_terrace_dolly：暮色露台、育苗架、暖窗与灯串，镜头上升并前推；前景 `i-lantern` 像素灯笼漂浮。拍 3–4 画面一分为四：右下角小窗依次闪现 ui_home_pixel（像素庭院）与另外两套风景缩略，表示「四种风景」。
- 素材：clip_scene_terrace_dolly、ui_home_pixel；sprites icon_lantern、icon_flower。
- 字：「蓝调晚庭」Fusion Pixel 168px；拍 3 起副字「三套风景 + 像素庭院，整个应用一起换」Noto Sans SC Bold 40px。
- 运动：3D 升降推镜；分屏时四宫格以 8 分音符依次翻转（rotateY 90°→0）。
- 转场：硬切。
- 声音：主旋律第三句，拍 3 和弦变化。

**S16 · 26.250–28.125（小节 15）· 收成变成庭院建设**
- 画面：拍 1–2 clip_build_picnic：「回忆与建设」卡片「下一处小变化 · 湖畔野餐角」，点击「布置湖畔野餐角 →」，真实提示「湖畔野餐角建好啦」。拍 3 切 ui_farm_picnic_built：农田像素场景里野餐角原画（project_picnic ×10）一行一行「搭」出来（自下而上，每 16 分音符 2 行），荔宝在旁播 `build`；拍 4 右侧三张建设小牌依次滑入「湖畔野餐角 · 窗边育苗架 · 湖畔灯径」（用 projectArt 原画）。
- 素材：clip_build_picnic、ui_farm_picnic_built；sprites project_picnic、project_seedrack、project_lakeLights、pet_libao_build_0-5、crop_radish、crop_strawberry、icon_coin。
- 字：「收成 + 荔枝币 → 庭院建设」Fusion Pixel 96px。
- 运动：卡片 3D 翻转（rotateY 0→-14°）后推进到场景；野餐角搭建时镜头每 2 行微推。
- 转场：拍 4 末**穿屏推入**一张 2048 棋子 → S17。
- 声音：搭建「咚咚」按 16 分音符；拍 4 riser 进入 2048 攀升。

**S17 · 28.125–31.875（小节 16–17）· 伙伴小桌 2048：一路合到荔宝丰收礼（高潮）**
- 画面：巨型 4×4 棋盘（arcade.css 的木桌配色，棋子用 tileArtwork 原画 ×10，下方数字仍显示），3D 倾斜 rotateX 24°，随拍缓慢旋转 rotateZ -4°→4°。小节 16 每拍一次合并：2+2→4 嫩芽、4+4→8 小萝卜、8+8→16 草莓、16+16→32 蓝莓、32+32→64 荔枝、64+64→128 萝卜篮、128+128→256 草莓篮、256+256→512 蓝莓篮。每次合并：两枚棋子相向滑动 3 帧 → 撞击 → 新棋子 scale 1.35→1 弹出，同时迸出该作物的像素粒子，棋子名在上方闪现（Fusion Pixel 72px）。小节 17 拍 1：512+512→1024 荔枝篮；拍 2：全场停顿、只剩两枚 1024 发光、镜头急推；拍 3：**1024+1024→2048「荔宝丰收礼」**——棋子放大到填满画面（×28），荔宝礼盒原画占满屏，白闪 2 帧 + 震屏 + 全素材彩纸（四种作物、金币、爱心、种子）360° 爆发；拍 4：标题砸出。
- 素材：（全部像素素材）sprites tile_2…tile_2048、crop_radish、crop_strawberry、crop_blueberry、crop_lychee、icon_coin、icon_heart、icon_seed、pet_libao_static_happy。
- 字：左上「伙伴小桌 · 2048」Fusion Pixel 72px；合并时的棋子名「种子袋 2 → 嫩芽 4 → 小萝卜 8 → 草莓 16 → 蓝莓 32 → 荔枝 64 → 萝卜篮 128 → 草莓篮 256 → 蓝莓篮 512 → 荔枝篮 1024」；高潮主字「荔宝丰收礼！」Fusion Pixel 192px 金色 + 「2048」。
- 运动：每拍合并伴随 3% 推镜（累计 1.0→1.3）；拍 2 急推 1.3→1.6；拍 3 爆炸后镜头弹回 1.0 并 8 帧震屏。
- 转场：硬切到 S18（拍 1）。
- 声音：每次合并一个上行五声音阶的方波音（D5 E5 F#5 A5 B5 D6 E6 F#6 A6），合并点就是底鼓点；小节 17 拍 2 刹车（tape-stop）+ 吸气式 riser；拍 3 全片最大冲击：低频 boom + 全乐队和弦 + 双镲；拍 4 闪光琶音。

**S18 · 31.875–33.750（小节 18）· 真实界面：丰收礼与备种礼**
- 画面：拍 1–2 ui_arcade_won：应用里的真实棋盘，含「荔宝丰收礼 2048」棋子，提示文字「荔宝丰收礼合成啦！已经达到 2048，还可以继续挑战自己的纪录。」（裁掉本局得分与最高纪录栏，避免误读为真实得分）。拍 3–4 clip_arcade_claim：点「领取种子与小礼」，真实提示「备种礼已收进背包 · 草莓种子 +1 · 荔枝币 +8 · 荔宝成长 +3」，一枚种子袋棋子飞回农田方向。
- 素材：ui_arcade_won、clip_arcade_claim；sprites tile_2、icon_seed、icon_coin。
- 字：「每天合出 128，领一份备种礼」Fusion Pixel 72px；副字「没有充值 · 没有排行榜 · 只和自己的纪录比」Noto Sans SC 30px。
- 运动：卡片 3D 回正 rotateX 12°→0，慢推；种子袋飞出时视差。
- 转场：小节末柔和的像素块溶解（音乐进入间奏）。
- 声音：高潮余波，鼓组减半；领取时金币和弦。

### 段 5 · 课程笔记（33.750–39.375，小节 19–21）

**S19 · 33.750–35.625（小节 19）· 课程笔记 · Markdown**
- 画面：clip_note_write：「学习书屋 → 课程笔记」，左侧「我的课程书架」有「高等数学 A / 数据结构 / 大学英语」，右侧打开「第三章 · 函数极限」（课堂记录模板）。在「书写」模式下键入 Markdown：`## 重点与例子` 下打出「- ε-δ 定义：任给 ε>0，存在 δ>0……」。书架与正文两层 3D 分离（书架层 translateZ -120，正文层 0），镜头横移产生视差。栗栗（×12）在正文右下角播 `focus`。
- 素材：clip_note_write；sprites pet_cat_focus_0-5、icon_book、icon_quill。
- 字：左上「04 课程笔记」；主字「课程笔记 · Markdown」Fusion Pixel 96px。
- 运动：横移 + 微推 1.0→1.12。
- 转场：硬切。
- 声音：间奏——底鼓撤掉，低通 pad + 柔和电钢琴；键盘 tick。

**S20 · 35.625–37.500（小节 20）· 本页大纲**
- 画面：clip_note_outline：拍 1 切到「阅读」模式，标题排版生效；拍 2 展开「本页大纲」（今天的主题 / 重点与例子 / 还没弄懂 / 课后要做）；拍 3 点「还没弄懂」，正文平滑跳到该标题。
- 素材：clip_note_outline。
- 字：「本页大纲，一点就跳」Fusion Pixel 96px。
- 运动：镜头先推大纲面板 1.12→1.4，再跟随跳转向下摇。
- 转场：硬切。
- 声音：书页翻动 + 三音 chime。

**S21 · 37.500–39.375（小节 21）· 选一句，转成待办**
- 画面：clip_note_to_todo：拍 1 拖选正文中的「课后做完习题 3.2」，拍 2 点「加入学习待办」，真实提示出现；同时这句话被复制成一张纸条（Noto Sans SC，暖纸底）从正文里飞出，落进右上角「我的小事」清单图标里。
- 素材：clip_note_to_todo；sprites icon_scroll、icon_quill、pet_cat_celebrate_0-5。
- 字：「选一句，转成待办」Fusion Pixel 96px；注脚「笔记保存在本机 · 可导出 .md」Noto Sans SC 26px。
- 运动：纸条飞行轨迹带 3 帧拖影；卡片 rotateY 0→8°。
- 转场：拍 4 末**故障转场**（RGB 分离 + 2 帧黑）→ S22。
- 声音：选中 swish、落入 click；拍 4 小 riser 被「断电」音效截断。

### 段 6 · 校园网（39.375–46.875，小节 22–25）

**S22 · 39.375–41.250（小节 22）· 断网了？**
- 画面：ui_net_offline：「校园网」页「当前连接」显示「外网不可用」（`i-disconnect` 红色图标），「校园认证 · 门户未检测到在线会话。」。拍 1 故障闪烁后画面稳定；`i-disconnect` 图标 ×16 巨大地压在左侧，信号柱一根根熄灭（16 分音符）。
- 素材：ui_net_offline；sprites icon_disconnect、icon_signal。
- 字：左上「05 校园网」；主字「断网了？」Fusion Pixel 168px，`#A03F3B`。
- 运动：卡片微抖（2 帧一次，2px），镜头 1.0→1.1。
- 转场：硬切。
- 声音：bitcrush 下滑音 + 半拍静音；之后紧张的 8 分音符低音脉冲。

**S23 · 41.250–43.125（小节 23）· 网络诊断，逐项排查**
- 画面：clip_net_diag：拍 1 点「运行网络诊断」，结果行出现。Remotion 在卡片上方把这行真实结果拆成四行清单，每拍点亮一行（左侧像素图标 + 结果）：
  1. 拍 1「区域判定：教学区（深澜 SRun）」✓（`i-compass`）
  2. 拍 2「互联网：不可用」✗（`i-disconnect`，红）
  3. 拍 3「教学区门户：可达」✓（`i-signal`，绿）
  4. 拍 4「宿舍区门户：未确认」·（灰）
  拍 4 后半拍，结论条滑出：「你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，密码是统一身份认证密码」。
- 素材：clip_net_diag；sprites icon_compass、icon_disconnect、icon_signal、icon_shield。
- 字：「网络诊断，逐项排查」Fusion Pixel 96px；清单文字 Noto Sans SC Bold 38px；注脚「演示数据」。
- 运动：清单逐行 translateX -60→0；镜头逐行下移。
- 转场：硬切。
- 声音：每拍一个确认音（✓ 上行双音 / ✗ 低频 buzz / · 中性 blip），踩在拍上。

**S24 · 43.125–45.000（小节 24）· 自动判断教学区 / 宿舍区**
- 画面：clip_net_login：「连接 / 更换账号」表单，「所在区域」显示「自动识别」。拍 1 Remotion 按源码原文重建下拉列表展开（「自动识别 / 教学区 · 深澜 / 宿舍区 · Dr.COM」）；拍 2 画面左右分屏两张区域卡「教学区 · 深澜 SRun」「宿舍区 · Dr.COM」，一道像素扫描线扫过，停在「教学区」并点亮；拍 3 校园卡号框键入演示号「123456」，密码框 8 个圆点；拍 4 点击「登录校园网」。
- 素材：clip_net_login；sprites icon_key、icon_compass。
- 字：「自动判断 教学区 / 宿舍区」Fusion Pixel 96px。
- 运动：分屏卡片 3D 对开（rotateY ±20°→0）；拍 4 推近按钮 1.0→1.5。
- 转场：拍 4 末按钮放大成白闪 → S25。
- 声音：扫描 sweep；键入 tick；拍 4 上扬 riser。

**S25 · 45.000–46.875（小节 25）· 一个按钮，登录校园网 + 校园服务一瞥**
- 画面：拍 1–2 ui_net_online：「外网可用 · 教学区（深澜 SRun）」「校园认证 · 当前网络出口已在线。」绿色，`i-signal` 信号柱逐根亮起，荔宝 `celebrate` 从角落跳起。拍 3–4 甩镜到 ui_services_notices（「校园服务 → 学校公告」按学院选择的真实列表）与 ui_study_calendar_strip（官方校历 / 教学周条），两张卡片斜插叠放。
- 素材：ui_net_online、ui_services_notices、ui_study_calendar_strip；sprites icon_signal、icon_calendar、icon_bell、pet_libao_celebrate_0-5。
- 字：拍 1「一个按钮，登录校园网」Fusion Pixel 96px；拍 3「学院公告 · 官方校历，不用登录也能看」Noto Sans SC Bold 40px；注脚（全小节常驻）「校园网认证仍在现场验收 · 画面为演示数据」Noto Sans SC 22px。
- 运动：信号柱逐根 scaleY；拍 3 甩镜 + 两卡 3D 叠放。
- 转场：硬切。
- 声音：拍 1「上线」成功和弦，鼓组回归。

### 段 7 · 信任与平台（46.875–52.500，小节 26–28）

**S26 · 46.875–48.750（小节 26）· Windows · macOS 预览版**
- 画面：两扇窗户从左右两侧以 rotateY ±35°→±8° 飞入，在拍 1 交汇：左边通用 Windows 风窗口框（右上三按钮）里是 ui_home_lake，窗口边坐着荔宝；右边 Mac 风窗口框（左上三圆点）里是 ui_home_lake_mac，窗口边站着小白。拍 3 两窗下方分别亮起平台名。
- 素材：ui_home_lake、ui_home_lake_mac；sprites pet_libao_idle_0-5、pet_egret_idle_0-5、bg_campus。
- 字：左上「06 放心用」；「Windows」「macOS（预览版）」Fusion Pixel 96px。
- 运动：两窗 3D 对开后保持轻微呼吸（±1°），镜头 1.0→1.05。
- 转场：硬切。
- 声音：最终副歌起，全乐队。

**S27 · 48.750–50.625（小节 27）· 本地保存 · 无遥测 · 断网也能用**
- 画面：ui_settings_data（设置 → 存档与隐私：导出庭院与待办、备份课程笔记、删除已保存凭据）作为倾斜背景卡；前景三块木框徽章按拍 1/2/3 依次砸下：`i-chest`「数据只存本机」、`i-shield`「没有遥测」、`i-book`「断网也能用」，每块落地 4 帧回弹 + 尘土像素。
- 素材：ui_settings_data；sprites icon_chest、icon_shield、icon_book。
- 字：三块徽章文字 Fusion Pixel 72px；注脚「庭院、待办、专注、课程笔记不需要学校账号」Noto Sans SC 26px。
- 运动：背景卡 rotateX 14° 缓慢下摇；徽章视差 1.6。
- 转场：硬切。
- 声音：每拍一记冲击 + 镲。

**S28 · 50.625–52.500（小节 28）· 开源 MIT · 324 帧原创伙伴动作**
- 画面：镜头从荔宝 `signature` 的一帧（填满全屏）急速后拉，揭示一整面「动作墙」——三位伙伴 18 组动作 × 6 帧 = 324 格，每格都在循环播放各自动作（暖纸格底、纸线分隔）。拍 3 墙面前浮现大字。
- 素材：（像素素材）sprite pet_wall_324（由三位伙伴全部动画帧生成），pet_libao_signature_0-5。
- 字：「开源 · MIT」Fusion Pixel 168px；副字「3 位原创伙伴 · 324 帧逐帧像素动作 · 学生自制」Noto Sans SC Bold 36px。
- 运动：后拉 scale 8→1（指数缓动，2 拍内完成），之后墙面 rotateX 10° 漂移。
- 转场：小节末全屏像素块溶解成 campus.png → S29。
- 声音：副歌最后一句，拍 4 反向镲吸入。

### 段 8 · 结尾（52.500–60.000，小节 29–32）

**S29 · 52.500–56.250（小节 29–30）· Logo 与标语**
- 画面：campus.png 压暗暖调（叠 `#492A16` 35%）作背景，前景花草视差；拍 1 应用图标（app_icon_1024，圆角荔枝）从中心砸出并弹性回位，同时「szuDesktop · 荔枝庭院」Fusion Pixel 144px 展开；第 30 小节三位伙伴在下方一字排开各播拿手动作（荔宝举牌、栗栗进纸箱、小白理羽毛），荔枝/萝卜/草莓/蓝莓粒子缓慢飘落。
- 素材：（像素素材）sprites bg_campus、app_icon_1024、pet_libao_signature_0-5、pet_cat_signature_0-5、pet_egret_signature_0-5、crop_*、flora_*。
- 字：标语「选一位像素伙伴，专注一会儿，回来收一颗萝卜。」Noto Sans SC Bold 44px（第 30 小节拍 1 打字出现）。
- 运动：logo 弹性 overshoot；背景慢推 1.0→1.06。
- 转场：硬切。
- 声音：第 29 小节拍 1 结尾大冲击 + 主动机再现；第 30 小节和弦延音。

**S30 · 56.250–60.000（小节 31–32）· 下载与声明**
- 画面：logo 上移缩小；中部一块木框下载牌：「下载」+「github.com/SzuDesktopTeam/szudesktop」；下排两枚平台小牌「Windows」「macOS（预览版）」+「开源 MIT」；底部声明条「学生自制 · 与深圳大学官方无关」常驻到最后一帧。第 32 小节拍 1 荔宝挥手（`greet`）并冒气泡「嗨，我是荔宝。今天先做哪件小事？」，最后 2 拍画面静止，音乐尾音衰减。
- 素材：（像素素材）sprites app_icon_1024、pet_libao_greet_0-5、icon_coin、bg_campus。
- 字：下载地址 Fusion Pixel 72px；平台小牌 Noto Sans SC Bold 34px；声明 Noto Sans SC 30px；最小注脚「画面中的账号与记录均为演示数据」Noto Sans SC 20px。
- 运动：下载牌从下方 translateY 80→0；末 2 拍静止。
- 转场：最后 0.5 s 音频淡出，画面保留到 60.000（不淡黑，方便社交平台封面）。
- 声音：第 32 小节拍 1 一声金币「叮」，混响尾巴到 60.0 s。

---

## 4. 竖版 9:16 分镜（30 s / 16 小节）

竖版不另采素材：所有界面采集按 3200×1800 原图在 1080×1920 画幅里做竖向裁切/双卡上下排布，像素素材整体放大 1.25 倍；所有字号比横版大 1.3–1.5 倍，主字最多 8 个汉字一行，安全区上 220 px、下 320 px 不放字（避开平台 UI）。

| 镜头 | 时间 | 复用 | 画面 | 屏幕文字 |
| :-- | :-- | :-- | :-- | :-- |
| V01 | 0.000–0.938 | S01 | campus.png 马赛克竖向裁切逐级清晰，巨型荔枝砸下 | — |
| V02 | 0.938–3.750 | S02+S03 | 荔宝 ×18 占上半屏，粒子爆发；拍 7/8 栗栗、小白从下方左右滑入 | 「szuDesktop」/「荔枝庭院」两行 168px；「把深大的一小片校园，搬到你的桌面」 |
| V03 | 3.750–5.625 | S04+S05 | 竖向裁切桌面：主窗口在上、荔宝坐在窗口边沿冒气泡，拍 3 被拖到下方并滚轮放大 | 「伙伴常驻桌面」+「拖动 · 滚轮缩放」 |
| V04 | 5.625–7.500 | S06+S07 | 拍 1 菜单「摸摸头」爱心；拍 2/3/4 像素溶解换成栗栗（纸箱）、小白（理羽毛）、回到荔宝 | 「荔宝 · 栗栗 · 小白」 |
| V05 | 7.500–9.375 | S09+S10 | 计时器 25:00→00:00 延时（拍 1–2），拍 3 点「完成并领取奖励」金币爆发 | 「专注 25 分钟」→「+25 荔枝币」 |
| V06 | 9.375–11.250 | S12 | 点成熟萝卜田，两颗萝卜冲镜头；荔宝抱回收成 | 「回来收一颗萝卜」 |
| V07 | 11.250–13.125 | S13+S14+S15 | 荔湖晴昼（拍 1–2）→ 雨后书屋（拍 3）→ 蓝调晚庭（拍 4），3D 推镜竖向裁切 | 「三套风景，随心换」+ 场景名 |
| V08 | 13.125–16.875 | S17 | 2048 棋盘竖排：小节 8 每个 8 分音符合并一次（4→512），小节 9 拍 1 合出 1024，拍 3 荔宝丰收礼爆满全屏 | 「伙伴小桌 2048」→「荔宝丰收礼！」 |
| V09 | 16.875–18.750 | S16 | 野餐角像素原画逐行搭建，荔宝 `build` | 「收成变成庭院建设」 |
| V10 | 18.750–20.625 | S20+S21 | 本页大纲展开（拍 1–2），选句→加入学习待办纸条飞出（拍 3–4） | 「课程笔记 · 选句转待办」 |
| V11 | 20.625–22.500 | S23+S25 | 诊断四行清单在拍 1/2/3 快速点亮，拍 4 变「当前网络出口已在线」 | 「连不上？先诊断」；注脚「校园网认证仍在现场验收 · 演示数据」 |
| V12 | 22.500–24.375 | S27+S28 | 三块徽章竖向依次砸下：数据只存本机 / 没有遥测 / 开源 MIT，背后动作墙 | 三块徽章字 |
| V13 | 24.375–30.000 | S29+S30 | 图标砸出 → 片名 → 三位伙伴拿手动作 → 下载牌与平台小牌 → 声明条常驻；末 1 拍静止 | 「szuDesktop · 荔枝庭院」「Windows · macOS（预览版）」「github.com/SzuDesktopTeam/szudesktop」「学生自制 · 与深圳大学官方无关」 |

---

## 5. 配乐与音效（全部程序合成）

用 Python（numpy）逐样本合成 48 kHz 立体声 WAV，不使用任何外部音乐、采样或音色库；横版与竖版共用同一套音色与动机，按各自小节表编排。

**音色**：底鼓（正弦 150→45 Hz 指数下滑 + 2 ms click）、拍手/军鼓（带通白噪 + 200 Hz 正弦）、踩镲（高通噪声 30 ms，16 分音符力度起伏）、低音（方波+锯齿，低通 900 Hz，8 分音符八度跳）、主旋律（25% 占空比脉冲波，轻颤音，3/16 拍回声）、琶音（三角波 16 分音符）、铺底（4 层失谐锯齿 + 慢起音 + 低通）、电钢琴（FM 两算子）。
**调性与和弦**：D 大调。主歌 Bm–G–D–A；副歌 D–A–Bm–G；间奏 G–A–F#m–Bm；主动机「荔-枝-庭-院」= D5–F#5–A5–B5。
**音效（与画面对点）**：金币 blip（方波 B5→E6，40+60 ms）、气泡 pop、菜单 click、滚轮 tick、键盘 tick、whoosh（滤波噪声扫频 250 ms）、riser（1–2 小节噪声 + 上行锯齿）、impact（50 Hz 正弦 boom + 噪声 burst + 混响）、2048 合并音（上行五声音阶方波）、诊断 ✓/✗/·、断电 bitcrush 下滑、tape-stop。
**混音**：铺底与低音对底鼓做侧链压缩；人声频段（1–4 kHz）留给音效；母带限幅 -1 dBTP，整体响度约 -14 LUFS。

**横版结构（32 小节）**

| 小节 | 段落 | 内容 |
| :-- | :-- | :-- |
| 1–2 | Hook | 拍 1–2 军鼓滚奏 + riser；拍 3 冲击 + 和弦 stab；拍 3–8 全鼓组 + 主动机 |
| 3–6 | 主歌 A | 轻四拍底鼓、2/4 拍手、拨弦琶音、低音；给气泡、拖动、滚轮音效留空间 |
| 7–10 | 主歌 B / 积累 | 加 16 分踩镲与时钟 tick；第 9 小节金币和弦；第 10 小节滤波打开 |
| 11 | 预冲 | 拍 1 收获 pop；拍 3–4 riser + 军鼓滚奏；最后 1/8 拍全静音 |
| 12–15 | 副歌 1（DROP） | 全鼓组 + 主旋律 + 低音；每小节第 1 拍镲片对场景名 |
| 16–17 | 2048 攀升 | 每拍一次合并音，音高逐级上升；17 小节拍 2 tape-stop，拍 3 全片最大冲击，拍 4 闪光琶音 |
| 18 | 余波 | 鼓组减半，金币和弦 |
| 19–21 | 间奏 | 撤底鼓，低通铺底 + 电钢琴，键盘 tick；21 小节拍 4 小 riser 被「断电」截断 |
| 22 | 故障 | bitcrush 下滑 + 半拍静音，8 分音符紧张低音 |
| 23–25 | 积累 2 | 诊断音逐拍；24 小节上扬；25 小节拍 1「上线」成功和弦，鼓组回归 |
| 26–28 | 副歌 2 | 全乐队；27 小节徽章三连冲击；28 小节拍 4 反向镲 |
| 29–30 | 尾声 | 29 小节拍 1 结尾冲击 + 主动机再现；30 小节和弦延音 |
| 31–32 | 收尾 | 鼓组渐稀；32 小节拍 1 金币「叮」，混响尾巴到 60.0 s，最后 0.5 s 淡出 |

**竖版结构（16 小节）**：1–2 Hook（同横版）｜3–4 主歌（压缩）｜5–6 积累（金币、收获，6 小节末 riser）｜7–10 DROP + 2048（8 小节 8 分音符合并，9 小节拍 3 最大冲击，10 小节余波）｜11–13 副歌延续（笔记、诊断、徽章，逐拍音效）｜14–16 尾声（14 小节拍 1 logo 冲击，30.0 s 收尾）。

---

## 6. 采集清单（footage）

共 28 条：still 14 条、clip 14 条（含 3 条 3D 风景逐帧渲染）。duration_s 对 still 表示成片里的上屏总时长，对 clip 表示需要录到的素材长度（已含前后各约 0.3 s 余量）。

| key | 类型 | 秒 | 怎么得到 |
| :-- | :-- | --: | :-- |
| ui_home_lake | still | 7.5 | 存档 A，homeSkin='lake'，Windows 桥接替身（platform 'win32'），路由 `#home`；等容器 `data-scene-state=ready` 后再等 1 s（3D 渲染完成）；视口 1600×900 DPR2 截全视口；顶栏版本号保持引擎真实值或裁掉，不伪造。用于 S04/S07/S26 |
| ui_home_lake_mac | still | 1.9 | 同上，桥接替身 platform 'darwin'（界面换 macOS 文案）。用于 S26 右窗 |
| ui_home_pixel | still | 0.9 | 同上，homeSkin='pixel'（像素庭院）。用于 S15 四宫格 |
| clip_focus_todo_add | clip | 3.0 | 存档 A，`#study/focus`；在 `#todo-text`（占位「留一件值得完成的小事」）以 117 ms/字键入「复习高数第三章」，拍 4 点「添加」；screencast 录制 |
| clip_focus_start_timelapse | clip | 3.5 | 接上条：`#focus-task` 选中该待办，点 `[data-action=focusStart][data-minutes="25"]`；之后把注入的时钟以约 ×600 推进（2.5 s 走完 25 分钟），`#focus-clock` 从 25:00 走到 00:00；录制 |
| clip_focus_claim | clip | 2.5 | 接上条（时钟已过 end）：点 `#focus-claim`「完成并领取奖励」，录到 `.reward-toast` 完整出现（「完成 25 分钟专注 · 荔枝币 +25 · 荔宝成长 +25」） |
| ui_focus_week | still | 1.9 | 存档 A，`#study/focus` 滚到「这一周，慢慢积累」卡片，区域截图（7 天柱状图） |
| ui_farm_overview | still | 1.9 | 存档 A，`#garden/farm`；区域截图「湖畔的六块小田」卡片（含农田旁伙伴与「已浇水」标签），裁掉委托与小计划里可能出现的其他伙伴 |
| clip_farm_harvest | clip | 3.0 | 存档 A，`#garden/farm`：点田 1（成熟小萝卜）→ 在「我的农具箱」点收获；录到奖励提示「收获入仓 · 小萝卜 +2 · 荔宝成长 +1」与荔宝回应气泡 |
| clip_scene_lake_dolly | clip | 3.0 | 逐帧渲染：在引擎同源地址用请求拦截返回一页临时 harness（`/assets/garden/__promo_scene.html`，不落盘到仓库），import `./vendor/three/three.module.mjs`、`./vendor/sakura/core/*`、`./home-scene-world.mjs`，照 home-scene-renderer.mjs 的 mountHomeScene 复刻灯光、天空、雾、Pipeline（pixelBudget 1.6e6）与描线参数，画布 1920×1080；第 f 帧调用 `world.update(f/60)`，相机距离系数 1.12→0.86（easeInOut）并绕 Y 轴 -3°→+3°，`pipeline.render()` 后截图，共 180 帧。WebGL 不可用时退回 ui_home_lake 的首页风景区 + Remotion 2D 推镜 |
| clip_scene_bookshop_dolly | clip | 3.0 | 同上，skin='bookshop'，相机距离 1.10→0.88，附加俯仰 +2°→-1° |
| clip_scene_terrace_dolly | clip | 3.0 | 同上，skin='terrace'，相机距离 1.08→0.86，目标点上移 0→+1.2 单位（升降感） |
| clip_build_picnic | clip | 2.5 | 存档 B，`#garden/journal` 定位 `#garden-projects`：点「布置湖畔野餐角 →」，录到提示「湖畔野餐角建好啦」 |
| ui_farm_picnic_built | still | 1.9 | 建成后的存档，`#garden/farm`，截农田场景（`.garden-built-scene--farm` 里出现野餐角） |
| ui_arcade_won | still | 0.9 | 存档 A 的 2048 预置为已合出 2048 的棋盘（例：第一行 2048/512/128/32，其余散放 256/64/16/8/4/2），won=true，5 枚里程碑已得，qualifiedDay=今天；`#garden/arcade` 区域截图：棋盘 + 「这局合到了」+ 提示文字，**裁掉本局得分与最高纪录** |
| clip_arcade_claim | clip | 2.0 | 同一状态点「领取种子与小礼」，录到「备种礼已收进背包 · 草莓种子 +1 · 荔枝币 +8 · 荔宝成长 +3 · 亲密 +2」 |
| clip_note_write | clip | 3.0 | 演示笔记本，`#study/notes` 打开「第三章 · 函数极限」（课堂记录模板），书写模式下在「## 重点与例子」后键入「- ε-δ 定义：任给 ε>0，存在 δ>0……」；书架显示三门演示课程 |
| clip_note_outline | clip | 2.5 | 同一页：切到「阅读」，展开「本页大纲」，点「还没弄懂」跳转 |
| clip_note_to_todo | clip | 2.5 | 同一页：选中「课后做完习题 3.2」（用 Selection / setSelectionRange），点「加入学习待办」，录到提示 |
| ui_net_offline | still | 1.9 | `#network`；拦截 `/api/status` 返回 `{zone:'teaching', zone_label:'教学区（深澜 SRun）', internet_ok:false, online:false, online_known:true, online_state:'offline', saved:false, advices:[]}`（其余字段照引擎结构）；截「当前连接」卡片 |
| clip_net_diag | clip | 2.5 | 同上状态点「运行网络诊断」；拦截 `/api/diag` 延迟 600 ms 返回 `{zone:'teaching', zone_label:'教学区（深澜 SRun）', internet_ok:false, probed:true, teaching_portal_ok:true, dorm_portal_ok:false, dns_ok:true, dns_fake_ip:false, advices:[diagnose.go 教学区三条原文], notes:[]}` |
| clip_net_login | clip | 2.5 | 展开「连接 / 更换账号」，「所在区域」保持「自动识别」，键入演示卡号 123456 与演示密码（显示为圆点），不勾选记住；点「登录校园网」，拦截 `/api/login` 返回 `{ok:true, zone:'teaching', message:'认证成功'}`，随后 `/api/status` 切换为在线 |
| ui_net_online | still | 0.9 | `/api/status` 返回 `{zone:'online', zone_label:'教学区（深澜 SRun）', internet_ok:true, online:true, online_known:true, online_state:'online', online_zone:'teaching'}`；截「当前连接」卡片 |
| ui_services_notices | still | 0.5 | `#services/notices`，偏好里不填学院，停在「先选你的学院」的真实学院列表；`/api/campus/notices` 一律拦截不放行，不出现任何公告标题 |
| ui_study_calendar_strip | still | 0.5 | `#study/timetable`；拦截 `/api/campus/calendar` 返回 calendar.go 内置的已核实学期（2026–2027 学年第一学期，2026-08-31 起第 1 周，演示日 10-12 为第 7 周）；只截校历 / 教学周条，课表登录卡片不入镜 |
| ui_settings_data | still | 1.9 | `#settings/data`（Windows 桥接替身）：导出庭院与待办、备份课程笔记、删除已保存凭据 |
| ui_settings_desktop | still | 1.0 | `#settings/desktop`（桥接替身 desktopSettings 返回 petScale 1.5）：只裁「伙伴大小」滑杆做 S05 的 HUD 背板，可选 |
| ui_pet_window_bubbles | still | 6.0 | 用临时只读静态服务器（127.0.0.1:0）提供 desktop/electron/，打开 pet.html；`evaluateOnNewDocument` 注入 `window.szuPet` 替身（收集 onState/onSay/onAction/onScale/onReaction 回调，hit 为空函数），依次触发 `onAction({species, motion:true})`、`onScale(1.5)`、`onSay(台词)`，`omitBackground:true` 截透明 PNG；台词 5 句见 S04/S06/S07/S09/S30。失败时按 pet.html 的 CSS 在 Remotion 里重建气泡 |

## 7. 像素素材清单（sprites）

导出方法：Node 脚本直接 import 源码模块取 SVG 字符串（不改源码），包成独立 `<svg shape-rendering="crispEdges">`（需要的 `<defs>` 一并带上：2048 棋子要 `libao-happy`、`i-seed`、`f-*`），再用 headless Chrome `omitBackground` 截透明 PNG：一份按 viewBox 原尺寸 1×（Remotion 里 `image-rendering: pixelated` 整数倍放大），一份 ×8 备用。导出后检查每张图颜色数与原 SVG 填色一致（无抗锯齿杂色）。

| key | 来源 | 帧 |
| :-- | :-- | :-- |
| pet_libao_{action}_{0-5} | pet-animation-art.mjs `animationFrames('libao')`（symbol `petanim-libao-*`，viewBox 52×56） | 18 组 × 6 = 108 帧；本片主要用 celebrate、signature、greet、idle、look、pat、focus、water、harvest、build；时长按 pet-animation.mjs TIMINGS（荔宝 ×1.0），上屏时按拍重定时、帧序不变 |
| pet_cat_{action}_{0-5} | `animationFrames('chestnut')`（`petanim-cat-*`，20×22，节奏 ×1.16） | 108 帧；主要用 walk、signature（进纸箱）、focus、celebrate、idle |
| pet_egret_{action}_{0-5} | `animationFrames('egret')`（`petanim-egret-*`，32×32，节奏 ×1.3） | 108 帧；主要用 walk、signature（理羽毛）、idle |
| pet_{libao,cat,egret}_static_{normal,happy,sad,sleep} | pet-art.mjs `PET_SYMBOLS` | 每位 4 张 |
| crop_radish / crop_strawberry / crop_blueberry / crop_lychee | garden-items.mjs `cropIcon('radish')`；index.html `#f-straw` `#f-blue` `#f-lychee` | 各 1 张 16×16 |
| brand_lychee | index.html `#f-lychee`（顶栏品牌荔枝） | 1 张 16×16（S01 砸屏用 ×40） |
| tile_2 … tile_2048, tile_4096 | arcade-art.mjs `tileArtwork(value)` | 12 张 32×32：种子袋、嫩芽、小萝卜、草莓、蓝莓、荔枝、萝卜篮、草莓篮、蓝莓篮、荔枝篮、荔宝丰收礼、庆典 |
| icon_coin / heart / seed / water / chest / shield / key / signal / disconnect / compass / lantern / flower / book / quill / calendar / medal / bell / clock / scroll / cottage | index.html `#i-*` symbols | 20 张 16×16 |
| project_picnic / project_seedrack / project_lakeLights | garden-loop-ui.mjs `projectArt(id)` | 3 张 48×28；S16 另按行切片做逐行搭建 |
| flora_tallgrass / flora_berrybush | desktop/assets/garden/flora/*.png | 8×8、8×6 原图 |
| bg_campus / bg_courtyard | desktop/assets/garden/campus.png（1672×941）/ courtyard.png（1536×1024） | 原图 |
| app_icon_1024 | desktop/assets/szudesktop.icns 最大尺寸（Pillow 读取） | 1 张 1024×1024 |
| tray_icon | desktop/assets/szudesktop-trayTemplate@2x.png（黑色模板图，Remotion 里着暖纸色） | 1 张 |
| pet_wall_324 | 由上面三位伙伴的 324 帧拼成 18 行 × 18 列图集（每格 64×64，暖纸 `#F3E7CD` / `#EADCC1` 交替底，无文字标签） | 324 格，每格按各自动作循环 |
| cursor_pixel | 自绘 12×19 像素箭头光标（唯一非应用素材，只作操作指示） | 2 张（常态 / 按下） |

## 8. 文案核对

| 屏幕文字 | 依据 |
| :-- | :-- |
| szuDesktop · 荔枝庭院 | README 标题、index.html `<title>` |
| 把深大的一小片校园，搬到你的桌面。 | README 第 5 行标语原文 |
| 伙伴，常驻桌面 | README「让伙伴陪在桌面上」；garden.md：Windows 安装版与 macOS 版有独立透明窗口，关掉主窗口伙伴仍在 |
| 拖到哪都行 · 滚轮缩放 40%–200% | garden.md：按住拖动；滚轮每次 10 个百分点，范围 40%–200% |
| 点一下：聊两句 · 摸摸头 · 喂食 / 菜单全部条目 | garden.md「点一下打开菜单」；pet-controller.mjs 菜单原文 |
| 荔宝 · 栗栗 · 小白，随时切换 | pet-catalog.mjs；菜单「切换伙伴」，选择立即同步 |
| 桌面伙伴：Windows 安装版 · macOS 预览版 | README 功能表（便携版没有桌面伙伴） |
| 写一件小事 | study.md；占位「留一件值得完成的小事」（productivity.mjs） |
| 专注 25 分钟 · 5 / 25 / 45 / 自定 1–120 分钟 | study.md；focusView 按钮 |
| +25 荔枝币 · +25 成长；每完成 1 分钟 = 1 荔枝币 + 1 成长 | README/study.md 奖励规则；rewards.mjs focusClaim 提示 |
| 种菜 · 浇水 · 离线也在长 | garden.md：离线照样生长、浇水剩余时间缩到 75% |
| 回来收一颗萝卜；收获入仓 · 小萝卜 +2 · 荔宝成长 +1 | README 标语；rewards.mjs；CROPS 小萝卜一次 2 个、成长 1 |
| 荔湖晴昼 / 雨后书屋 / 蓝调晚庭；校园主题创作 | home-skins.mjs；garden.md「以校园为主题的创作，不是测绘复原」 |
| 三套风景 + 像素庭院，整个应用一起换 | garden.md 风景环境「贯穿全应用」 |
| 收成 + 荔枝币 → 庭院建设；湖畔野餐角 · 窗边育苗架 · 湖畔灯径 | garden-loop.mjs PROJECTS；rewards.mjs「湖畔野餐角建好啦」 |
| 伙伴小桌 · 2048；种子袋 2 … 荔宝丰收礼 2048 | arcade-art.mjs TILE_LEVELS；garden.md 棋子表（合并蒙太奇为真实棋子原画演示，不显示分数） |
| 荔宝丰收礼！/ 荔宝丰收礼合成啦！… | arcade-ui.mjs boardMessage 原文 |
| 每天合出 128，领一份备种礼 | garden.md 每日备种礼；rewards.mjs puzzleClaim |
| 没有充值 · 没有排行榜 · 只和自己的纪录比 | garden.md「没有充值、现金交易、排行榜」；arcade 文案「继续挑战自己的纪录」 |
| 课程笔记 · Markdown | README/study.md |
| 本页大纲，一点就跳 | study.md 本页大纲 |
| 选一句，转成待办 | study.md「加入学习待办」 |
| 笔记保存在本机 · 可导出 .md | study.md 自动保存、「导出 .md」 |
| 断网了？ | 设问；画面文字为 network-status.mjs 原文 |
| 网络诊断，逐项排查 + 四行清单 + 结论 | diagResultHTML 字段、Zone.Label()、diagnose.go advices 原文；断线诊断 ✅ 可用 |
| 自动判断 教学区 / 宿舍区 | network.md 协议指纹判区（限制节：判区已在真实校园网实测）；app.mjs 下拉原文 |
| 一个按钮，登录校园网 + 注脚「校园网认证仍在现场验收 · 画面为演示数据」 | app.mjs「登录校园网」；README 认证为 🧪，故常驻注脚 |
| 学院公告 · 官方校历，不用登录也能看 | getting-started.md 原句（公告 🟡 部分可用，画面只出现学院列表） |
| Windows · macOS（预览版） | README 平台说明 |
| 数据只存本机 / 没有遥测 / 断网也能用 | README 安全与隐私、「庭院、待办、专注和课程笔记不需要学校账号，断网也能用」 |
| 开源 · MIT；3 位原创伙伴 · 324 帧逐帧像素动作 · 学生自制 | LICENSE；18 动作 × 6 帧 × 3 位 = 324（animationFrames 实测每位 108 帧）；README「深大学生自制、维护」 |
| 选一位像素伙伴，专注一会儿，回来收一颗萝卜。 | README 第 7 行原文 |
| github.com/SzuDesktopTeam/szudesktop；学生自制 · 与深圳大学官方无关 | README |
| 所有伙伴气泡 | pet-dialogue.mjs / pet-catalog.mjs 中荔宝、栗栗、小白的原句 |

原则：功能名称与界面文字一律照抄代码；「测试中」的功能（课表、成绩、学校登录、应用内预约、琴房、专注完成通知）一律不出现；校园网认证画面常驻注脚「校园网认证仍在现场验收 · 画面为演示数据」。

## 9. 成片自检

- [ ] 全片逐帧抽检（每 0.5 s 一帧）：无 Pingu、Skipper、阿青，无「企鹅」「小龟」「Noot」字样。
- [ ] 无课表、成绩、学校登录、预约、琴房、专注完成通知画面。
- [ ] 结尾含「学生自制 · 与深圳大学官方无关」与 github.com/SzuDesktopTeam/szudesktop；「macOS」后都带「预览版」。
- [ ] 标题只用 Fusion Pixel，正文只用 Noto Sans SC；截图里没有 PingFang 渲染（检查「荔」「庭」字形）。
- [ ] 没有真实姓名、学号、账号、IP；卡号只出现演示号 123456。
- [ ] 剪辑点与拍点偏差 ≤ 1 帧；音乐与音效均为程序合成。
- [ ] 横版 55–65 s、竖版 28–32 s；H.264 yuv420p + AAC、+faststart；单文件 ≤ 120 MB；像素边缘无模糊（检查 2048 棋子与荔宝放大帧）。
- [ ] 结束后无残留引擎或 Chrome 进程，临时配置目录已删除。
