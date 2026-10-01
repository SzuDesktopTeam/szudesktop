# 参与贡献

欢迎提 issue 和 PR。这个项目处理校园网密码和学校业务系统的登录 Cookie，
所以有几条硬规矩，动手前请先看完。

**唯一事实源是 [docs/STATUS.md](docs/STATUS.md)**：所有问题编号（F/U/D/X/Q/R 系列）、
功能范围、验收记录和发布历史都在那里。本文只讲「怎么改代码、怎么验证」，
不重复维护另一套任务清单。

## 第一次贡献

不用先装 Windows 或 Electron，在任何系统上都能在浏览器里预览界面：

```text
python3 desktop/sync-assets.py                  # 把页面源文件同步进内嵌目录
SZUNET_CONFIG_DIR=$(mktemp -d) go run ./desktop/cmd/szudesktop --no-auto-login   # 用临时配置目录启动，默认浏览器会打开页面
node desktop/run-checks.mjs                     # 改完跑全部检查
```

- `SZUNET_CONFIG_DIR` 让预览用一个空的临时目录，不碰你自己的庭院存档。账号只在 Windows 和 macOS 上跟着隔离：Windows 的加密账号文件就在这个目录里，macOS 上桌面服务改用带 `-test-` 后缀的钥匙串条目。`--no-auto-login` 让启动时不拿已保存的账号去连校园网。
- Linux 的 Secret Service 条目不随 `SZUNET_CONFIG_DIR` 隔离，预览读到的就是你真实保存的 `szunet` 账号：别去掉 `--no-auto-login`，登录时也不要勾选「认证成功后记住账号密码」，否则会覆盖真实的条目。
- macOS 上实测过（2026-09-29）：同步、编译、用临时配置目录启动都正常，首页和 `/api/health` 可以访问（加 `--no-open` 时不自动开浏览器，要自己打开 `<终端里打印的地址>/?launch=<「szuDesktop 会话」那一行的值>`）。Linux 上 CI 会编译并测试桌面服务，打开浏览器用的是 `xdg-open`，但还没人在 Linux 上实际预览过。Windows 上 `python` 可能不叫 `python3`，临时目录换成 `$env:TEMP` 下自己建的文件夹。
- 适合先上手的事：[STATUS 1.1 节](docs/STATUS.md#s1-1)里「其余 11 个学院公告栏目」中能套用通用解析器的学院（改一行目录、加一个 HTML 夹具，不需要账号）；计算机与软件学院和外国语学院不在其列。
- 界面上用词以下面的[界面用词](#界面用词)为准。

## 环境

| 依赖 | 用途 |
|---|---|
| Go | 版本见 `go.mod`，编译 CLI 与桌面服务 |
| Python 3 | 构建、冒烟、打包脚本 |
| Node.js | 前端与 Electron 回归检查脚本（`desktop/check-*.mjs`、`desktop/electron/check-*.mjs`） |
| Xcode Command Line Tools | 只在构建 macOS 桌面版时需要：`codesign`、`lipo`、`vtool`、`hdiutil`、`iconutil`，见[macOS 桌面版](#macos-桌面版) |

`build-windows.py` 用 `GOOS=windows` 交叉编译，图标和版本信息由纯 Python 的 `add_resource.py` 写入，
不依赖 Windows 专属工具（CI 只在 Windows runner 上跑它）；需要 Edge 或 Chrome 的是整机冒烟
`smoke_windows.py`，它只能在 Windows 上运行（冒烟会起真实浏览器窗口）。macOS / Linux 上，本文命令里的 `python` 通常要写成 `python3`。

**本地试用界面**：任何系统上都可以按[第一次贡献](#第一次贡献)用 `go run ./desktop/cmd/szudesktop` 在浏览器里预览
（桌面服务入口是 `desktop/cmd/szudesktop`；macOS 已实测，Linux 只有 CI 的编译与测试，Linux 桌面端也不在发布范围内，
见[范围与非目标](#范围与非目标)）。在 Windows 上跑完 `python desktop/build-windows.py` 后，也可以直接运行
`dist/szudesktop-windows-amd64.exe`（就是便携版里的 `szudesktop.exe`，用本机 Edge / Chrome 开窗）。
macOS 的开发模式与打包见[macOS 桌面版](#macos-桌面版)。

## 界面资源的规矩

- **唯一源文件**：`desktop/index.html` 与 `desktop/assets/garden/`。
- `desktop/assets/index.html` 和 `desktop/internal/ui/assets/` 是 `python desktop/sync-assets.py`
  生成的副本，已被 gitignore，**不要手改**。
- 改完界面先跑 `sync-assets.py`，再跑检查脚本，否则检查读到的是旧副本。
- 页面源码里不允许写死版本号：顶栏与关于页从 `/api/status` 的 `app_version` 取，
  `check-ui.mjs` 和 `smoke_windows.py` 各有回归守着。
- 默认构建只打包 `index.html`、`szudesktop.ico`、`garden/` 和 OFL 许可的 Fusion 像素字体：
  `sync-assets.py` 只复制这些。来源未核实的旧游戏素材（原 `desktop/assets/art/`
  和星露谷字体 `svbold.ttf` / `svthin.ttf`）已从仓库删除（STATUS 第 30.1 节），`smoke_windows.py`
  断言 `/assets/art/m1.png` 与 `/assets/fonts/svbold.ttf` 返回 404，防止它们回到包里。
  实验 VPN 协议同样不在默认构建里，见[实验 VPN 模块](#实验-vpn-模块)。

## 界面用词

一个东西只用一个名字：导航名、页标题和页面顶部的路径（面包屑）用同一个词，界面、README 中英两版和 `docs/guide/` 都照这张表写。
页名写在 `desktop/assets/garden/app.mjs` 的 `pages`（导航）和 `campus-world.mjs` 的 `ROOMS`（页头与路径）两处，`check-workspace-ui.mjs` 核对导航、页标题和路径一致，改名时三处一起改。

| 东西 | 只用这个名字 | 不再用 |
|---|---|---|
| 首页 | 今日（导航名，也是各页路径的根；「深大校园生活手帐」只作品牌副标题） | 今日手帐、庭院（作为路径的根） |
| 其余各页 | 校园网、校园服务、荔枝庭院、学习书屋、设置 | 连接小站、连接站、荔园告示板、公告板、伙伴的后院、小屋与菜畦、庭院书屋、我的小屋、收纳柜、学习工具 |
| 荔枝庭院的分区 | 伙伴小屋、我的农田、庭院集市、伙伴小桌、回忆与建设 | 我的小屋（容易和伙伴小屋混淆） |
| 桌面上常驻的伙伴 | 桌面伙伴 | 桌面宠物、宠物 |
| 暂停专注通知的开关 | 勿扰（设置和托盘同名） | 安静陪伴 |
| 伙伴的三项数值 | 饱食、精力、心情 | 饱腹、饱食度 |
| 页脚的两个入口 | 欢迎引导（应用内的引导框）、使用指南 ↗（`docs/guide/`） | 用「使用指南」指引导框 |
| 首页的笔记卡片 | 我的课程笔记 | 我的课程手帐、课程手帐 |
| 学校个人业务的未验收标记 | 暂时保持「接入测试 · 未经真实验收」；以后改措辞，必须保留「没用真实账号验收过」的意思 | — |

- 首页风景里的「去书屋写笔记」「看看告示板」「去后院转转」是场景文案，不当页名用。
- `check-workspace-ui.mjs` 扫描 `desktop/assets/garden/` 的页面源码和 `index.html`（整行注释、HTML 注释和伙伴台词 `pet-dialogue.mjs` 除外），表里「不再用」的名字一出现就失败；往表里加旧名时，同步加进那项检查的名单。
- Electron 外壳（`desktop/electron/` 的托盘、伙伴菜单和通知）还写着「宠物」「饱腹」「学习工具」，改名排在 [STATUS 1.1 节](docs/STATUS.md#s1-1)「术语统一的剩余部分」；改完之前，文档里描述这些菜单时照界面实际显示的字写。
- 界面文字不小于 12px，`check-ui.mjs` 静态扫描 CSS 守着；唯一的例外是 2048 棋盘上五位以上的数字，靠 `clamp` 缩放才放得进格子。

## 提交前请跑

```text
python desktop/sync-assets.py
node desktop/run-checks.mjs          # 全部前端、Electron 与发布脚本回归，和 CI 的 test job 同一个入口
go vet ./...
go test ./...
```

有 `make` 的话，`make check-all` 按同样顺序跑完这四步，另外还跑 `go mod tidy -diff`、`go vet -tags campusvpn ./...` 和 campusvpn 构建的界面包测试；只有 `-race`（需要 cgo）只在 CI 上跑。

`run-checks.mjs` 自动发现 `desktop/check-*.mjs`、`desktop/electron/check-*.mjs`
和 `desktop/check_*.py`，逐个运行、最后汇总失败。新增检查只要按这个命名放进对应目录，
本地和 CI 都会跑到，**不要**再往 CI、Makefile 或文档里手抄清单（以前就是这样抄漏的）。
`--only-node` 只跑 JS 检查。运行前它会先做一次模块语法与链接检查（`desktop/module-links.mjs`）：对页面和 Electron 的全部 `.mjs` 做语法检查，并核对每个相对导入的文件存在、具名导入确有导出。
`desktop/check_*.py` 目前有五个：发布说明抽取（`check_release_notes.py`）、许可文件与第三方哈希
（`check_licenses.py`）、Windows 版本资源（`check_version_resource.py`）、macOS 构建与冒烟脚本的纯逻辑
（`check_macos_scripts.py`）和文档锚点（`check_status_doc.py`，见[文档与截图](#文档与截图)）。有任何一项失败，`run-checks.mjs` 汇总后以非零码退出；
单个检查超过 5 分钟没结束也算失败（`TIMEOUT_MS`）。

性质测试（`desktop/check-properties*.mjs` 和 Go 的 `*_property_test.go`）默认种子是 `20260928`，
失败时会打印种子；JS 用 `PROPERTY_SEED=<种子>`、Go 用 `SZU_PROPERTY_SEED=<种子>` 原样重放。

本地用 curl 调试 `/api/*` 时要带 `X-SZU-Token` 头，值取自引擎标准输出里的 `szuDesktop 会话: <值>` 一行，或配置目录中 `desktop-instance.json` 的 `token` 字段；`/api/health` 不需要。

调试时会碰到的其他防护（实现在 `desktop/internal/ui/api_guard.go`）：服务只监听 `127.0.0.1`，
拿到非回环地址直接拒绝启动；`/api/*` 依次校验回环 Host、`Sec-Fetch-Site` 和同源 `Origin`（不符合返回 403），
再校验本次运行随机生成的凭据（没有返回 401）。只有两个接口不要凭据：只报版本的 `/api/health`，
以及在请求体里自带同一份凭据的 `/api/instance`。Electron 主进程发请求时带 `X-SZU-Token` 头；
页面第一次打开时用一次性的 `/?launch=<凭据>` 换成 HttpOnly、SameSite=Strict 的会话 Cookie，
随即跳回不带凭据的地址，地址栏不留凭据（便携版打开浏览器也走这条路）。

桌面引擎的启动参数：`szudesktop.exe --no-open` 只启动 Go 服务、不开窗口，Electron 外壳就是这样拉起 sidecar 的；
`--no-auto-login` 关闭启动时用已记住的账号自动认证。外壳在「启动时自动连接校园网」关闭时、以及冒烟时都会带上它
（`desktop/electron/desktop-settings.mjs` 的 `sidecarArgs`）。

改了桌面端还要在 Windows 上跑：

```text
python desktop/build-windows.py      # 构建（含图标与版本信息）
python desktop/smoke_windows.py      # 整机冒烟
node desktop/electron/build.mjs      # 构建 Electron 安装包（先在 desktop/electron 下 npm ci）
python desktop/make_release.py       # 生成便携 ZIP（只在真的要发布时跑，会覆盖同名本地产物，见「发布」）
```

`build-windows.py` 产出的 `dist/szudesktop-windows-amd64.exe` 既是便携 ZIP 里的 `szudesktop.exe`，
也是 Electron 安装包里的 Go sidecar（`electron-builder.yml` 的 `extraResources`）。`build.mjs` 默认先调用
`build-windows.py` 重编这份引擎，加 `--skip-sidecar` 则直接用已有产物（CI 就这样复用冒烟通过的那份）；
安装包和同名 `.sha256` 输出到 `desktop/electron/release/`。
NSIS 安装包关掉了差分打包（`electron-builder.yml` 的 `nsis.differentialPackage: false`）：改用整体压缩，
安装包约小 10MB，也不再生成 `.blockmap`，代价是打包慢一些。项目没有接自动更新，用不上差分包；以后真接自动更新时再评估要不要改回
（`check-packaging.mjs` 锁着这一行，改回时一起改断言）。

`python desktop/electron/smoke_installer.py` 只在一次性的 GitHub Windows runner 上安装、重开、重装和卸载最终安装包：
不是 Windows、或没有 `GITHUB_ACTIONS=true` 和 `RUNNER_TEMP` 时它直接拒绝运行，什么都不安装。
不要在开发机上把它当安装检查。PR 和标签流水线都保留全部构建与安装检查，标签流水线全部通过后才发布附件（见「发布」）。

只改命令行 `szunet` 时：`make build` 编出当前平台的 `dist/szunet`（`go build -trimpath -ldflags "-s -w"`）；
没有 make 的 Windows 上可以直接 `go build -o dist/szunet.exe ./cmd/szunet`。`make cross` 交叉编译 5 个平台
（linux / darwin 的 amd64 与 arm64、windows amd64），CI 的 `build-cli` 用的就是它；注意它会先 `make clean`
删掉整个 `dist/`，包括 `build-windows.py` 的产物。

**行尾**：仓库的 `.gitattributes` 让文本在所有平台都按 LF 检出（`*.ps1` 等 Windows 脚本除外），
这样 Windows 与 Linux 编出的 exe 字节一致，随包的第三方模块也对得上
`desktop/assets/garden/vendor/SOURCE.json` 记录的哈希（`check_licenses.py` 会核对）。
加入这个文件之前检出的 Windows 工作副本仍是 CRLF：`gofmt -l .` 会把几乎所有文件列出来，
`check_licenses.py` 也会提示 vendor 文件是 CRLF。删掉对应文件后 `git checkout -- <路径>`，
或整库重新检出一次即可。

## macOS 桌面版

macOS 版与 Windows 安装版是同一套 Electron 外壳加 Go 引擎，按芯片出两个 ad-hoc 签名的 DMG
（`szuDesktop-<版本>-mac-arm64.dmg`、`-mac-x64.dmg`），不公证、不做自动更新。实现取舍与验收边界见
[STATUS 第 68 节](docs/STATUS.md#s68)。只能在 macOS 上构建，需要 Xcode Command Line Tools；首次先在
`desktop/electron` 里 `npm ci`。

```text
python3 desktop/build-macos.py            # 编 arm64 与 amd64 两个引擎并 ad-hoc 签名：dist/szudesktop-darwin-<arch> 及 .sha256
python3 desktop/build-macos.py --dev      # 只编本机架构，再复制成 dist/szudesktop 给开发模式用
cd desktop/electron && npm start          # 开发模式（先跑上一行）
node desktop/electron/build-mac.mjs       # 打两个 DMG，输出到 desktop/electron/release/（默认先调 build-macos.py）
make desktop-mac                          # 等于 build-macos.py 再 build-mac.mjs --skip-sidecar
make desktop-mac-dev                      # 等于 build-macos.py --dev
```

- `build-macos.py` 的 `--arch arm64|amd64` 可以重复；amd64 的 `--version` 自检在 Apple 芯片上要有 Rosetta。
  引擎的 `.sha256` 写的是相对仓库根的路径，所以在仓库根核对：`shasum -a 256 -c dist/szudesktop-darwin-*.sha256`。
- `build-mac.mjs` 的 `--arm64` / `--x64` 只打一个架构，`--skip-sidecar` 复用已编好的引擎（CI 就这样复用冒烟通过的那份）。
  引擎放在 .app 的 `Contents/MacOS/szudesktop-engine`：那是嵌套代码的位置，随整个应用一起签名、一起过 Gatekeeper。
  它由 `build-macos.py` 预签名（`com.szudesktop.engine`），`electron-builder.yml` 的 `signIgnore` 不再重签，所以包里的引擎
  与冒烟通过的那份逐字节一致。打完脚本断言 ad-hoc 签名、引擎字节、版本号与最低系统版本，再写 DMG 的 `.sha256`；
  hdiutil 偶发「Resource busy」时整轮重打，最多再试 2 次。`release/builder-debug.yml` 不要上传。
- 图标：`python3 desktop/design/gen_icon.py --mac` 生成 `szudesktop.icns` 和菜单栏模板图，需要 Pillow 和 `iconutil`。
  产物已提交；不加 `--mac` 时仍只生成 `.ico`，字节不变。
- `npm ci` 可能因 npm 的 allow-scripts 策略跳过 Electron 的 postinstall：开发模式缺 `node_modules/electron/dist` 时执行
  `node node_modules/electron/install.js`（需要时设 `ELECTRON_MIRROR`）。打包用 electron-builder 缓存的 Electron 压缩包，不受影响。
- 本机会留下的痕迹：开发模式的 Electron 会建 `com.github.Electron` 偏好域，并把 `node_modules/electron/dist/Electron.app`
  登记进 LaunchServices；electron-builder 会把 `release/mac*/szuDesktop.app` 登记进 LaunchServices。要清理时用
  `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u <路径>`。

### macOS 冒烟

- `python3 desktop/smoke_macos.py --arch arm64|amd64`：引擎冒烟。签名与架构、与 `smoke_windows.py` 相同的接口检查、
  2KB 学校会话只在钥匙串留密钥（密文在 `session.enc`，0600）、SIGTERM 优雅退出、launchd 默认 PATH 下的开机自启状态。
- `python3 desktop/electron/smoke_dmg.py --arch arm64|x64 [--dmg <路径>]`：DMG 安装版冒烟。挂载、复制、静态核对，
  真启动四次（首次打开、重开、真实的 quit Apple Event、复用便携引擎），最后删掉复制出来的 .app 并核对数据不动。
- 两个脚本默认只在一次性的 GitHub macOS runner 上运行；开发机上必须显式加 `--local`，否则什么都不做就退出。
  它们只用临时目录里的配置，钥匙串只会建带 `-test-<配置目录哈希>` 的条目、结束时删掉，并核对真实
  `szunet` / `szunet-session` 条目的修改时间不变。`smoke_dmg.py --local` 另外会：先 `defaults export` 备份
  `com.szudesktop.app` 偏好，结束后还原（本来没有就 `defaults delete`，并删掉它留下的空 plist；不直接拷 plist 文件，
  免得被 cfprefsd 的缓存覆盖）；删掉本次新建的 `~/Library` 缓存目录；从 LaunchServices 注销复制出来的 .app；
  只结束自己启动的进程。它会在屏幕上真的打开窗口，运行时不要去点。
- 证据写在 `desktop/electron/release/smoke-evidence-mac-<arch>/`，写完把令牌打码。

### 验证分层

- **A 类**（本机自动执行）：Go 测试（含 `GOARCH=amd64` 在 Rosetta 下）、`run-checks.mjs`、引擎与 DMG 冒烟、Windows 打包比对。
  全程设置 `SZUNET_CONFIG_DIR`，只碰带 `-test-` 的钥匙串条目，不登记登录项、不注销、不打开系统设置、不改通知权限。
- **B 类**（B1–B9，清单见 [STATUS 68.2](docs/STATUS.md#s68-2)）：必须由人在**独立的 macOS 用户账户或虚拟机**里做，
  不在日常使用的账户上做——注销会结束当前会话，从「应用程序」直接运行会读写与命令行版共用的真实钥匙串条目，
  登记登录项和改通知权限会改动真实系统。维护者 2026-09-29 决定 DMG 从 beta0.9.5 起以预览版随版本发布，不再等 B 类全部通过
  （[STATUS 68.4](docs/STATUS.md#s68-4)）；B 类仍要逐项做，全部通过之前每一版的发布说明都带预览版说明，
  由 `desktop/release_notes.py` 的 `MAC_PREVIEW` 开关把关（见[发布](#发布)）。
- CI 只覆盖 macOS 26（arm64）和 macOS 15（Intel）；GitHub 已不提供 macOS 13 和 14 的镜像，发布前在虚拟机里人工抽测（B8）。
- DMG 升级基线固定为已发布 beta0.9.5 的两个 DMG，版本、Electron 与 SHA-256 的唯一来源是
  `desktop/electron/mac_upgrade.py`。CI 按组合摘要恢复缓存，每次仍核对包与校验文件；损坏或缺失时才下载。
  `smoke_dmg.py` 在 runner 上必须有该基线：实际运行固定旧包里的引擎，写合成工作区、课程笔记与隔离钥匙串凭据，
  原路径替换为候选应用，核对配置字节未被安装操作修改，再验证新版读写、重开后保留与合成凭据解密。
  手动本地升级测试需在 `--local` 外传 `--baseline-dmg <已核对的旧 DMG>`；不会写入「应用程序」。
  下次 VERSION 升级时同步推进 Windows 与 Mac 的公开升级基线，不能让候选版本与基线相同。
- 原生安装版笔记失败验收只在隔离 smoke profile 中执行：临时把笔记锁路径换成目录，真实 Go API 返回 503，
  核对原笔记字节完整、离开被阻止、编辑草稿与导出备份完整；还原锁后通过原界面重试并读取持久化结果。
  文件权限不足、磁盘满、真实设备断电等另需验收，不能把锁故障的通过泛化到所有存储故障。
- 多人或多个 agent 在同一个工作树里并行改动时，凡是运行 `sync-assets.py`、`go build` / `vet` / `test`、`run-checks.mjs`、
  `npm`、`electron`、`electron-builder`、`hdiutil` 的验证，都经同一把锁串行执行，例如
  `/usr/bin/lockf -k /tmp/szudesktop-verify.lock sh -c '…'`：`sync-assets.py` 会先删掉整个 `desktop/internal/ui/assets` 再复制，
  和并行的 go:embed 编译、检查互相踩。

## 硬规矩（红线）

1. **不许谎报成功。** 读不到状态就报「状态未知」，请求失败就报错，
   绝不把失败退化成假数据或演示模式。「读不到 ≠ 没有」。
2. **凭据不进聊天、不进源码、不进发布包、不进日志。** 测试一律用
   `SZUNET_CONFIG_DIR` 隔离配置目录，不使用真实账号。
3. **不代用户提交。** 预约、选课、付款、签到、抢位一律交给学校官方页面完成，
   界面不留代提交入口，服务端也不留（见 STATUS.md F23）。
4. **不新增任意转发。** 业务聚合只走允许的目标清单，不做通用代理，不绕认证。
5. **来源没核实就不要宣称独立实现。** 代码和素材先核实来源与许可（见 F11 和下文的实验 VPN 模块）。
6. **测试只终止自己启动的进程**，不调整用户现有的系统代理。
7. **状态和待办只记在 STATUS.md 这一套**，历史资料冻结，不再同步多套清单。README 中英两版和
   `docs/guide/` 是写给用户的说明，随版本更新，但不维护任务清单，见[文档与截图](#文档与截图)。

## 修 bug 的方式

先写一个能**复现这个 bug 的失败测试**，亲眼看它红，再改代码让它变绿。
这个仓库里已有的例子：

- `cmd/szunet/status_query_test.go` — F22：CLI 没账号时跳过在线查询
- `desktop/internal/ui/booking_test.go` — F23：预约写端点必须不存在（断言 404）
- `internal/credential/store_unavailable_test.go` — F24：没有密钥环时拒绝把密码写成明文
- `cmd/szunet/logout_settings_test.go` — `szunet logout` 要沿用 `login` 的 `--ac-id`、`--ip` 和接入点缓存（假门户、子进程跑真实命令行）

新发现的问题请按 STATUS.md 的编号体系追加一行（功能/安全/工程用 `F`，
排版与交互用 `U`），写清重要程度（P0–P3）、难度（S/M/L）、状态和验收标准。
「已完成」必须附验收证据；没验证过的就写「未验证」，不要含糊过去。

## 存档兼容

庭院存档 `workspace-v1.json` 是同学手里唯一的一份记录，旧版本和新版本常常混用（便携版、单文件版和安装版共用 `~/.szunet`）。
`engine.mjs` 的 `normalize` 只留下本版本认识的键和取值，所以：

- 存档里只要会出现新的键或取值（新作物、装饰、建设、成就、伙伴、台词情境、纪念物、风景，或新的字段），就把 `engine.mjs` 的
  `SAVE_SCHEMA` 加一，`normalize` 继续接受旧的结构版本，然后运行 `node desktop/check-save-compat.mjs --print`，
  把输出贴进同一文件的 `SCHEMA_VOCABULARY`。加了键却没加版本号，`check-save-compat.mjs` 会失败并列出多出来的内容。
- 读到比自己新的结构版本时，旧版本拒读、进入只读的存档失败页，不改原文件；已发布的 beta0.9.x 本来只认 2 和 3，
  所以不要另加一个版本字段来代替 `schema`，那些版本会把它连同新数据一起丢掉。
- 提升 `SAVE_SCHEMA` 的那一版，发版时在升级冒烟里加一步：新结构的存档交给上一版读取，应拒读且文件不变。
- 存档与笔记每次保存都更新 `.bak`，每天第一次保存另存 `<文件名>.bak-YYYY-MM-DD`，保留最近 3 个使用日
  （`desktop/internal/ui/server_backup.go` 的 `dailyBackupKeep`）；读档按 `.bak`、按天备份从新到旧的顺序恢复。

## 扩展伙伴

伙伴的全部来源都在 `desktop/assets/garden/`，不另维护桌宠名册，也不从远端加载角色脚本。
当前要求以 [STATUS 第 59.3 节](docs/STATUS.md#s59-3)为准；基础字段、导出 API 和打包依赖见
[第 57.4 节](docs/STATUS.md#s57-4)。57.4 正文里的「16 类情境、每类 6 句、12 组动作」已被 59.3 的
「23 类情境、每类 12 句，18 组动作、每组 6 帧」取代。

| 文件 | 负责什么 |
|---|---|
| `pet-catalog.mjs` | 名册：稳定 ID（存档的一部分）、`name`、`sprite`、`viewBox`、`states`、`available`、`description`、`greeting`，`lines` / `personality` 引用语言模块。`available:true` 进默认阵容；停用时改成 `false` 并保留 ID，供旧存档读取（如 `turtle`） |
| `pet-art.mjs` | 基础 `<sprite>` 和普通 / 开心 / 低落 / 睡眠四态静态形象，与名册同一视框；减少动态和明信片都用它 |
| `pet-dialogue.mjs` | `PET_PERSONALITIES` 性格（identity / traits / likes / voice）；`PET_DIALOGUE` 按 `PET_CONTEXTS` 的 23 类情境、每类 12 句，每句不超过 60 字。引擎按存档里每个伙伴、每类情境的游标轮换，前端不另写话术 |
| `pet-animation.mjs` | 18 组动作（`PET_ACTIONS`）的时序、标签（`ACTION_LABELS`）、速度（`SPECIES_PACE`）和空闲安排（`IDLE_ROUTINES`）；`signatureLabel()` 给出各物种的拿手动作名 |
| `pet-animation-art.mjs` | 逐帧画法：每组 6 帧，每帧一张独立完整画面，整数像素坐标，不超出该物种的原画布；不能拿同一张图挪位置充当全部帧。`animationContactSheet(species)` 输出逐帧检查表 |
| `pet-player.mjs` | 主窗口和桌宠共用的播放器：动作映射（`petReaction`）、优先级（睡眠和专注优先）、减少动态处理 |

新物种的 ID 会写进存档，加物种也要按[存档兼容](#存档兼容)提升 `SAVE_SCHEMA`。

`desktop/electron/` 下同名的 `pet-*.mjs` 只是开发用的转导模块（`export *` 同一份源文件）。打包时
`electron-builder.yml` 的 `files` 把 `../assets/garden` 里这六个模块直接映射进 `app.asar`，转导模块不进包。
加物种通常不用改打包名单；如果新加了模块文件，桌宠窗口要用的列进那段 `filter`（`check-packaging.mjs`
沿 import 图核对漏项），庭院引擎 `resources/garden-engine.mjs` 的相对依赖则由 `garden-engine-deps.mjs`
按静态 import 图自动算出（不能用动态 `import()`）。

新增角色要跑这些检查（`run-checks.mjs` 也都会跑到）；改了成长、存档或交互，再跑对应的检查：

```text
node desktop/check-pet-catalog.mjs
node desktop/check-pet-dialogue.mjs
node desktop/check-pet-animation.mjs
node desktop/check-pet-player.mjs
node desktop/check-pet-life.mjs
node desktop/check-pet-commands.mjs
node desktop/check-garden-progress.mjs
node desktop/electron/check-pet-policy.mjs
node desktop/electron/check-pet-settings.mjs
node desktop/electron/check-pet-view.mjs
```

脚本代替不了视觉检查：还要看实际帧图、在小屋里切换伙伴、打开独立桌宠。基于已有 IP 的角色
（如 Pingu、Skipper）只能自己绘制，不提取原作美术，并在 `THIRD_PARTY_NOTICES.md` 写明权利归属。

## 第三方素材与许可

| 组件 | 仓库里的位置 | 许可 |
|---|---|---|
| 2048 移动与合并规则（改编） | `desktop/assets/garden/licenses/2048-MIT.txt` | MIT |
| Three.js | `desktop/assets/garden/vendor/three/`（含 `LICENSE.txt`） | MIT |
| Sakura Crossing 三渲二渲染模块（改编） | `desktop/assets/garden/vendor/sakura/`（含 `LICENSE.txt`） | MIT |
| Fusion Pixel 字体 | `desktop/assets/fonts/`（含 `LICENSE-OFL.txt`） | SIL OFL 1.1 |

- vendor 文件的上游版本和 sha256 记在 `desktop/assets/garden/vendor/SOURCE.json`；
  根目录的 `THIRD_PARTY_NOTICES.md` 写来源和改动。
- 安装版把项目 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和上面各许可文件放进 `resources/licenses/`
  （`electron-builder.yml` 的 `extraResources`），便携 ZIP 放在解压目录（`make_release.py`）；
  Electron 与 Chromium 自带的许可留在安装目录。macOS 的 .app 放在 `Contents/Resources/licenses/`：DMG 里只有 .app，
  所以 `mac-electron-licenses.cjs` 在打包时把 Electron 与 Chromium 的许可也复制进同一目录。
- `check_licenses.py` 核对许可源文件存在、两种包的配置都带上了它们、vendor 文件与 `SOURCE.json` 的哈希一致；
  加 `--portable <zip>` 或 `--electron <win-unpacked 目录或 szuDesktop.app>` 还会核对成品里的内容（`.app` 的分支
  每次运行都先用临时假包自测一遍）。
- 新增或改动第三方素材时，同步 `SOURCE.json`、`THIRD_PARTY_NOTICES.md` 和许可文件；新的许可文件还要加进
  `check_licenses.py` 的 `EXPECTED`、`electron-builder.yml` 和 `make_release.py`。
- 庭院玩法参考 Stardew Valley 和动物森友会，但不复制它们的素材或代码；委托规则和文字由本项目编写。

## 实验 VPN 模块

`internal/vpn` 是一套实验性的 EasyConnect 协议客户端，**不在任何发布件里**；默认桌面构建只提供官方 WebVPN 入口。
实验源码保留，只供来源核验和协议研究，不能当作已验收功能宣传。

- **怎么排除的**：`internal/vpn` 只被带 `//go:build campusvpn` 的 `desktop/internal/ui/vpn.go` 引用
  （同标签的 `vpn_test.go` 测它）；不带标签时编译的是 `vpn_disabled.go` 和 `vpn_disabled_test.go`。
  `build-windows.py`、Makefile 的构建目标和 CI 的构建步骤都不传 `-tags campusvpn`，
  所以桌面端和 5 个平台的命令行发布件里都没有这套协议代码。
- **为什么还要编译它**：CI 的 `test` 作业和 `make check-all` 单独跑 `go vet -tags campusvpn ./...` 和
  `go test -tags campusvpn ./desktop/internal/ui/`，保证它不会悄悄坏掉（残留系统代理的善后、断开和 busy 复位都靠
  `vpn_test.go` 守着）。
- **来源未核实（F11）**：`internal/vpn` 早期参考过第三方实验源码，授权至今没有确认。包注释如实写着
  「来源与授权尚未核实」，不作独立编写的保证。F06 / F07 / F08（只凭 SOCKS 监听就报连接的假成功、
  缺全链路超时、跳过证书验证）都没修。[STATUS 1.1 节](docs/STATUS.md#s1-1)把它列为 P0：来源核实和故障闭环完成之前，
  不得进入发布构建，也不要把它当成可用功能或干净来源对外宣传。
- `szunet vpn` 子命令与它无关：只列出校外访问的三条官方通道（WebVPN / EasyConnect / 零信任 SecureLink），
  `--open N` 用默认浏览器打开其中一条，不含协议代码。

## 文档与截图

- **用户文档**：根目录 `README.md`、英文版 `docs/README_en.md`、使用指南 `docs/guide/`，以及便携 ZIP 里的
  `README-快速开始.txt`（由 `desktop/make_release.py` 里的 `README` 模板生成）。它们写给不写代码的同学：
  只把真实验收过的功能写成可用，限制集中写在「已知限制」和各指南页末尾；不写内部编号、PR / CI 链接、
  提交哈希或测试过程，需要佐证时链接 STATUS 的显式锚点。
- **状态和待办只在 STATUS.md**：`docs/guide/` 属于用户文档，和 README 一样随版本更新，不是另一套维护清单；
  指南里不列任务。
- **版本号**：README 里只出现在标题区的下载链接、下载区的「当前版本」一行和更新日志段落。发布成功后（不是发版准备时：
  标签构建成功之前，这些链接指向的附件还不存在）同步中英两版 README 的这三处：标题区的下载链接（Windows 安装版按钮，
  以及 macOS 预览版 Apple 芯片、Intel 两个 DMG 的直链，URL 和文字）、「当前版本」一行（版本、日期、发布页链接、
  Windows 两个安装文件名和两个 DMG 的文件名，以及它们的下载大小，大小照发布页附件的字节数四舍五入）、「更新日志」段。`docs/guide/` 里一律用 `<版本号>` / `<发布标签>` 占位，不写具体版本，发版时不用改。
  另外核对便携 ZIP 的 `README-快速开始.txt` 模板与当前界面一致：它只留十来行（打开方式、第一次该做什么、数据存哪、
  密码怎么存、不代提交、测试版边界），细节链接到使用指南，`make_release.py` 打包前用 `quickstart_problems()` 自检，`check_licenses.py` 在 `run-checks.mjs` 里也调用它。
  使用指南里的下载大小写的是近几个版本的大致数字，变化不大时不用每版改。
- **链接 STATUS**：一律指向标题前的显式锚点 `<a id="sNN"></a>`（如 `docs/STATUS.md#s65`），不要用标题生成的锚点；
  需要新的外部链接时，先在 STATUS 目标标题前补一行锚点（STATUS 开头「标题与链接」的约定）。
  指南页之间、README 到指南页只链到文件，不带 `#片段`。
- **锚点检查**：`python desktop/check_status_doc.py`（`run-checks.mjs` 自动运行）检查 `README.md`、
  `docs/README_en.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md` 和 `docs/guide/*.md`：
  指向 STATUS 的链接必须落在显式锚点上，文件内的 `#锚点` 要能按 GitHub 的标题 slug 规则找到；
  它也拦下 STATUS 标题里「未发布」「源码候选」这类会变的状态。
- **用词**：界面、README 和使用指南都按[界面用词](#界面用词)那张表写；界面还没改名的地方（如托盘菜单），照界面实际显示的字写。
- **截图**：`docs/screenshot-*.png` 用 `SZUNET_CONFIG_DIR` 隔离出的合成存档制作，不能出现真实账号、课表或成绩；
  同一张图不在同一个文件里用两次。

## 范围与非目标

提 PR 前先确认改动在当前范围内（依据 [STATUS 1.1 节](docs/STATUS.md#s1-1)和 [第 50.2 节](docs/STATUS.md#s50-2)）：

- 1.0 先完成 Windows 桌面版（安装版与便携版）。macOS 桌面版（按芯片两个 DMG）从 beta0.9.5 起以预览版随版本发布，
  B1–B9 真机验收仍待做（[STATUS 68.4](docs/STATUS.md#s68-4)）；Linux 仍只发命令行 `szunet`，桌面端是 X06 的剩余部分。
- 暂不部署校内后端、Docker 或服务器发布流程；云同步与好友庭院、内容和素材热更新、自动下载安装更新、
  整机 VPN、图书馆选座、余额与流量都已延期，方案保留在 STATUS 原章节。
- Windows 安装包未签名，macOS 包只有 ad-hoc 签名、未经公证；目前只有手动版本查询（UX21），没有自动更新。
- 学校业务（R01–R07）以真实账号验收为准，本机和 CI 检查不能代替；没验收的不要在文档或界面里写成可用。
  1.0 只等 R01，R02–R07 保留「测试中」随版本发布，之后按试用同学交回的诊断报告逐项关闭（[STATUS 第 69.2 节](docs/STATUS.md#s69-2)）。

## 发布

- 版本号只有一个来源：`internal/version/VERSION`。发版时改这个文件，
  构建脚本、打包脚本、页面顶栏与关于页都会跟着走。
- **发布说明只有一个来源：根目录的 `CHANGELOG.md`。** 升版本号的同时，
  把 `## 未发布` 那一节的标题改成新版本号并补齐内容。说明写给用户看：
  说清「相对上一版有什么变化」和「哪些还没验证」，不要只写内部编号。
  - `python desktop/release_notes.py <版本号>` 可以本地预览将要发出去的正文；
    加 `--release` 就是 CI 打 tag 时的严格检查。
  - 抽不到那一节、正文是空的、或正文里还留着 `__VERSION__`，
    `make_release.py` 会在打包前失败，CI 的 release job 也会在上传附件前失败。
  - 版本号已升、还没发布时，可以在该节写一行 `> 候选版：……` 提醒读者，
    抽取时这一行总会被去掉。打 tag 发布时（`--release`）正文其余部分不能再出现
    「尚未公开发布」「本地候选版」，否则 CI 一开始就失败——不然 Release 第一句就会告诉用户
    「本版尚未发布」。PR 阶段的 `make_release.py` 不受这条限制。
  - 这道关卡是有来历的：beta0.7 发出去时正文只有一行自动生成的 compare 链接。
    早期直接提交到 main、没有 PR，GitHub 的 `generate_release_notes`
    拿不到任何可分类的内容，所以说明必须自己写。
- `.github/workflows/release.yml` 在 PR、推到 main、打 `beta*` / `v*` 标签时都会运行，
  同一分支连推时自动取消旧的运行（标签发布不取消）。它不是一条直链：
  - `test`（ubuntu）与 `test-macos`（macOS 真机：同步资源 + `run-checks.mjs` + `go vet` + `go test ./...` 与 campusvpn
    界面包测试 + 对真实 `security` 命令的 stdin 探针，另有一条只记录、不断言的钥匙串长输入探针）**并行**跑。`test` 同步资源后跑 `run-checks.mjs`、
    `go vet`、`go vet -tags campusvpn` 和 `go test -race`；打标签时它的第一步先核对
    标签等于 `internal/version/VERSION`、CHANGELOG 能按发布模式抽取，对不上几秒内就失败。
  - `test` 通过后，`build-cli`（一台 runner 上 `make cross` 交叉编译 5 个平台，逐个生成 `.sha256`）
    与 `build-desktop-windows` 开始。后者在 Windows 上构建引擎，再跑 `go vet`、`go test`、
    `run-checks.mjs`、整机冒烟和打包——Windows 专属的 Go 测试只有这里会运行。
  - `build-desktop-electron-windows` 等 `build-desktop-windows` 通过后，**直接用它上传的那份引擎**
    打 NSIS 安装包（不重新编译），并核对安装包里的引擎与冒烟通过的字节一致，
    再从最新公开版安装、升级、重开、卸载一遍；其间还按安装版自己登记的开机自启命令（含 `--autostart`）启动一次，
    确认主窗口在冒烟主动打开之前保持隐藏。
  - macOS 这条线与 Windows 并行：`test` 通过后，`build-desktop-macos`（arm64 runner）编两个架构的引擎并 ad-hoc 签名，
    arm64 原生、amd64 经 Rosetta 各跑一遍 `smoke_macos.py`；`build-desktop-electron-macos` **直接用这两份引擎**打两个 DMG，
    核对包里的引擎与冒烟通过的字节一致，再对 arm64 与 x64（Rosetta）各跑一遍 `smoke_dmg.py`。真实 quit Apple Event 那一步
    如被 runner 的系统拒绝（-1743），脚本记为跳过并打印警告。
  - `smoke-desktop-electron-macos-intel`（`macos-15-intel`）在真 Intel 机器上再跑一遍 x64 的两种冒烟：Rosetta 会掩盖只在
    Intel 上出现的问题。这种 runner 排队慢，所以只在推到 main、打标签和手动触发时运行，不卡 PR，PR 的 CI 也就看不到它的结果。
    镜像预计 2027 年 8 月前后下线：届时删掉这个 job，同时从 `release` 的 `needs` 里去掉，并改掉 `check_release_notes.py`
    里要求它在 `needs` 里的核对；之后 x64 包只在 Rosetta 下验证，发布前另在 Intel Mac 上人工抽测一遍。
  - 最后 `release` 等 `[build-cli, build-desktop-windows, build-desktop-electron-windows, test-macos,
    build-desktop-electron-macos, smoke-desktop-electron-macos-intel]` 全绿，下载各 job 的产物（含 `szudesktop-electron-macos`
    里的两个 DMG），核对全部 `.sha256` 后才发。`release` 的 `if` 没写状态函数，GitHub 隐含 `success()`：`needs` 里任何一个
    失败、取消或被跳过都不发布，**macOS 的 job 失败会连带挡住 Windows 版的发布**。整个 workflow 默认只读，只有 `release`
    有写权限；action 都固定在提交 SHA 上，由 Dependabot 提 PR 升级。
- **DMG 从 beta0.9.5 起以预览版随版本发布**（维护者 2026-09-29 决定，[STATUS 68.4](docs/STATUS.md#s68-4)）。B1–B9 真机验收
  （[STATUS 68.2](docs/STATUS.md#s68-2)）还没做完，发布说明、README 和 STATUS 都要如实写明哪些没在真机上验收，并给出反馈方式。
  - `desktop/release_notes.py` 有两个开关。`MAC_SINCE = (0, 9, 5)` 是 DMG 发布开关，也是第一个带 DMG 的版本：这一版及以后的
    下载清单列出两个 DMG 和首次打开的放行步骤，更早的版本不列；打标签时（`--release`）正文提到 `.dmg` 而这一版不发 DMG，
    `release_notes.py` 直接失败。`MAC_PREVIEW` 是预览版开关，值是 STATUS 里记录预览版决定那一节的锚点（现为 `s68-4`）：
    开着时每一版的发布说明都在下载清单后带一段预览版说明；B1–B9 全部标「通过」后改回 `None`。
  - `release.yml` 的对应接线：`release` 的 `needs` 有 `build-desktop-electron-macos` 和 `smoke-desktop-electron-macos-intel`；
    下载 `szudesktop-electron-macos` 到 `dist`；`files` 有两个 DMG 及其 `.sha256`。这两个 job 的 `if` 只能排除 PR 事件，
    不能加 `continue-on-error`（release.yml Intel 冒烟 job 上方的注释也写着）。
  - `check_release_notes.py` 核对开关、`release.yml` 与 STATUS 68.2 / 68.4 一致：开关开着却缺一处接线、两个 macOS job 可能在
    标签上被跳过或带 `continue-on-error`、68.2 还有待验收的项而 `MAC_PREVIEW` 没指向写明「预览版」和起始版本的决定、
    B1–B9 全部通过了 `MAC_PREVIEW` 还开着，检查都会失败。
  - macOS 只发两个 DMG 及其 `.sha256`，裸的 `szudesktop-darwin-*` 引擎只在 job 之间传递。
- **打标签前**：PR 的 CI 全绿还不够。`smoke-desktop-electron-macos-intel` 不在 PR 上运行，发版 PR 合入 main 后，
  先确认有一次 main 推送运行或手动触发运行全部通过、而且这个 job 真正运行并通过（不是被跳过），再在这次运行的同一提交上打标签。
  否则标签构建就是它在这份代码上的第一次运行，它一失败，整次发布连同 Windows 版都发不出去：偶发失败可以重跑失败的 job，
  要改代码就只能删掉标签、在修好的提交上重打。任何 job 失败都先修好或查明是偶发，不要为了发布去掉 `needs` 或加 `continue-on-error`。
- **`test-macos` 会阻断发布**——它在 `release.needs` 里。它曾经带 `continue-on-error`，
  把真实的失败显示成 success，于是 beta0.7.1 / beta0.7.2 带着「macOS 上存不了凭据」
  发了出去（F26）；修好之后那个开关就被摘掉了，原委见 `docs/STATUS.md` 第 39.4 节。
- 改 macOS 凭据写入（`internal/credential`）前先知道这些（F21 / F26）：密码不走命令行参数——`security` 的 `-w`
  放在最后触发提示输入，子进程脱离控制终端，密码经标准输入喂入。真实的 `security -w` 可能要求输两遍（密码 + 确认），
  beta0.7.1 / beta0.7.2 只喂一行，在那种机器上得到 `passwords don't match`（退出码 44）、存不了凭据；
  从 beta0.7.3 起喂「密码 + 确认」两行，只问一遍的机器上多出的那行没人读。写入前先用一次性条目自检、写后读回校验，
  失败时明确报错，不退回把密码放进命令行参数的写法。两个测试替身都如实模拟两次提问。
  这条路一次最多完整写入 128 字节，超出的部分被 `security` 静默截断、退出码仍是 0（macOS 26 实测），所以写入前先检查长度，
  超长或含换行就拒绝，绝不先覆盖旧条目。学校会话因此改为加密写进配置目录的 `session.enc`（0600），钥匙串的
  `szunet-session` 条目只放 64 位十六进制密钥。桌面引擎在设置了 `SZUNET_CONFIG_DIR` 时服务名带
  `-test-<配置目录哈希>`（`internal/credential/keychain_namespace.go`），测试与冒烟不碰真实条目；命令行版 `szunet`
  不开这个开关，已发布用户的服务名不变。
  **仍未完成**：真机上先 `szunet config set`、再 `szunet config show` 或 `szunet login` 的完整保存再读取没有验证
  （[STATUS 1.1 节](docs/STATUS.md#s1-1)的 F21，步骤见 [69.4 清单](docs/STATUS.md#s69-4)；szunet 没有 `config get` 子命令），
  CI 探针只覆盖 `security` 本身的行为，文档里不要写成「已在真机验证」。
- **不要在未发布的改动上跑 `python desktop/make_release.py`**：它会覆盖
  与 GitHub Release 对应的本地包，导致线上附件没法再和本地产物逐字节核对。
- 发布后要核对附件：`sha256sum -c *.sha256`（每个附件都有同名校验文件）、ZIP 内 exe 与独立 exe
  是否逐字节一致、程序自报版本和 exe 属性里的版本是否等于 VERSION 文件、
  **Release 正文是否真的是你写的那一节**。核对结果写进 STATUS.md。
- 发布后把安装升级验收的基线挪到刚发布的版本：改 `desktop/electron/smoke_installer.py` 里的
  `BASELINE_VERSION`、`BASELINE_SHA256`（发布页和同名 `.sha256` 附件上都有）、
  `BASELINE_ELECTRON` 与 `BASELINE_COMPANIONS`。现有用户是从最新公开版升级上来的，
  验收也要从它开始；CI 下载哪个附件由这里决定，workflow 里不再另写一份。这一步就是原来的 R09
  （跨版本升级与数据恢复），2026-09-29 起它是发版流程的固定一步，不再单列为开放任务（[STATUS 第 69.2 节](docs/STATUS.md#s69-2)）。
  CI 先按 `BASELINE_SHA256` 从 `actions/cache` 取基线安装包，缓存没有或哈希不对时才从发布页下载一次、核对后存进缓存，
  免得每次运行都把发布页的下载数抬高；挪了基线，缓存键跟着变，不用手动清缓存。`check_release_notes.py` 核对这几步的先后顺序。
- **分支保护**：`main` 的必需检查要从只有 `test` 扩展到每个 PR 都会跑的 job：`test`、`test-macos`、`build-cli`、
  `build-desktop-windows`、`build-desktop-electron-windows`、`build-desktop-macos`、`build-desktop-electron-macos`
  （2026-09-29 定下，由维护者在仓库设置里改，进度见 [STATUS 1.1 节](docs/STATUS.md#s1-1)）。以后新增在 PR 上运行的 job，
  也同步加进必需检查。`smoke-desktop-electron-macos-intel` 和 `release` 不在 PR 上运行，不设为必需。
  协作者都是管理员，没开 enforce_admins 时管理员仍能绕过，要不要开由负责人决定。
- **1.0 门槛**（维护者 2026-09-29 决定）：R01、R10 和首轮试用达到基本标准；R02–R07 带「测试中」随 1.0 发布，
  R10 的完成标准含「附本次候选包的资源基线」。细节见 [STATUS 第 69.2 节](docs/STATUS.md#s69-2)。

## 验收与设计记录

开发时常查的 STATUS 章节（都有显式锚点，可以直接链接）：

| 章节 | 内容 |
|---|---|
| [1.1](docs/STATUS.md#s1-1) | 当前未完成事项：唯一维护的待办表 |
| [50.2](docs/STATUS.md#s50-2) | 1.0 剩余任务与学校业务验收（R01–R07） |
| [54](docs/STATUS.md#s54) | 面向真实用户的产品审查、UX01–UX26 和定向试用计划（5 人首轮观察、约 10–20 人七日试用） |
| [55](docs/STATUS.md#s55)、[56](docs/STATUS.md#s56) | 产品体验实施与候选版准备；宠物阵容与扩展接口 |
| [57.4](docs/STATUS.md#s57-4)、[59.3](docs/STATUS.md#s59-3) | 伙伴扩展契约（以 59.3 为准，见[扩展伙伴](#扩展伙伴)） |
| [65](docs/STATUS.md#s65)、[65.2](docs/STATUS.md#s65-2) | 全应用界面与状态一致性，及其验收与交付 |
| [66](docs/STATUS.md#s66)、[66.1](docs/STATUS.md#s66-1)、[66.2](docs/STATUS.md#s66-2)、[66.3](docs/STATUS.md#s66-3) | 代码审查与全面修复：主要修复、验收、未在本机验证的部分 |
| [67](docs/STATUS.md#s67) | 第二轮发布审查：性质测试、修复与发布附件 |
| [68](docs/STATUS.md#s68)、[68.2](docs/STATUS.md#s68-2) | macOS 桌面版：实现取舍、自动验收覆盖与 B1–B9 真机验收清单 |
| [69](docs/STATUS.md#s69)、[69.4](docs/STATUS.md#s69-4)、[69.5](docs/STATUS.md#s69-5) | 优化评估落地、1.0 门槛、1.1 整理依据、R01 教学区验收清单与试用自查清单 |

Electron 外壳加 Go sidecar 的由来见[迁移设计](docs/superpowers/specs/2026-09-24-electron-migration-design.md)和
[阶段 0–1 实施计划](docs/superpowers/plans/2026-09-24-electron-phase-0-1-shell.md)。它们是历史设计记录：
其中的 agent 事件（`POST /api/pet/event`、SSE 推送）和 Linux 安装包都没有实现，macOS 安装包的实际做法见 STATUS 第 68 节，以代码和 STATUS 为准。

安全问题的报告方式见 [SECURITY.md](SECURITY.md)，**不要**开公开 issue 写可利用细节。
