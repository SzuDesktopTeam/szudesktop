# szuDesktop 第三方声明

项目代码使用 MIT License，完整条款和 xEncode 衍生实现的版权声明见同目录 `LICENSE`。以下组件保留各自许可，项目许可不覆盖它们。

## Fusion Pixel Font / 缝合像素字体

Copyright (c) 2022, TakWolf (https://takwolf.com).

来源：https://github.com/TakWolf/fusion-pixel-font

采用 SIL Open Font License 1.1，完整条款见 `FONT-LICENSE-OFL.txt`。源码中的字体许可位于 `desktop/assets/fonts/LICENSE-OFL.txt`。

## Electron 和 Chromium（仅安装版）

Electron 来源：https://github.com/electron/electron ，采用 MIT License。安装目录内 `LICENSE.electron.txt` 保留其完整声明。

Chromium 及其第三方组件的版权和许可随 Electron 运行时提供，见安装目录内 `LICENSES.chromium.html`。便携版不捆绑 Electron 或 Chromium，使用用户已有浏览器。

## 2048 游戏规则

庭院 2048 的移动和合并规则参考并改编自 Gabriele Cirulli 的 [2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc)，固定版本为 `478b6ec346e3787f589e4af751378d06ded4cbbc`，对应 `js/game_manager.js`、`js/grid.js`、`js/tile.js`。本项目将其改写为独立的数据模块，使用自己的界面，并加入存档、单步撤销和庭院奖励。

Copyright (c) 2014 Gabriele Cirulli。原项目采用 MIT License，完整条款保留在源码 `desktop/assets/garden/licenses/2048-MIT.txt`，并随安装版和便携版分发为 `2048-MIT.txt`。伙伴委托规则和文案由本项目编写。

## Pingu 与 Skipper 像素形象

自 beta0.9.3 起加入的 Pingu 与《马达加斯加》企鹅 Skipper 是项目自行绘制的粉丝像素形象，没有提取动画、电影或游戏的原始美术资源。角色及相关标识的权利属于各自原权利人；本项目的 MIT 许可不授予这些角色 IP 的使用权，也不表示获得官方授权或背书。

## Three.js 与 Sakura Crossing 渲染模块

以下模块自 beta0.9.3 起加入，beta0.9.2 及更早的安装包不含三渲二首页。下述随包路径是本源码的打包配置。

主页三渲二场景使用 [Three.js 0.180.0](https://www.npmjs.com/package/three/v/0.180.0)，Copyright © 2010-2025 three.js authors，采用 MIT License。完整条款保留在源码 `desktop/assets/garden/vendor/three/LICENSE.txt`，随安装版和便携版分发为 `Three-MIT.txt`。

三渲二材质、描边、调色、天空、云纹理和后处理模块改编自 Kenton Wang 的 [Sakura Crossing](https://github.com/Kenton-GMI/sakura-crossing/tree/de01898e89c7f6ab3fad93fa802f0f5ac66fbd81)，固定版本为 `de01898e89c7f6ab3fad93fa802f0f5ac66fbd81`。Copyright (c) 2026 Kenton Wang，采用 MIT License。完整条款保留在源码 `desktop/assets/garden/vendor/sakura/LICENSE.txt`，随安装版和便携版分发为 `Sakura-Crossing-MIT.txt`。

本项目调整模块引用为离线相对路径，并适配 Three.js 版本及场景卸载；复制与改编的文件、上游版本和变更记录见 `desktop/assets/garden/vendor/SOURCE.json`。校园场景另行实现，不捆绑上游音频、玩家控制或完整世界启动代码。

## 协议参考与美术

- xEncode 实现改写自 MIT 项目 Sleepstars/SZU-login（https://github.com/Sleepstars/SZU-login），其上游为 vidar-team/srun-login；原始版权声明保留在 `LICENSE`。
- 学校接口的事实性调研参考 MattDong123/tools4szu（https://github.com/MattDong123/tools4szu）。该参考仓库未声明开源许可；本项目按接口事实重新实现，不复制或再分发其代码。
- 默认发行资源使用项目 SVG、像素角色、CSS 场景、开源字体和生成的校园背景；自 beta0.9.3 起另含上述开源渲染模块和本项目校园三维场景。不捆绑 Stardew Valley、Terraria、Minecraft 的游戏美术或原版游戏字体。游戏名称属于各自权利人，风格参考不表示合作或授权。
- 实验 VPN 模块不进入默认发行构建；该模块的第三方来源与授权仍待核实，不能视为完成许可核验的发行功能。

这是学生制作的非官方项目，与深圳大学及上述项目或游戏的权利人没有隶属或背书关系。

安装版的本项目、字体、2048、Three.js 和 Sakura Crossing 许可位于 `resources/licenses/`；便携 ZIP 将其放在解压目录。Electron 自身许可保留在安装目录。

## SZU CLI 校园业务适配参考

全校课表和培养方案的查询路径、字段与映射参考并改编自 [AwesomeHou/szu-cli](https://github.com/AwesomeHou/szu-cli) 0.2.14 的 `src/modules/{timetable,program}{,-parser}.js`，在本项目中以 Go 重新实现。电量协议和图书馆授权入口亦参考该版本，并按学校实际匿名页面核对；不捆绑上游浏览器自动化或下载代码。以下完整声明随本文件进入安装版和便携 ZIP：

MIT License

Copyright (c) 2026 SZU CLI contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
