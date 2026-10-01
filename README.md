<div align="center">

# szuDesktop · 荔枝庭院

把深大的一小片校园，搬到你的桌面。

选一位像素伙伴，专注一会儿，回来收一颗萝卜。
校园里的常用工具，也放在这里。

<p>
  <img alt="desktop platform" src="https://img.shields.io/badge/desktop-Windows%20%7C%20macOS%20preview-4a6fa5?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-2f7d32?style=flat-square">
  <img alt="release" src="https://img.shields.io/github/v/release/SzuDesktopTeam/szudesktop?include_prereleases&style=flat-square&label=release&color=c9a227">
</p>

**简体中文** · [English](docs/README_en.md)

学生自制 · 与深圳大学官方无关

桌面应用支持 Windows 与 macOS（macOS 为预览版）· Linux 可下载校园网命令行 szunet（见[下载](#下载)）

**[下载 Windows 安装版 · beta0.9.6](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.6/szuDesktop-Setup-0.9.6.exe)**

macOS 预览版：[Apple 芯片 DMG](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.6/szuDesktop-0.9.6-mac-arm64.dmg) · [Intel DMG](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.6/szuDesktop-0.9.6-mac-x64.dmg)，第一次打开要手动放行，见[下载](#下载)

[下载](#下载) · [功能](#功能) · [已知限制](#已知限制) · [安全与隐私](#安全与隐私) · [使用指南](docs/guide/README.md) · [常见问题](#常见问题) · [反馈与建议](https://github.com/SzuDesktopTeam/szudesktop/issues)

</div>

---

## 现在可以用它做什么

![首页：书桌入口与雨后书屋风景](docs/screenshot-home-daily-preview.png)

- **让伙伴陪在桌面上。** 荔宝、栗栗、小白、Pingu 和 Skipper，选一位陪你读书或工作。点它照料，拖到喜欢的位置，用滚轮调整大小；名字和成长都留在本机。桌面伙伴需要 Windows 安装版或 macOS 版，Windows 便携版没有独立的桌面伙伴。
- **给专注留一点小奖励。** 写下待办，开始 5、25、45 分钟或自定时长的专注，完成后领取伙伴成长和荔枝币。种菜、浇水、布置庭院；离线时作物也会继续生长。
- **把课上学到的留下来。** 在学习书屋按课程写笔记，支持模板、搜索和 Markdown；需要和同学一起整理时，可以打开课程绑定的飞书共享文档。
- **少找几次学校入口。** 查看公开的学院公告和官方校历，集中打开常用学校服务；校园网连不上时运行诊断。

在桌面版里（Windows 与 macOS），庭院、待办、专注和课程笔记不需要学校账号，断网也能用。

[伙伴小屋](docs/screenshot-pets-preview.png) · [课程笔记](docs/screenshot-study-notes-preview.png) · [庭院建设](docs/screenshot-garden-goal-preview.png)

欢迎[反馈用不顺的地方或想要的功能](https://github.com/SzuDesktopTeam/szudesktop/issues)。说明你当时想做什么、卡在哪一步就行；请不要附上密码、Cookie 或个人成绩。网络或学校服务出问题时，可以附上应用里「设置 → 关于与更新 → 反馈与建议」复制的诊断报告：它只含结构，不含账号、成绩和课表，复制前可以先预览。

## 功能

| 能力 | 状态 | 说明 | 详见 |
| :-- | :-- | :-- | :-- |
| 荔枝庭院 | ✅ 可用 | 照料伙伴、种植四种作物、伙伴小桌 2048、委托、集市、庭院建设、来访故事和明信片，全部离线运行；没有充值或现金交易 | [庭院与伙伴](docs/guide/garden.md) |
| 伙伴 | ✅ 可用 | 五位新存档伙伴和旧存档里的阿青，共 648 帧动作、1,656 句台词；在伙伴小屋或桌面伙伴菜单切换 | [庭院与伙伴](docs/guide/garden.md) |
| 桌面伙伴 | ✅ 可用（Windows）· 🧪 测试中（macOS） | Windows 安装版：透明窗口、左右键菜单照料与切换伙伴、滚轮缩放 40%–200%、拖动、隐藏与托盘，重启后恢复大小和位置。macOS 版功能相同，托盘换成菜单栏图标，还没在真机上验收，见「macOS 桌面版」一行 | [庭院与伙伴](docs/guide/garden.md) |
| 风景环境 | ✅ 可用 | 像素庭院、荔湖晴昼、雨后书屋、蓝调晚庭，所有页面共用同一种风景；关闭动画时显示静止画面，不支持三维渲染时退回像素庭院 | [庭院与伙伴](docs/guide/garden.md) |
| 待办与专注 | ✅ 可用 | 待办可以编辑、定日期、归档和恢复；专注可选 5 / 25 / 45 分钟或自定 1–120 分钟，可关联待办，每完成并领取 1 分钟得 1 荔枝币和 1 点成长 | [学习](docs/guide/study.md) |
| 专注完成通知 | 🧪 测试中 | Windows 安装版与 macOS 版：可以开启专注完成提醒和「勿扰」；Mac 上通知发不出去时，改由桌面伙伴冒气泡提醒 | [学习](docs/guide/study.md) |
| 课程笔记 | ✅ 可用 | 本机文本笔记：手动建课、模板、搜索、Markdown、回收站、大纲、选句转待办、导入导出和整本备份 | [学习](docs/guide/study.md) |
| 飞书课程文档 | 🧪 测试中 | 每门课可绑定一份有权限的飞书文档并打开原页面，也可用你自己的 lark-cli 只读导入本机副本；不是双向同步 | [学习](docs/guide/study.md) |
| 学院公告 | 🟡 部分可用 | 28 个学院与学部中 17 个可在应用内读取（带日期和原文链接），其余提供官网入口；教务部和研究生院的公告也可在应用内读取。第一次进入先选学院，也可以在设置里填好学院 | [校园服务](docs/guide/campus.md) |
| 官方校历与教学周 | ✅ 可用 | 每天检查学校校历页，新图片用系统自带的文字识别（Windows 与 macOS 版都有）；教学周可以手动调整，读取失败时保留缓存并说明原因 | [校园服务](docs/guide/campus.md) |
| 学校登录 | 🧪 测试中 | 在学校原页面登录后回到应用读取本次登录，登录状态只保留到退出应用 | [校园服务](docs/guide/campus.md) |
| 课表 | 🧪 测试中 | 按培养层次读取本科或研究生课表，只在本次运行中显示 | [校园服务](docs/guide/campus.md) |
| 成绩与绩点 | 🟡 部分可用 | 粘贴或导入 CSV / TSV 成绩并在本机计算绩点；登录后在线读取还在测试，不自动并入绩点，也不解析 PDF、图片或 XLSX | [校园服务](docs/guide/campus.md) |
| 场地空位查询 | 🟡 部分可用 | 只读查看社区场地和半小时空位，需要本机能直连学校校内服务（一般在校园网内） | [校园服务](docs/guide/campus.md) |
| 应用内预约 | 🧪 测试中 | 安装版在独立的学校窗口里打开学校官方预约页，由你自己选时段和提交；便携版改在浏览器里打开。应用不代提交、不抢约 | [校园服务](docs/guide/campus.md) |
| 学院琴房 | 🧪 测试中 | 用该系统的专用账号只读查看琴房和本人预约，登录只保存在内存 | [校园服务](docs/guide/campus.md) |
| 自习提醒 | ✅ 可用 | 手动登记后导出标准 ICS 日历文件，开始前 15 分钟提醒；提醒不代表预约成功 | [校园服务](docs/guide/campus.md) |
| 常用电话 | 🟡 部分可用 | 只收录学校图书馆官网公开的号码，其他部门只提供官方入口 | [校园服务](docs/guide/campus.md) |
| 校园网认证 | 🧪 测试中 | 自动识别教学区（深澜）或宿舍区（Dr.COM）后认证，也可以注销或手动指定区域 | [校园网](docs/guide/network.md) |
| 接入点编号（ac_id） | 🟡 部分可用 | 按手动指定 → 本机在这个网口成功用过的记录 → 网关跳转 → 逐个尝试的顺序取号，尝试得到的会标注；识别失败时可以手动填写 | [校园网](docs/guide/network.md) |
| 断线诊断 | ✅ 可用 | 列出区域判定、认证门户是否可达、协议指纹、学校域名是否被代理软件接管和结论，桌面与命令行都能用；人在校外时只显示灰色说明，不再提示待确认 | [校园网](docs/guide/network.md) |
| 启动时自动连接校园网 | 🧪 测试中 | 启动时最多用已记住的账号认证一次，已在线或检测不到认证门户时跳过，可以关闭 | [校园网](docs/guide/network.md) |
| 命令行 szunet | 🧪 测试中 | Windows、macOS、Linux 单文件，可登录、注销、查状态、判区、诊断和保存账号（macOS 存入钥匙串，Linux 存入 Secret Service） | [校园网](docs/guide/network.md) |
| 凭据保管 | ✅ 可用（Windows）· 🧪 测试中（macOS） | Windows 桌面版用 DPAPI 加密保存校园网账号密码，macOS 版存进系统钥匙串（真机上的保存与读取还没验收）；只在认证成功并勾选记住后保存，系统安全设施不可用时拒绝保存、不落明文 | [数据与隐私](docs/guide/data-and-privacy.md) |
| 存档与备份 | ✅ 可用 | 庭院与笔记分别保存在本机，损坏时自动恢复上一份，另留最近 3 个使用日的按天备份；可导出导入，多窗口不会互相覆盖；导出的存档不含校园网账号密码 | [数据与隐私](docs/guide/data-and-privacy.md) |
| 反馈与诊断报告 | ✅ 可用 | 复制版本与系统信息，或复制只含结构的诊断报告（判区、门户、学校服务返回了哪些字段）；先预览再复制，不自动上传。反馈目前走 GitHub Issues，需要 GitHub 账号 | [数据与隐私](docs/guide/data-and-privacy.md) |
| 开机自启 | 🧪 测试中 | Windows 安装版需在设置里主动开启（卸载时清除），便携版与 `szunet autostart` 也可设置；macOS 版是「登录 Mac 时启动」，要先把应用放进「应用程序」 | [安装与更新](docs/guide/install.md) |
| 自动更新 | — 不支持 | 没有自动下载或安装；可在「设置 → 关于与更新」手动检查新版并打开下载页 | [安装与更新](docs/guide/install.md) |
| macOS 桌面版 | 🧪 测试中 | 预览版：Apple 芯片与 Intel 各一个 DMG，需要 macOS 13 或更高版本，功能与 Windows 安装版一致，托盘换成菜单栏图标。未经 Apple 公证，第一次打开要手动放行。真机验收还一项都没做，要确认的行为见[已知限制](#已知限制) | [安装与更新](docs/guide/install.md) |
| Linux 桌面 | — 不支持 | 只有命令行 szunet；Linux 桌面端在路线图中为待做、低优先级 | [安装与更新](docs/guide/install.md) |

图例：✅ 可用 · 🟡 部分可用（只覆盖部分范围，或有明确前提） · 🧪 测试中（已接入，尚未通过真实环境验收） · — 不支持

部分可用和测试中的具体缺口见[已知限制](#已知限制)。

## 下载

Windows 用户直接下载上方的安装版，运行安装程序后打开 szuDesktop。安装版自带窗口运行时，不需要另装浏览器或开发环境。macOS 预览版自 beta0.9.5 起提供，Mac 用户按芯片选择对应的 DMG（见下表）。其他形式也都在[发布页](https://github.com/SzuDesktopTeam/szudesktop/releases)。

beta0.9.6 预发布下载：安装包 `szuDesktop-Setup-0.9.6.exe`、便携包 `szudesktop-beta0.9.6-windows-amd64.zip`、macOS 预览版 `szuDesktop-0.9.6-mac-arm64.dmg` 与 `szuDesktop-0.9.6-mac-x64.dmg`。附件大小、校验文件与发布状态以 [Release 页面](https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.9.6) 为准。

| 形式 | 文件 | 怎么打开 | 桌面伙伴与托盘 |
| :-- | :-- | :-- | :-- |
| Windows 安装版（推荐） | `szuDesktop-Setup-<版本号>.exe` | 运行安装程序后打开 szuDesktop；独立窗口，内含后台引擎 | 有 |
| Windows 便携版 | `szudesktop-<发布标签>-windows-amd64.zip`，或单文件 `szudesktop-windows-amd64.exe` | 解压后双击 `szudesktop.exe`，用本机 Edge / Chrome 打开窗口 | 没有（窗口内的庭院照常可用） |
| macOS 版 · Apple 芯片（预览） | `szuDesktop-<版本号>-mac-arm64.dmg` | 打开 DMG，把 szuDesktop 拖进「应用程序」再打开；第一次打开要放行（见下） | 有，托盘换成屏幕顶部的菜单栏图标 |
| macOS 版 · Intel（预览） | `szuDesktop-<版本号>-mac-x64.dmg` | 同上 | 有，托盘换成屏幕顶部的菜单栏图标 |
| macOS 命令行 | `szunet-darwin-amd64`（Intel）、`szunet-darwin-arm64`（Apple 芯片） | 在终端中运行，只做校园网认证与诊断 | 没有 |
| Linux 命令行 | `szunet-linux-amd64`、`szunet-linux-arm64` | 在终端中运行，只做校园网认证与诊断 | 没有桌面应用 |

安装版和 DMG 的文件名只写数字版本号，便携版 ZIP 写完整的发布标签，以上面「当前版本」一行和发布页上的实际文件名为准。命令行 szunet 每个平台一个单文件，约 6.4–7.2 MB；装好后占用多少磁盘还没有实测。

**macOS 版是预览版**，需要 macOS 13 或更高版本。Apple 芯片（M1 及更新）选 `mac-arm64.dmg`，Intel 处理器选 `mac-x64.dmg`，在「苹果菜单 → 关于本机」里看「芯片」或「处理器」一栏。应用未经 Apple 公证，第一次打开会被系统拦下：macOS 15 及以后，到「系统设置 → 隐私与安全性」底部点「仍要打开」；macOS 13 和 14，在「应用程序」里按住 Control 点按 szuDesktop，选「打开」。每次更新到新版本都要再放行一次。一部分行为还没在真机上验收，见[已知限制](#已知限制)；完整步骤见[下载、安装与更新](docs/guide/install.md)。

Linux 目前只有命令行 szunet，没有桌面版。Windows 也可以单独下载命令行 `szunet-windows-amd64.exe`。

- **校验下载**：每个文件都有同名 `.sha256`，可以用来核对下载是否完整；它不能代替发布者签名。
- **没有数字签名或公证**：Windows 安装包和程序都未签名，首次运行可能出现 SmartScreen 或杀毒软件提示；macOS 版未经 Apple 公证，要按上面的方法放行。代码是开源的，可以自己查看、编译后比对。
- **手动更新**：没有自动更新。升级前在「设置 → 存档与隐私」点「导出庭院与待办」和「备份课程笔记」，再下载新版安装。Windows 安装升级会保留庭院、学习记录、加密的账号配置和桌面伙伴设置；两种 Windows 版本共用同一份本机记录。Mac 上先按 ⌘Q 退出，把新版拖进「应用程序」替换旧版，再放行一次；存档、笔记和钥匙串里的账号不受影响。

校验方法、卸载、打开与退出、开机自启等细节见[下载、安装与更新](docs/guide/install.md)。

## 快速上手

1. 第一次打开会弹出欢迎引导。点「去认识我的伙伴 →」到伙伴小屋选一位（Windows 安装版和 macOS 版的桌面伙伴会同步切换）；建档当天，首页的「今天谁陪你？」也是展开的，在那里换也行。
2. 回到首页点「开始 5 分钟」，专注马上开始；时间到后在「学习书屋 → 专注与小事」点「完成并领取奖励」，得到 5 荔枝币和 5 点成长。欢迎引导里的「先专注 5 分钟」也会马上开始 5 分钟，并打开这一页。
3. 首页的「下一步」会提示第一颗小萝卜：它约 1 分钟成熟，到「荔枝庭院 → 我的农田」收下它，得到 2 个萝卜和 1 点成长。
4. 需要上网时进入「校园网」，填校园卡号和统一身份认证密码，点「登录校园网」；连不上就点「运行网络诊断」。人在校外时「校园认证」一栏显示灰色说明，属于正常。学校业务的登录和校园网登录是两件事，需要时再分别办理。

前三步都不需要学校账号，断网也能完成。之后想再看欢迎引导，点页面底部的「欢迎引导」；旁边的「使用指南 ↗」打开完整的使用指南。完整说明见[快速上手](docs/guide/getting-started.md)。

## 已知限制

- **学校个人业务还在测试**：本科课表、有排课的研究生课表、在线成绩、安装版学校登录接回和过期后重新登录、应用内预约完整流程和学院琴房，都还没通过真实账号验收，可能读取失败或结果不完整。场地空位查询需要本机能直连学校校内服务（一般要在校园网内）。验收细节见 [STATUS](docs/STATUS.md#s50-2)。
- **校园网认证待现场验收**：教学区和宿舍区完整的登录、失败提示、注销与重连还没逐项现场验收；接路由器、未认证时的接入点编号自动发现也没实测，识别失败时可以在登录表单的「高级设置」里手动填写。启动时自动连接和命令行 szunet 用的是同一套认证，验收状态相同。
- **macOS 版是预览版**：真机验收还一项都没做。浏览器下载后的首次放行、菜单栏图标与程序坞、关窗与全屏、各种退出方式先保存、学校和飞书窗口的「页面」菜单与复制粘贴、桌面伙伴的 Control 点按与多显示器、系统通知的授权与弹出、注销与登录时启动、钥匙串里账号的保存与读取、macOS 13 和 14，以及在校园网里是否弹出「本地网络」授权，都还要在真机上逐项确认，进度见 [STATUS](docs/STATUS.md#s68-2)。每次更新都要重新放行；按 ⌘H 隐藏应用时桌面伙伴也会一起隐藏，在菜单栏图标里点「显示宠物」可以只把它带回来；主窗口和伙伴都隐藏时，专注提醒可能稍有延迟；这是第一个 macOS 版本，跨版本升级还没验证。遇到问题请到 [Issues](https://github.com/SzuDesktopTeam/szudesktop/issues) 选「问题反馈」，写上 macOS 版本、芯片（Apple 芯片或 Intel）和卡在哪一步。
- **Linux 没有桌面版**：只有命令行 szunet，需要 Secret Service（`secret-tool`）才能保存账号，没有时拒绝保存。macOS 命令行把凭据存进钥匙串，真机上完整的保存再读取还没验证。
- **未签名、未公证、无自动更新、无云同步**：Windows 版首次运行可能出现安全提示，macOS 版要手动放行；新版需要手动下载；数据只在本机，项目没有部署后端，也没有云同步。
- **笔记与飞书**：课程笔记只支持文本，没有图片附件、课件解析、公式或 AI 整理。飞书本机副本不会回写，不是双向同步；真实授权、文档导入和多人协作还没验收。
- **桌面行为待实测**：Windows 上专注完成的系统通知是否真的弹出、开启「登录 Windows 时启动」后重新登录是否真的启动，以及多显示器、长时间运行的资源占用和睡眠唤醒后的表现（macOS 版的待验收项见上）。
- **尚未接入**：校园网余额、流量、时长和套餐；11 个学院的公告只提供官网入口；校历遇到新图片时依赖系统自带的文字识别，Windows 英文系统语言下的识别还待复核。
- **还没开展真实同学试用**：庭院的成长节奏和长期内容会根据试用反馈调整。

全部未完成事项见 [STATUS 当前未完成事项](docs/STATUS.md#s1-1)。

## 常见问题

### 接了自己的路由器后登录不上？

接入点编号（ac_id）跟墙上的网口走，不跟路由器走；识别失败时在登录表单的「高级设置」里手动填写，命令行用 `--ac-id`。详见[校园网指南](docs/guide/network.md)。

### 开着代理软件，学校系统打不开？

Clash 这类代理的 Fake-IP 模式会把学校域名解析成假地址。诊断或报错里出现「代理软件接管了学校域名」时，把 `szu.edu.cn` 设为直连，Fake-IP 模式还要把它加进「不分配假 IP」的名单。详见[校园网指南](docs/guide/network.md)。

### 杀毒软件或 SmartScreen 提示？

安装包和程序没有数字签名，所以可能触发提示；请从发布页下载并用同名 `.sha256` 核对，但不要把所有安全提示都笼统当成误报。详见[安装指南](docs/guide/install.md)。

### 关掉窗口，程序还在吗？

Windows 安装版的桌面伙伴和托盘还在，完整退出用桌面伙伴菜单或设置里的「退出应用」，或托盘的「退出」。macOS 版的桌面伙伴和菜单栏图标还在，点程序坞图标找回主窗口，按 ⌘Q 完整退出。便携版在所有窗口关闭约 10 秒后退出。详见[安装指南](docs/guide/install.md)。

### 会不会在后台自动重连？

不会周期性重连，只在启动时最多用已记住的账号认证一次，这一次也可以关闭。详见[校园网指南](docs/guide/network.md)。

### Mac 或 Linux 能用吗？

Mac 可以用 macOS 桌面版预览版（需要 macOS 13 或更高版本），有桌面伙伴和菜单栏图标；第一次打开要按[下载](#下载)里的方法放行，一部分行为还没在真机上验收，遇到问题欢迎到 Issues 反馈。Linux 只能用命令行 szunet 登录校园网和诊断，没有桌面应用和桌面伙伴。详见[安装指南](docs/guide/install.md)。

账号密码存在哪、怎么换电脑、提示后台版本过旧等问题见[常见问题](docs/guide/faq.md)。

## 安全与隐私

- **数据只在本机**：默认存放在用户目录下的 `.szunet` 文件夹。庭院存档 `workspace-v1.json` 与课程笔记 `notebook-v1.json` 分开保存，换电脑时两份要分别导出；导出的庭院存档不含校园网账号密码。庭院存档和课程笔记都是未加密的普通文件，导出文件也一样；只有校园网密码和手动保存的学校登录状态是加密的。
- **没有遥测或统计埋点**：为判断能否上外网、识别接入点编号，程序会请求公共联网检测地址（如小米的 connect.rom.miui.com），不携带账号信息，完整列表见数据指南；只有你手动检查更新时才访问 GitHub。你主动打开学校或飞书官方页面时，数据由对应服务处理。
- **校园网密码加密保存**：Windows 用 DPAPI（换机器或换用户都解不开），macOS 用钥匙串，Linux 用 Secret Service；没有系统安全设施时拒绝保存并说明原因，不写明文文件。随时可以在「设置 → 存档与隐私」点「删除已保存凭据」。
- **业务在学校页面办理**：预约、选课和付款都由你在官方系统操作，应用不代提交、不抢位。公告只读取学校公开页面，不提供任意网址代理。
- **本地服务只监听本机**：只绑定 `127.0.0.1`，拒绝其他网页发来的请求，接口还要求本次运行随机生成的凭据；同一台电脑上的其他 Windows 用户找到端口也读不到你的笔记、存档和成绩。
- **宿舍区认证是明文的**：学校 Dr.COM 网关走 HTTP，这是学校协议的现状；教学区深澜走 HTTPS 并保留证书校验。
- **不做绕过计费或共享上网的功能**，请遵守学校的网络使用规定。

详见[数据、隐私与安全](docs/guide/data-and-privacy.md)。

## 命令行 szunet

不想开窗口，或想把校园网认证写进脚本时用。Windows、macOS、Linux 都有单文件版，见[下载](#下载)。

```text
szunet config set    # 先保存账号：交互输入，密码不显示
szunet login         # 用保存的账号登录，自动判断教学区或宿舍区
szunet status        # 查看当前区域和在线状态
szunet diag          # 连不上时先跑它，再按结论排查
szunet logout        # 注销下线
```

本工具是第三方作品，与深圳大学无关；别和官方客户端同时用，会互相踢下线。不要把真实账号密码写进共享脚本或日志。示例中的 `szunet` 请换成你下载的文件名（如 `./szunet-darwin-arm64`）；macOS / Linux 首次运行的步骤，以及全部子命令、参数和脚本用法，见[校园网连接与命令行 szunet](docs/guide/network.md)。

## 参与开发

欢迎提 issue 和 PR。构建环境、提交前检查、发布流程和项目硬规矩见 [CONTRIBUTING.md](CONTRIBUTING.md)；开发进度与未完成事项见 [docs/STATUS.md](docs/STATUS.md#s1-1)。安全问题请按 [SECURITY.md](SECURITY.md) 报告，不要在公开 issue 里写可利用细节。

## 更新日志

beta0.9.6 增加首分钟课堂笔记入口与保存后重新打开工作区，修复引导与笔记恢复中的保存并发。Windows 安装包与 macOS 预览版继续使用原生构建和隔离冒烟检查；真实校园登录、睡眠恢复、生产签名及 macOS 真机验收仍待完成。详见 [CHANGELOG.md](CHANGELOG.md) 与 [交付验证记录](docs/STATUS.md#s71)。

## 致谢

- [teleostnacl/LoveSzu](https://github.com/teleostnacl/LoveSzu)：本科个人课表接口路径与字段的调研参考；按接口事实独立实现，没有复制其源码。
- [Fusion Pixel Font（缝合像素字体）](https://github.com/TakWolf/fusion-pixel-font)：TakWolf，SIL Open Font License 1.1，声明随包附在 `FONT-LICENSE-OFL.txt`。
- [Sleepstars/SZU-login](https://github.com/Sleepstars/SZU-login)：深澜 xEncode 实现的来源归属保留在 [LICENSE](LICENSE) 中。
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 与 [福大助手](https://github.com/west2-online/fzuhelper-app)：界面层级与校园服务组织的参考。
- [MattDong123/tools4szu](https://github.com/MattDong123/tools4szu)：作者 Matt，经其授权用于学校系统接口调研。本项目没有复制它的代码，而是按它记录的接口地址、数据表名和字段名，用 Go 重新实现了一套带会话失效判定的读取逻辑。该仓库未声明开源许可，因此这里只作事实性致谢，不构成对其代码的再分发。

## 许可

本项目采用 MIT 许可，见 [LICENSE](LICENSE)。第三方组件的原有许可不被本项目的 MIT 替代，完整声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：

- Fusion Pixel 字体：SIL Open Font License 1.1
- [Three.js 0.180.0](https://www.npmjs.com/package/three/v/0.180.0)：MIT，Copyright © 2010-2025 three.js authors
- 改编自 [Sakura Crossing](https://github.com/Kenton-GMI/sakura-crossing/tree/de01898e89c7f6ab3fad93fa802f0f5ac66fbd81) 的三渲二渲染模块：MIT，Copyright (c) 2026 Kenton Wang
- 改编自 [2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc) 的移动与合并规则：MIT，Copyright (c) 2014 Gabriele Cirulli
- Electron 与 Chromium（仅安装版）：各自的许可保留在安装目录

安装版把项目、字体、2048、Three.js 和 Sakura Crossing 的许可文件放在 `resources/licenses/`，便携 ZIP 放在解压目录里。实验 VPN 模块的第三方来源与授权范围仍在核对中，默认桌面构建不包含该模块。EasyConnect 等第三方名称的权利归各自权利人所有。

Pingu 与《马达加斯加》的 Skipper 是项目自行绘制的粉丝像素形象，角色权利归各自原权利人；本项目的 MIT 许可不涵盖这些角色，也不代表获得官方授权或背书。

## 桌面首分钟改进

beta0.9.6 增加课堂笔记快捷入口、保存失败保留草稿和「保存并重新打开」。见 [桌面首分钟学习与重载](docs/guide/desktop-first-minute.md)。原生构建和冒烟以对应提交的 CI 记录为准；此前 45 分钟测试仅为浏览器测试版证据。真实校园登录、睡眠恢复和生产签名仍待验收，本轮为预发布。
