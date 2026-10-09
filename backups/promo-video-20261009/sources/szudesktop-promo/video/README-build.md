# szuDesktop · 荔枝庭院 宣传片：Remotion 工程用法

工程根目录：`/Users/alakazan/workplace/szudesktop-promo/video/`（Remotion 4.0.532，React 19，TypeScript）。
分镜：`../work/storyboard.md`。成片输出到 `../out/`，检查用的中间产物在 `../work/remotion-check/`。

## 1. 已验证的链路（2026-10-05）

| 检查项 | 结果 |
| :-- | :-- |
| `npm run typecheck` | 通过 |
| `npx remotion compositions src/index.ts` | Main16x9 1920×1080 60fps 3600 帧（60.00 s）；Main9x16 1080×1920 60fps 1800 帧（30.00 s）；ComponentDemo 300 帧（5 s）；FontCheck、PixelCloseUp 两个 Still |
| `npm run demo`（5 秒组件演示） | `../work/remotion-check/component-demo.mp4`：H.264 High、yuv420p、1920×1080、60/1、300 帧（视频正好 5.000 s）、AAC 48 kHz 立体声 256k、faststart 为 true、9.3 MB、14.9 Mbit/s。用时约 40 s（并发 8） |
| x264 参数 | 从文件头确认：`crf=14 deblock=1:1:1 psy_rd=0.40 aq=1:0.60 bframes=5 vbv_maxrate=14000`（`-tune animation` 已生效） |
| 音轨 | `--props '{"music":…}'` 混入 48 kHz WAV 测试音，解码后峰值 0.218（`../work/remotion-check/audio-check-9x16.mp4`，同时验证了 debug 节拍 HUD） |
| 字体 | FontCheck：Fusion Pixel 78 段全部加载，Noto Sans SC 按需加载 42 段，片中文案共 360 个不同字符，Fusion Pixel **没有缺字**（`pixelMissing()` 返回空） |
| 浏览器 | 只用本机 Chrome 154 无头模式（`--headless=new`），屏幕上不弹窗；渲染结束后没有残留的 Chrome 进程 |

检查静帧在 `../work/remotion-check/stills/`：`FontCheck-0000.png`（全部文案的两种字体）、`PixelCloseUp-0000.png`（192/96 px 像素字和 Noto 正文，看 1:1 边缘）、`ComponentDemo-*.png`（演示各段），`Main16x9-1700.png` 和 `Main9x16-0900.png`（空壳占位卡）。

## 2. 命令

```bash
cd /Users/alakazan/workplace/szudesktop-promo/video
npm install                 # 走已配置的 npmmirror；esbuild 的 postinstall 不跑也没关系（二进制在 @esbuild/darwin-arm64）
npm run typecheck
npm run studio              # 不会自动开浏览器（setShouldOpenBrowser(false)），手动打开打印出来的地址
npm run demo                # 渲染 ComponentDemo → ../work/remotion-check/component-demo.mp4，并用 ffprobe 校验
npm run stills              # 渲染默认那组检查静帧 → ../work/remotion-check/stills/
node scripts/render-stills.mjs --comp Main16x9 --frames 0,1688,2400 --out ../work/stills-16x9
npm run sprites:demo        # 重新从应用源码栅格化演示用 sprite（public/demo/sprites）

# 成片（交付参数：CRF 14、preset slow、tune animation、maxrate 16:9 14M / 9:16 18M、AAC 256k 48k、+faststart）
node scripts/render.mjs --comp Main16x9 --out ../out/szudesktop-promo-16x9.mp4 --props '{"music":"assets/audio/music_16x9.wav"}'
node scripts/render.mjs --comp Main9x16 --out ../out/szudesktop-promo-9x16.mp4 --props '{"music":"assets/audio/music_9x16.wav"}'
# 可选参数：--frames 0-599（只渲一段）  --crf 16  --maxrate 12M --bufsize 24M  --concurrency 8  --props '{"debug":true}'（叠加节拍 HUD）
```

`scripts/render.mjs` 渲完会打印 `[verify]` 一行（编码、像素格式、帧率、帧数、时长、体积、码率、faststart），文件超过 120 MB 时会警告。16:9 片长 60 s，maxrate 默认 14M（约 107 MB 封顶）；如果用 16M，满码率时会到约 122 MB，超过上限。

也可以直接用 CLI：`npx remotion render src/index.ts Main16x9 out.mp4`。`remotion.config.ts` 已经设好 Chrome 路径、`chrome-for-testing` 模式、PNG 帧、CRF 14、yuv420p、AAC，但 **CLI 不会加 `-tune animation` 和 maxrate**，交付成片请用 `scripts/render.mjs`。

### 浏览器与 ffmpeg

- Chrome：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。必须用 `chromeMode: 'chrome-for-testing'`：默认的 headless-shell 模式会传 `--headless=old`，完整版 Chrome 132 以后已经不支持。`gl: 'angle'`（Metal），CSS 3D 合成走 GPU。设置在 `remotion.config.ts` 和 `scripts/lib.mjs` 两处，改的时候要同步。
- Remotion 自带 ffmpeg/ffprobe 7.1：`node_modules/@remotion/compositor-darwin-arm64/{ffmpeg,ffprobe}`。直接调用要加 `DYLD_LIBRARY_PATH=<该目录>`，或者用 `npx remotion ffmpeg …`。`scripts/lib.mjs` 导出了 `FFMPEG / FFPROBE / FF_ENV / probe() / verifyFastStart()`。
  这是精简版：只编了 scale、concat、amix、volume、loudnorm、aresample 等少数滤镜；只有 mp4、mov、wav、image2、matroska 等 muxer（**没有 s16le、没有 xfade、没有 select**）。编码器有 libx264、aac、png、pcm。取单帧用 `-ss t -i in.mp4 -frames:v 1 out.png`。

## 3. 目录与资源约定

```
video/
  remotion.config.ts        CLI 配置（Chrome、编码默认值）
  src/index.ts              registerRoot + 预加载 Fusion Pixel
  src/Root.tsx              合成：Film/Main16x9、Film/Main9x16、Dev/ComponentDemo、Dev/FontCheck、Dev/PixelCloseUp
  src/copy.ts               片中全部文案（照分镜文案清单原文）——镜头从这里取字，不要手打
  src/timeline/shots.ts     S01–S30、V01–V13 的起止秒、段落、摘要
  src/shots/registry.ts     镜头实现注册表（空 = 全部显示占位卡）
  src/compositions/         Film.tsx（空壳与占位卡）、ComponentDemo.tsx、FontCheck.tsx
  src/components/           可复用组件（见第 5 节）
  src/lib/                  beat.ts 节拍网格、anim.ts 动画工具、assets.ts 资源键、pet-timings.ts（生成）
  src/theme/                palette.ts 配色、fonts.ts 字体、fusion-pixel-faces.ts（生成）
  public/fonts/fusion-pixel/  从应用仓库原样复制的 Fusion Pixel（78 个 woff2 + CSS + LICENSE-OFL.txt）
  public/demo/sprites/      演示用的 sprite（由 scripts/extract-demo-sprites.mjs 生成，240 张）
  public/assets -> ../../assets   符号链接；打包时作为链接带进 bundle，不复制
  scripts/                  render.mjs、render-stills.mjs、lib.mjs、extract-demo-sprites.mjs、gen-font-faces.mjs、gen-pet-timings.mjs
```

`../assets/` 下的东西都能用 `staticFile('assets/…')` 拿到。约定的布局（采集和 sprite 步骤请按这个写，或者改 `src/lib/assets.ts` 里的常量）：

| 内容 | 路径 | 说明 |
| :-- | :-- | :-- |
| sprite | `assets/sprites/<key>.png` | 1× 透明 PNG，键名照分镜 sprite_list：`pet_libao_celebrate_0`…`_5`、`pet_cat_*`、`pet_egret_*`、`crop_radish`、`icon_coin`、`tile_2048`、`flora_tallgrass`、`bg_campus`、`brand_lychee`、`app_icon_1024`、`tray_icon`、`project_picnic`、`pet_wall_324` …… 原生尺寸写在 `SPRITE_SIZE` 或由前缀推断（`tile_*` 32×32，`crop_* / icon_*` 16×16，伙伴按 viewBox） |
| 界面静帧 | `assets/footage/<key>.png` | `<FootageStill name="ui_home_lake"/>` |
| 界面片段 | `assets/footage/<key>/0000.png …` | 60fps PNG 序列（无损，UI 文字与像素画不糊），`<FrameSequence dir="assets/footage/clip_x" count={180}/>`；MP4 也能用 `<FootageVideo>` |
| 配乐 | `assets/audio/music_16x9.wav` / `music_9x16.wav` | 通过 `--props '{"music":"assets/audio/…"}'` 传入；默认 `null`，即静音（仍会写入静音 AAC 轨） |

`SpriteRoot` 是一个 React context，Film 默认用 `assets/sprites`，ComponentDemo 用 `demo/sprites`，也可以从 props 传 `spriteRoot`。**`assets/sprites` 生成之前，任何真镜头里的 `<PixelSprite>` 都会因为 404 渲染失败**，到时候可以先临时传 `--props '{"spriteRoot":"demo/sprites"}'`（演示集只有伙伴 11 个动作 + 作物、图标、棋子、背景）。

`scripts/extract-demo-sprites.mjs` 本身就是一条可用的 sprite 管线：直接 import 应用的 `pet-animation-art.mjs / arcade-art.mjs / garden-items.mjs / pet-art.mjs` 和 `index.html` 里的 symbol，在无头 Chrome 里按 1× 栅格化（crispEdges，无抗锯齿），只导出荔宝、栗栗、小白。加 `--all-actions --out ../assets/sprites`（相对 video/）就能导出三位伙伴全部 324 帧；`project_*` 和 `pet_wall_324` 它没做。

## 4. 节拍网格（`src/lib/beat.ts`）

128 BPM、60 fps：1 拍 = 28.125 帧，1 小节 = 112.5 帧。剪辑点一律是**全局** `round(拍序号 × 28.125)`，所以舍入不累积。

- `beatFrame(b)`：0 起的拍序号 → 全局帧；`barFrame(bar, beat, frac)`：分镜写法（小节、拍都从 1 起）；`secToBeat(s)`：秒 → 最近的 16 分音符（0.938 → 2 拍 → 第 56 帧）。
- `BEAT / BAR / EIGHTH / SIXTEENTH`，`beats(n)`。
- `<Shot startBeat beats tail head>`（`components/Shot.tsx`）是锁在节拍上的 `<Sequence>`，嵌套时也按全局网格对齐；`tail` 是向后多留的帧，给转场重叠用。
- 镜头内部用 `const {at, beat, frame} = useShotClock()`：`at(2.5)` = 本镜第 3 拍反拍落在哪个本地帧（精确对齐全局网格），`beat` = 当前本地拍位置（小数）。
- Film 已经按 `timeline/shots.ts` 把每个镜头包进 `<Shot>`，镜头组件里 `at(0)` 就是这个镜头的第一拍。

## 5. 组件速查（`src/components/`）

动画都是帧的纯函数，并行渲染出来的结果一致。时间参数一律是**本地帧**，按拍算的用 `at(b)` 或 `BEAT` 换算。

**文字**
- `PixelTitle`：Fusion Pixel 大标题，逐字入场。`mode` 可选 `drop`（从上方砸入并回弹，默认）、`pop`、`slam`（从 3.2 倍砸到屏幕上）、`rise`、`type`、`none`。逐字间隔 `stagger` 默认 8 分音符。描边是方角像素描边（`outlineWidth` 默认 `max(4, size/24)`，荔枝深红），另有深木硬阴影（`shadowOffset` 默认 `max(6, size/16)`）。其他参数：`jitter`（整像素抖动）、`wave`（持续上下浮动）、落地闪白 `flash`、`exitAt/exitMode`。`text` 可以传分段数组 `{text, color, at, litAt, litColor}`，用来做「三个名字按拍点亮」。字号请用 12 的倍数。
- `BodyText`：Noto Sans SC 500/700/900。`typeAt/typeStep` 是打字机效果（默认 16 分音符一字，开打前整块隐藏），`caret` 显示光标；`inAt/outAt` 淡入淡出；`plate` 可选 `paper | wood | ink` 底牌；`outline` 是细描边。
- `useFontsFor(text, weights)`：凡是渲染文字的自定义组件都要调用，它会 delayRender 到这段文字用到的字形全部加载完。上面所有组件内部都已经调过。

**像素素材**
- `PixelSprite`：1× PNG 用最近邻放大，`scale` 请用整数。参数有 `x/y/anchor`（`bottom`、`center`…）、`flipX`、`rotate`、`shadow`（硬阴影）、`groundShadow`。
- `PetSprite`：只有 `libao | chestnut | egret`。用 `clips=[{action, at, step, loop}]` 串动作；`step` 可以是帧数（例如 `EIGHTH/2`，即按拍重新定时）或 `'native'`（应用里写好的每帧时长 × 伙伴节奏系数）。需要传 `frame`。
- `ParticleBurst`：只用真实 sprite 键（`PARTICLES.harvest/coins/confetti/hearts/...`）或纯色像素方块。`mode` 可选 `burst`、`fountain`、`rain`、`attract`（沿弧线飞进 `target`，`attractArrival(i, cfg)` 返回第 i 枚落地的帧，用来驱动计数牌）。参数有 `flip`（硬币翻面）、`spin`、`gravity`、`drag`、`life`。另有 `PixelDust`：落地时溅起的纸色像素尘。

**镜头**
- `Camera` + `Layer depth`：Camera 的参数有 `zoom/x/y/rotate/tiltX/tiltY/shake/origin/background`。Layer 的 `depth` 取 0.3（远景）/ 1（界面）/ 1.8（前景粒子、花草），由它产生视差。不包在 Layer 里的子元素（标题、角标）保持不动，也保持整像素清晰。`focusOn(point, zoom)` 返回把某点推到画面中心所需的 `{zoom,x,y}`，用于「穿屏推入」。
- 配套的抖动：`shake(frame, at, frames, amp, seed, hold)`（`lib/anim.ts`），整像素、按 `hold` 帧换位，越来越弱。
- `Card3D`：界面截图卡片。`rotateX/rotateY/rotateZ/z/scale`、纸色边、柔阴影，`glare` 是随 rotateY 移动的高光。

**拟真桌面**（`Desktop.tsx`）
- `DesktopScene`：壁纸（默认 `bg_campus`，可柔化、可缩放）加通用任务栏（3×3 点阵启动器、文件夹、szuDesktop 图标（运行中，金色指示条）、托盘图标反白、信号图标、时钟 09:30 和日期），不出现任何系统 logo。`bezel={28}` 会在屏幕外画一圈显示器边框，3D 倾斜时露出的边看起来是显示器，而不是破洞；`ui={2}` 用于 3840×2160 合成。
- `WindowFrame variant="win" | "mac" | "pixel"`：win 是中性标题栏（应用图标、标题、最小化/最大化/关闭线条）；mac 是三色按钮、标题居中；pixel 是木框。内容区是 children。
- `ScreenImage`：截图填满容器。

**伙伴界面**
- `SpeechBubble`：1:1 照搬 `pet.html` 的 `#bubble`（颜色、2px 边、12px 圆角、尾巴、0.28 s 弹出），整体按 `scale` 放大；`(x,y)` 是尾巴尖的位置。
- `NativeMenu` + `petMenuItems({...})` / `switchPetItems(i)`：按 `pet-controller.mjs` 原文和顺序重建的伙伴菜单。切换伙伴子菜单只有荔宝、栗栗、小白三项。`highlight` 是悬停项序号。
- `PixelCursor`：12×19 像素箭头。`path=[[frame,x,y],…]` 指定路径，`clicks` 指定按下的帧，按下时有金色像素圈。

**像素 UI**（`PixelUI.tsx`）
- `PixelPanel`：阶梯切角、实心边、内高光、硬阴影。
- `WoodSign`：木牌加金色像素字，用于下载牌。
- `CornerTag`：段落角标「01 桌面伙伴」，从左侧滑入。
- `WoodBadge`：木框徽章，带图标，从 2.4 倍砸下回弹。
- `Counter`：荔枝币计数牌，`bumpAt` 每进一枚跳一下。

**转场**（`Transitions.tsx`）
- `WhiteFlash`：默认 2 帧，颜色 #FFFDF5。
- `BlackHold`：分镜里那 1/8 拍黑场。
- `MosaicImage`：canvas 精确马赛克，用于开场 96→32→8。
- `Pixelate`：任意 DOM 的马赛克 SVG 滤镜，块大小会取成奇数 2r+1。
- `MosaicCut`：像素块溶解，A 9→17→33→65 后切到 B，B 再逐级清晰，每级跟 16 分音符。
- `BlockDissolve`：随机方块逐步揭开下一个镜头。
- `PixelWipe`：阶梯斜擦，带金色边。
- `ZoomPunch`：冲击时缩放一下。
- `WhipPan`：甩镜，`mode="out"`/`"in"`，只做 X 方向的运动模糊。
- `Glitch`：RGB 分离 6px、横向错位切片、扫描线、黑帧，**只用于「断网了？」**。
- `Scanlines`、`ImpactRing`（像素冲击环）、`Veil`（压暗蓄力）。

**素材播放**（`Footage.tsx`）
- `FrameSequence`：参数 `dir/count/at/rate/offset/sourceFrame/loop`，`sourceFrame` 用来重定时，例如延时摄影。
- `FootageStill`、`FootageVideo`（OffthreadVideo）。

**其他**
- 配色 `C`（`theme/palette.ts`，每个色值都注明了在应用 CSS 或像素画里的出处）、`alpha()`、`cardShadow()`。
- 文案 `COPY`（`copy.ts`）。

## 6. 写一个镜头

```tsx
// src/shots/S22.tsx
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ShotComponent} from './registry';
import {useShotClock} from '../lib/beat';
import {Camera, Card3D, Layer} from '../components/Camera';
import {FootageStill} from '../components/Footage';
import {PixelTitle} from '../components/PixelTitle';
import {CornerTag} from '../components/PixelUI';
import {COPY} from '../copy';
import {C} from '../theme/palette';
import {tween} from '../lib/anim';

export const S22: ShotComponent = ({vertical}) => {
  const f = useCurrentFrame();
  const {at} = useShotClock();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Camera zoom={tween(f, 0, at(4), 1, 1.1)}>
        <Layer depth={1}>
          <Card3D width={1500} height={844} rotateX={6}>
            <FootageStill name="ui_net_offline" />
          </Card3D>
        </Layer>
      </Camera>
      <CornerTag text={COPY.sections[4]} at={0} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 120}}>
        <PixelTitle text={COPY.netOffline} size={168} color={C.error} outline={C.paperHi} mode="slam" start={at(0)} jitter={2} />
      </div>
    </AbsoluteFill>
  );
};
// 然后在 src/shots/registry.ts 里加一行：SHOT_REGISTRY.S22 = S22（或写进对象字面量）
```

镜头组件拿到的 props 是 `{spec, vertical}`。横版和竖版是两套 id，竖版镜头可以复用横版组件，按 `vertical` 改布局。

## 7. 踩过的坑（务必看）

1. **不要用 `<AbsoluteFill style={{top:'auto', bottom:N}}>` 贴底放字**：AbsoluteFill 带 `height:100%`，盒子会整个往上顶出画面。贴底或贴顶请用普通 `div`，写 `position:absolute; left:0; right:0; bottom:N`。
2. 文字和像素 sprite 想要锐利，就要放在整数坐标、用整数倍缩放。运动中有点模糊没关系，停下来时要落在整数位置（`PixelTitle` 停稳后会自动取整）。标题尽量放在 `Layer` 外面。
3. Fusion Pixel 的「·」字宽很大，`szuDesktop · 荔枝庭院` 在像素字里中间空得比较开（见 FontCheck）。要紧凑就去掉「·」两边的空格，或者把这段改用 Noto。
4. 3D 倾斜的桌面会露边：要么给 `DesktopScene` 加 `bezel` 和 Camera `background`（演示里就是这样），要么不倾斜、只靠 zoom ≥ 1.12 裁掉边，但那样任务栏会被裁掉。
5. `Pixelate` / `MosaicCut` 用的是 SVG 滤镜，块大小 65 时开销明显，只在转场那几帧用。整张位图的马赛克用 `MosaicImage`（canvas，结果精确）。
6. 新写的文字组件一定要调用 `useFontsFor(全文)`；打字机效果传全文，不要传已经打出来的那部分，否则会闪回退字体。字形都在 FontCheck 里核对过；新加文案请写进 `copy.ts`，再跑一遍 `npm run stills` 看 FontCheck 顶部那行里的「未覆盖」。
7. `assets/sprites` 里缺任何一个键，`<Img>` 都会让整次渲染失败（这是好事，不会悄悄漏图）。
8. 品牌守卫：本工程的代码和演示 sprite 只引用荔宝（libao）、栗栗（cat/chestnut）、小白（egret）。`PET_META`、`switchPetItems` 写死只有这三位。不要从 pet-art 导出 pingu、skipper、turtle。
9. 性能参考：演示 300 帧、粒子和 3D 很密，并发 8 下约 40 s。按这个推算，横版 3600 帧约 8–10 分钟，竖版约 4–5 分钟。
10. Remotion 许可：个人和 3 人以下团队免费使用，学生自制的非商业项目适用。

## 8. 待接入（由其他步骤产出）

- `../assets/sprites/`：完整 sprite 集，包括 `project_*`、`pet_wall_324`、静态表情 `pet_*_static_*`。
- `../assets/footage/`：界面采集的静帧和 60fps PNG 序列（键名按分镜 footage_list）。
- `../assets/audio/music_16x9.wav`、`music_9x16.wav`：原创合成配乐，48 kHz，时长正好 60.000 s / 30.000 s。
- `src/shots/*.tsx`：S01–S30 和 V01–V13 的镜头实现，并在 `registry.ts` 注册。

## 9. v2 修改（按审片意见，2026-10-05）

- **转场**：甩镜 / 下摇统一在 `compositions/Film.tsx` 做（`shots/index.ts` 的 `TRANSITIONS`）。出画、入画两段在同一条轨道上首尾相接（入画 = 出画 + 一个画幅），切点前入画镜头冻结在它的第 1 帧、切点后出画镜头冻结在最后一帧，下面垫 1.2 倍超扫描的模糊 campus；S10→S11 还有一组跨接缝落下的金币。镜头内不再用 `WhipPan`。检查脚本：`/opt/miniconda3/bin/python3 ../work/qa/check_empty.py <mp4> 0.03`。
- **风景片段**：`work/capture/cap-v2.mjs scenes` 按镜长逐帧重渲（`clip_scene_*_s13/_s14/_s15`、`*_v7`），上屏 1× 播放，内部 2 倍超采样；上屏加 `saturate(1.15) contrast(1.1)`。
- **补采**：`cap-v2.mjs todo` 在同一个隔离存档里写下待办、在课程笔记里「选中 → 待办」，再采「我的小事」卡片（`ui_focus_todos_after_note.png`，4 条待完成）。
- **水滴**：`assets/sprites/fx/1x/fx_waterdrop.png`（3×5，取 pet-animation-art.mjs 浇水动作的水滴像素），`flatten-sprites.sh` 已加入。
- **标题**：`PixelTitle` 的 `slam` 只做竖直下落（无 x 偏移 / 缩放 / 旋转 / 抖动），整句 ≤ 0.35 s 落完；新增 `whole`（整词 1.6→1，6 帧回弹）；`drop` 去掉缩放。标题统一垫 `Plate`（70 % #492A16）。
- **闪白**：满幅白闪只留 0.94 / 20.63 / 30.94 / 52.5 s（竖版 0.94 / 11.25 / 15.94 / 26.25 s），其余切点用 `SoftFlash`（40 %，2 帧）。
- **竖版**：时间轴改为 V11 20.625–24.375（两小节）、V12 24.375–26.25、V13 26.25–30；合规文字一律在 y 1440–1560、x 60–900。
- **配乐**（`work/audio/make_audio.py`，旧版存为 `make_audio.v1.py`、旧成品在 `work/audio/backup_v1_audio/`）：高潮改为软削波的 `climax_hit`（50 ms 峰值 -12.0 → -6.2 dBFS，全片最响）；结尾最后两小节撤掉鼓组，最后一小节拍 1 `final_hit` + 金币「叮」后只剩混响尾巴（约 59.25 s / 29.25 s 降到 -40 dBFS）；S15 翻格音效改 16 分音符、S16 点击移到拍 2；竖版第 12–16 小节按新时间轴重排。
