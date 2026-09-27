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

Windows 上构建桌面版需要本机有 Edge 或 Chrome（冒烟测试会起真实浏览器窗口）。

## 界面资源的规矩

- **唯一源文件**：`desktop/index.html` 与 `desktop/assets/garden/`。
- `desktop/assets/index.html` 和 `desktop/internal/ui/assets/` 是 `python desktop/sync-assets.py`
  生成的副本，已被 gitignore，**不要手改**。
- 改完界面先跑 `sync-assets.py`，再跑检查脚本，否则检查读到的是旧副本。
- 页面源码里不允许写死版本号：顶栏与关于页从 `/api/status` 的 `app_version` 取，
  `check-ui.mjs` 和 `smoke_windows.py` 各有回归守着。

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

本地用 curl 调试 `/api/*` 时要带 `X-SZU-Token` 头，值取自引擎标准输出里的 `szuDesktop 会话: <值>` 一行，或配置目录中 `desktop-instance.json` 的 `token` 字段；`/api/health` 不需要。

改了桌面端还要在 Windows 上跑：

```text
python desktop/build-windows.py      # 构建（含图标与版本信息）
python desktop/smoke_windows.py      # 整机冒烟
```

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
5. **来源没核实就不要宣称独立实现。** 代码和素材先核实来源与许可（见 F11）。
6. **测试只终止自己启动的进程**，不调整用户现有的系统代理。
7. **文档只改 STATUS.md 这一套**，历史资料冻结，不再同步多套清单。

## 修 bug 的方式

先写一个能**复现这个 bug 的失败测试**，亲眼看它红，再改代码让它变绿。
这个仓库里已有的例子：

- `cmd/szunet/status_query_test.go` — F22：CLI 没账号时跳过在线查询
- `desktop/internal/ui/booking_test.go` — F23：预约写端点必须不存在（断言 404）
- `internal/credential/store_unavailable_test.go` — F24：没有密钥环时拒绝把密码写成明文

新发现的问题请按 STATUS.md 的编号体系追加一行（功能/安全/工程用 `F`，
排版与交互用 `U`），写清重要程度（P0–P3）、难度（S/M/L）、状态和验收标准。
「已完成」必须附验收证据；没验证过的就写「未验证」，不要含糊过去。

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
- **不要在未发布的改动上跑 `python desktop/make_release.py`**：它会覆盖
  与 GitHub Release 对应的本地包，导致线上附件没法再和本地产物逐字节核对。
- 发布后要核对附件：`sha256sum -c *.sha256`（每个附件都有同名校验文件）、ZIP 内 exe 与独立 exe
  是否逐字节一致、程序自报版本和 exe 属性里的版本是否等于 VERSION 文件、
  **Release 正文是否真的是你写的那一节**。核对结果写进 STATUS.md。
- 发布后把安装升级验收的基线挪到刚发布的版本：改 `desktop/electron/smoke_installer.py` 里的
  `BASELINE_VERSION`、`BASELINE_SHA256`（发布页和同名 `.sha256` 附件上都有）、
  `BASELINE_ELECTRON` 与 `BASELINE_COMPANIONS`。现有用户是从最新公开版升级上来的，
  验收也要从它开始；CI 下载哪个附件由这里决定，workflow 里不再另写一份。

安全问题的报告方式见 [SECURITY.md](SECURITY.md)，**不要**开公开 issue 写可利用细节。
