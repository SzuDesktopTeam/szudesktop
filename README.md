<div align="center">

# szuDesktop · 荔枝庭院

**把深大的一小片校园，搬到你的桌面。**

查校园消息，写课堂笔记；专注一会儿，再回湖边收一颗萝卜。<br>
为深圳大学同学做的桌面应用，免费、开源，带一位会陪你的像素伙伴。

![platforms](https://img.shields.io/badge/Windows%2010%2F11-macOS%2013%2B%20preview-4a6fa5?style=flat-square) ![license](https://img.shields.io/badge/license-MIT-52764d?style=flat-square) ![release](https://img.shields.io/github/v/release/SzuDesktopTeam/szudesktop?include_prereleases&style=flat-square&label=release&color=a3485d)

**简体中文** · [English](docs/README_en.md)

**[下载桌面版](#下载)**　·　[看一分钟宣传片](https://www.bilibili.com/video/BV1wZpA66EVd/)　·　[使用指南](docs/guide/README.md)　·　[反馈与建议](docs/guide/feedback.md)

![szuDesktop 首页：校园风景、今日安排与学习入口](docs/readme-home.png)

<sub>应用真实界面。学生自制的非官方项目，与深圳大学无隶属或背书关系。</sub>

</div>

## 上课、下课，都有一个落脚点

- **上课先记下来。** 从首页新开课堂记录，按课程整理笔记；一句还没弄懂的话，选中就能变成待办。
- **学校的小事集中看。** 首页搜「查书」「公告」「电量」直达工具；查学院通知、馆藏位置、校历与场地信息，需要本人账号的业务再去学校页面登录。
- **给专注留一点盼头。** 选荔宝、栗栗或小白陪你，完成专注攒荔枝币；课间回庭院种菜、交委托、合一局 2048。

庭院、待办、专注和课程笔记都能**离线使用，不需要学校账号**。校园查询需要联网，个人业务仍有测试范围，详见[已知限制](#已知限制)。

## 下载

**Windows 10 / 11（64 位）与 macOS 13 起；没有手机版。** macOS 目前为预览版，Linux 提供校园网命令行。

**beta0.9.10 · 校园工具与首页体验更新。** [查看本版更新与全部附件](https://github.com/SzuDesktopTeam/szudesktop/releases/tag/beta0.9.10)。仍为预发布版本，学校个人业务的验证范围见下文。

| 你的电脑 | 选这个 | 打开方式 |
| :-- | :-- | :-- |
| **Windows · 推荐** | [下载 Windows 安装版](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-Setup-0.9.10.exe) | 按提示安装，自带窗口、桌面伙伴与托盘 |
| Windows · 免安装 | [下载便携 EXE](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-portable.exe) | 双击运行；本机记录与安装版共用 |
| **Mac · Apple 芯片** | [下载 arm64 DMG（预览）](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-mac-arm64.dmg) | 打开后拖入「应用程序」 |
| **Mac · Intel** | [下载 x64 DMG（预览）](https://github.com/SzuDesktopTeam/szudesktop/releases/download/beta0.9.10/szuDesktop-0.9.10-mac-x64.dmg) | 打开后拖入「应用程序」 |

Mac 不确定选哪个：看「苹果菜单 → 关于本机」里的芯片或处理器。电脑上不用另装开发环境；旧的浏览器便携版与命令行版见[安装指南](docs/guide/install.md)。

<details>
<summary><b>第一次被系统拦截？以及怎么更新</b></summary>

安装包尚未数字签名，Mac 版尚未经过 Apple 公证，首次运行可能被系统拦截。

- **Windows**：确认来自本仓库发布页后，在 SmartScreen 点「更多信息 → 仍要运行」。浏览器下载拦截的处理见[安装指南](docs/guide/install.md)。
- **Mac**：打开一次后，到「系统设置 → 隐私与安全性」选择「仍要打开」；macOS 13 / 14 也可在「应用程序」中 Control 点按应用并选择「打开」。
- **更新**：在「设置 → 关于与更新」手动检查，没有自动下载安装。先分别导出庭院与待办、备份课程笔记，再安装新版；Mac 先完全退出，再替换应用。
- 发布附件带同名 `.sha256` 校验文件。它可核对下载完整性，不能代替发布者签名；不要把所有安全提示都当成误报。

</details>

## 快速上手

1. **选伙伴。** 欢迎引导里点「去认识我的伙伴 →」，挑一位陪你。之后随时可以换，名字和成长各自保留。
2. **写下第一节课。** 首页点「新开课堂记录」，按课程建一页笔记。下次点「继续写笔记 →」接着写，内容自动保存在本机。
3. **先专注 5 分钟。** 首页点「开始 5 分钟」，结束后领取 5 荔枝币和 5 点成长。第一颗小萝卜约 1 分钟成熟，去「荔枝庭院 → 我的农田」收下它。

需要校园服务时再登录。**校园网认证与学校业务登录分开办理**，一个业务登录成功也不代表其他业务已有权限。完整步骤见[快速上手指南](docs/guide/getting-started.md)。

## 功能

### 一张课程书桌

![课程笔记真实界面：课程书架、示例笔记与页面大纲](docs/readme-notes.png)

把每门课放进自己的书架。用模板开篇，写 Markdown、搜关键词、看本页大纲；把一句话转成待办，留给下次复习。

笔记有回收站和导入导出，待办可以定日期、编辑和归档。专注支持 5 / 25 / 45 分钟或自定时长，完成并领取后，每分钟得到 1 荔枝币与 1 点成长。飞书课程文档支持授权后的只读导入，不是双向同步。[学习功能指南 →](docs/guide/study.md)

### 四类校园小事，少翻几个入口

![校园服务真实界面：图书馆馆藏查询](docs/readme-campus.png)

| 模块 | 在这里做什么 | 使用范围 |
| :-- | :-- | :-- |
| **学校公告** | 按学院看通知，展开正文与附件，按标题或全文找关键词 | 17 个学院可内读，另有教务部与研究生院；18 个来源接校方检索与分页，材料学院仅筛选本次标题，其余提供官网入口 |
| **学业** | 看官方校历、个人课表；查询全校班级课表、已发布培养方案；导入成绩计算绩点 | 个人业务需本人权限，在线成绩不会自动并入本机绩点；全校课表与方案仍待真实账号验收 |
| **校园生活** | 看体育场馆与时段、自习空间空位，查询宿舍电量，导出自习提醒 | 校内服务需相应网络；电量需配置本机入口，单位为 kWh（度），真实房间与体育预约提交尚未验收 |
| **图书馆** | 按书名、作者或主题查馆藏，展开位置、索书号和在架状态 | 馆藏查询无需登录；个人借阅、知网与万方提供学校官方入口 |

学校查询保留来源与范围，读不到时可回原页查看。学业完成、创新领航讲座与个人借阅尚未同步到本机；培养方案要求也不等于个人已修学分。知网、万方入口不代表已经取得机构授权。[校园服务与登录指南 →](docs/guide/campus.md)

### 下课后，回湖边一会儿

![荔枝庭院真实界面：伙伴与湖畔农田](docs/readme-garden.png)

荔宝热情爱笑，栗栗守着它的纸箱，小白从文山湖边来。点点伙伴、摸摸头、喂口点心；Windows 安装版、便携 EXE 和 macOS 版还能让它住在桌面一角，拖动位置、滚轮调大小。

种萝卜、草莓、蓝莓和荔枝，离开应用后作物也会继续生长。收成用来交伙伴委托、建设庭院，歇一会儿就到伙伴小桌玩 2048。没有充值和排行榜，也不需要在线打卡。

想换个窗外风景，可以在像素庭院、荔湖晴昼、雨后书屋和蓝调晚庭之间切换。[庭院与伙伴指南 →](docs/guide/garden.md)

### 校园网连不上时，先看看卡在哪

「校园网」页把外网连通、校园认证和门户可达分别显示，并提供区域、协议与代理线索。无法确认的状态不会写成已在线；外网可用也不代表校园认证成功。

支持教学区深澜、宿舍区 Dr.COM 的登录与注销，识别失败时可手填区域和接入点编号。启动时最多自动认证一次，可在设置里关闭；不会周期性重连。代理、路由器或 VPN 下遇到问题，先运行诊断，再按[校园网指南](docs/guide/network.md)处理。

## 已知限制

这是仍在完善的预发布项目。**本机功能可先用起来，学校个人业务请同时以学校原页为准。**

- **还没完成全部现场验收**：真实账号下的课表、成绩、全校课表与培养方案，真实房间电量、体育预约提交，以及部分校园网场景仍待验证。macOS 也有待真机验证项。
- **预约与学校记录有边界**：社区预约在学校原页办理；体育预约提交仍在测试，不自动抢位。学业完成、讲座和个人借阅目前仅提供官方入口，没有本机同步、续借或自动选课。
- **数据不会跨设备同步**：庭院和笔记分开备份；飞书只读导入。Linux 没有桌面版，手机端未提供，实验 VPN 模块不包含在默认发行版中。

逐项实现与验收记录见 [开发状态](docs/STATUS.md#s1-1)，本轮校园模块证据见 [STATUS 第 76 节](docs/STATUS.md)。

## 安全与隐私

- **记录留在本机。** 庭院、待办与课程笔记保存在用户目录 `.szunet`，各自可导出；记录文件及导出备份未加密，请自行保管。
- **账号用系统安全存储。** Windows 用 DPAPI、macOS 用钥匙串；校园网命令行在 Linux 用 Secret Service，没有安全设施时拒绝保存。学校窗口的 Cookie 留在本机独立浏览器资料中，关窗不会清除，可主动删除登录状态。
- **没有遥测或统计埋点。** 校园查询请求相应学校服务；网络诊断会访问公共联网检测地址，手动检查更新会访问 GitHub。诊断报告可预览后复制，不自动上传。
- **认证协议有差别。** 教学区深澜使用 HTTPS；宿舍区 Dr.COM 使用学校现有的 HTTP 协议。项目不提供绕过计费或共享上网功能。

电量查询不借用教务 Cookie，房号和结果只留在当前界面内存。更多联网行为、备份与清除方式见[数据、隐私与安全](docs/guide/data-and-privacy.md)。

## 常见问题

<details>
<summary><b>打不开、不会退出、换电脑，或者学校服务报错？</b></summary>

先看[安装与更新](docs/guide/install.md)、[常见问题](docs/guide/faq.md)和[校园网排查指南](docs/深圳大学校园网连不上排查指南.md)。换电脑前分别导出庭院与待办、备份课程笔记；账号与学校登录不随这两份备份迁移。

仍有问题，欢迎[提交反馈](docs/guide/feedback.md)。说清想做什么、卡在哪一步即可；可附「设置 → 关于与更新 → 反馈与建议」中预览过的诊断报告，请不要附密码、Cookie 或个人成绩。目前反馈使用 GitHub Issues，需要 GitHub 账号。

</details>

## 命令行 szunet

<details>
<summary><b>只想连接校园网，或在 Windows / macOS / Linux 上写脚本</b></summary>

从 [Releases](https://github.com/SzuDesktopTeam/szudesktop/releases) 下载对应系统的 `szunet` 单文件，将下面的命令名替换为实际文件名（macOS / Linux 通常加 `./`）：

```text
szunet config set    # 交互保存账号，密码不回显
szunet login         # 自动判断区域并登录
szunet status        # 查看当前区域与状态
szunet diag          # 诊断连接问题
szunet logout        # 注销
```

不要与官方客户端同时认证，也不要把密码写进共享脚本。全部参数与首次运行方法见[命令行指南](docs/guide/network.md)。

</details>

## 一起把它做得更好

欢迎提交问题、改进建议和 PR。构建与检查见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)，尚未完成的事项见 [STATUS](docs/STATUS.md#s1-1)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

### 致谢与许可

项目代码采用 [MIT License](LICENSE)，第三方组件保留各自许可，完整声明随包分发于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

- [LoveSzu](https://github.com/teleostnacl/LoveSzu)：本科课表接口事实参考，独立实现，未复制源码。
- [SZU CLI](https://github.com/AwesomeHou/szu-cli)：全校课表、培养方案等接口与解析参考及改编；MIT，Copyright (c) 2026 SZU CLI contributors。
- [tools4szu](https://github.com/MattDong123/tools4szu)：经作者 Matt 授权用于接口调研；按接口事实重新实现。其仓库未声明开源许可，本项目未复制或再分发其代码。
- [SZU-login](https://github.com/Sleepstars/SZU-login)：深澜 xEncode 衍生实现，原有版权声明保留在 [LICENSE](LICENSE)。
- [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)：TakWolf，SIL OFL 1.1；[Three.js](https://www.npmjs.com/package/three/v/0.180.0)：MIT；[Sakura Crossing](https://github.com/Kenton-GMI/sakura-crossing/tree/de01898e89c7f6ab3fad93fa802f0f5ac66fbd81)：Kenton Wang 的三渲二渲染模块，MIT；[2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc)：Gabriele Cirulli 的移动与合并规则，MIT。
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 与[福大助手](https://github.com/west2-online/fzuhelper-app)：界面层级与校园服务组织参考。Electron、Chromium 的许可保留在安装目录。

Pingu 与《马达加斯加》的 Skipper 为项目自行绘制的粉丝像素形象，角色权利归各自权利人；本项目的 MIT 许可不涵盖这些角色，也不代表官方授权或背书。实验 VPN 模块的第三方来源与授权仍在核对，未纳入默认发行构建。
