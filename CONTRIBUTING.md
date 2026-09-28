# 参与贡献

欢迎提 issue 和 PR。这个项目处理校园网密码和学校业务系统的登录 Cookie，
所以有几条硬规矩，动手前请先看完。

**唯一事实源是 [docs/STATUS.md](docs/STATUS.md)**：所有问题编号（F/U/D/X/Q/R 系列）、
功能范围、验收记录和发布历史都在那里。本文只讲「怎么改代码、怎么验证」，
不重复维护另一套任务清单。

## 环境

| 依赖 | 用途 |
|---|---|
| Go | 版本见 `go.mod`，编译 CLI 与桌面服务 |
| Python 3 | 构建、冒烟、打包脚本 |
| Node.js | 前端与 Electron 回归检查脚本（`desktop/check-*.mjs`、`desktop/electron/check-*.mjs`） |

`build-windows.py` 用 `GOOS=windows` 交叉编译，图标和版本信息由纯 Python 的 `add_resource.py` 写入，
不依赖 Windows 专属工具（CI 只在 Windows runner 上跑它）；需要 Edge 或 Chrome 的是整机冒烟
`smoke_windows.py`，它只能在 Windows 上运行（冒烟会起真实浏览器窗口）。macOS / Linux 上，本文命令里的 `python` 通常要写成 `python3`。

**本地试用界面**：在 Windows 上跑完 `python desktop/build-windows.py` 后，直接运行
`dist/szudesktop-windows-amd64.exe`（就是便携版里的 `szudesktop.exe`，用本机 Edge / Chrome 开窗）。
桌面服务入口是 `desktop/cmd/szudesktop`；在 macOS / Linux 上 `go run ./desktop/cmd/szudesktop`
没有验证过，这两个平台的桌面端也不在发布范围内（见[范围与非目标](#范围与非目标)）。

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
`desktop/check_*.py` 目前有四个：发布说明抽取（`check_release_notes.py`）、许可文件与第三方哈希
（`check_licenses.py`）、Windows 版本资源（`check_version_resource.py`）和文档锚点
（`check_status_doc.py`，见[文档与截图](#文档与截图)）。有任何一项失败，`run-checks.mjs` 汇总后以非零码退出；
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

新发现的问题请按 STATUS.md 的编号体系追加一行（功能/安全/工程用 `F`，
排版与交互用 `U`），写清重要程度（P0–P3）、难度（S/M/L）、状态和验收标准。
「已完成」必须附验收证据；没验证过的就写「未验证」，不要含糊过去。

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
  Electron 与 Chromium 自带的许可留在安装目录。
- `check_licenses.py` 核对许可源文件存在、两种包的配置都带上了它们、vendor 文件与 `SOURCE.json` 的哈希一致；
  加 `--portable <zip>` 或 `--electron <win-unpacked 目录>` 还会核对成品里的内容。
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
- **版本号**：README 里只出现在下载按钮、下载区的「当前版本」一行和更新日志段落。发版时同步中英两版 README
  的这三处：标题区下载按钮（URL 和文字）、「当前版本」一行（版本、日期、发布页链接和两个安装文件名）、
  「更新日志」段。`docs/guide/` 里一律用 `<版本号>` / `<发布标签>` 占位，不写具体版本，发版时不用改。
  另外核对便携 ZIP 的 `README-快速开始.txt` 模板与当前界面一致。
- **链接 STATUS**：一律指向标题前的显式锚点 `<a id="sNN"></a>`（如 `docs/STATUS.md#s65`），不要用标题生成的锚点；
  需要新的外部链接时，先在 STATUS 目标标题前补一行锚点（STATUS 开头「标题与链接」的约定）。
  指南页之间、README 到指南页只链到文件，不带 `#片段`。
- **锚点检查**：`python desktop/check_status_doc.py`（`run-checks.mjs` 自动运行）检查 `README.md`、
  `docs/README_en.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md` 和 `docs/guide/*.md`：
  指向 STATUS 的链接必须落在显式锚点上，文件内的 `#锚点` 要能按 GitHub 的标题 slug 规则找到；
  它也拦下 STATUS 标题里「未发布」「源码候选」这类会变的状态。
- **截图**：`docs/screenshot-*.png` 用 `SZUNET_CONFIG_DIR` 隔离出的合成存档制作，不能出现真实账号、课表或成绩；
  同一张图不在同一个文件里用两次。

## 范围与非目标

提 PR 前先确认改动在当前范围内（依据 [STATUS 1.1 节](docs/STATUS.md#s1-1)和 [第 50.2 节](docs/STATUS.md#s50-2)）：

- 1.0 先完成 Windows 桌面版（安装版与便携版）。macOS / Linux 只发命令行 `szunet`，
  桌面端在路线图里是 X06「待做」、P3。
- 暂不部署校内后端、Docker 或服务器发布流程；云同步与好友庭院、内容和素材热更新、自动下载安装更新、
  整机 VPN、图书馆选座、余额与流量都已延期，方案保留在 STATUS 原章节。
- 安装包未签名；目前只有手动版本查询（UX21），没有自动更新。
- 学校业务（R01–R07）以真实账号验收为准，本机和 CI 检查不能代替；没验收的不要在文档或界面里写成可用。

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
  - `test`（ubuntu）与 `test-macos`（macOS 真机：同步资源 + `go vet` + `internal/credential` 测试 +
    对真实 `security` 命令的 stdin 探针）**并行**跑。`test` 同步资源后跑 `run-checks.mjs`、
    `go vet`、`go vet -tags campusvpn` 和 `go test -race`；打标签时它的第一步先核对
    标签等于 `internal/version/VERSION`、CHANGELOG 能按发布模式抽取，对不上几秒内就失败。
  - `test` 通过后，`build-cli`（一台 runner 上 `make cross` 交叉编译 5 个平台，逐个生成 `.sha256`）
    与 `build-desktop-windows` 开始。后者在 Windows 上构建引擎，再跑 `go vet`、`go test`、
    `run-checks.mjs`、整机冒烟和打包——Windows 专属的 Go 测试只有这里会运行。
  - `build-desktop-electron-windows` 等 `build-desktop-windows` 通过后，**直接用它上传的那份引擎**
    打 NSIS 安装包（不重新编译），并核对安装包里的引擎与冒烟通过的字节一致，
    再从最新公开版安装、升级、重开、卸载一遍。
  - 最后 `release` 等 `[build-cli, build-desktop-windows, build-desktop-electron-windows, test-macos]`
    全绿，核对全部 `.sha256` 后才发。整个 workflow 默认只读，只有 `release` 有写权限；
    action 都固定在提交 SHA 上，由 Dependabot 提 PR 升级。
- **`test-macos` 会阻断发布**——它在 `release.needs` 里。它曾经带 `continue-on-error`，
  把真实的失败显示成 success，于是 beta0.7.1 / beta0.7.2 带着「macOS 上存不了凭据」
  发了出去（F26）；修好之后那个开关就被摘掉了，原委见 `docs/STATUS.md` 第 39.4 节。
- 改 macOS 凭据写入（`internal/credential`）前先知道这些（F21 / F26）：密码不走命令行参数——`security` 的 `-w`
  放在最后触发提示输入，子进程脱离控制终端，密码经标准输入喂入。真实的 `security -w` 可能要求输两遍（密码 + 确认），
  beta0.7.1 / beta0.7.2 只喂一行，在那种机器上得到 `passwords don't match`（退出码 44）、存不了凭据；
  从 beta0.7.3 起喂「密码 + 确认」两行，只问一遍的机器上多出的那行没人读。写入前先用一次性条目自检、写后读回校验，
  失败时明确报错，不退回把密码放进命令行参数的写法。两个测试替身都如实模拟两次提问。
  **仍未完成**：真机上先 `szunet config set`、再 `szunet config show` 或 `szunet login` 的完整保存再读取没有验证
  （[STATUS 1.1 节](docs/STATUS.md#s1-1)的 F21；那里写的 `config get` 实际对应 `config show`，szunet 没有 `get` 子命令），
  CI 探针只覆盖 `security` 本身的行为，文档里不要写成「已在真机验证」。
- **不要在未发布的改动上跑 `python desktop/make_release.py`**：它会覆盖
  与 GitHub Release 对应的本地包，导致线上附件没法再和本地产物逐字节核对。
- 发布后要核对附件：`sha256sum -c *.sha256`（每个附件都有同名校验文件）、ZIP 内 exe 与独立 exe
  是否逐字节一致、程序自报版本和 exe 属性里的版本是否等于 VERSION 文件、
  **Release 正文是否真的是你写的那一节**。核对结果写进 STATUS.md。
- 发布后把安装升级验收的基线挪到刚发布的版本：改 `desktop/electron/smoke_installer.py` 里的
  `BASELINE_VERSION`、`BASELINE_SHA256`（发布页和同名 `.sha256` 附件上都有）、
  `BASELINE_ELECTRON` 与 `BASELINE_COMPANIONS`。现有用户是从最新公开版升级上来的，
  验收也要从它开始；CI 下载哪个附件由这里决定，workflow 里不再另写一份。

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

Electron 外壳加 Go sidecar 的由来见[迁移设计](docs/superpowers/specs/2026-09-24-electron-migration-design.md)和
[阶段 0–1 实施计划](docs/superpowers/plans/2026-09-24-electron-phase-0-1-shell.md)。它们是历史设计记录：
其中的 agent 事件（`POST /api/pet/event`、SSE 推送）和 macOS / Linux 安装包都没有实现，以代码和 STATUS 为准。

安全问题的报告方式见 [SECURITY.md](SECURITY.md)，**不要**开公开 issue 写可利用细节。
