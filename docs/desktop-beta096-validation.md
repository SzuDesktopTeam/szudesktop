# beta0.9.6 交付验证记录

## 本机验证

2026-10-02，Windows x64，独立 checkout，Electron 44.4.5，版本 beta0.9.6。

- `node desktop/run-checks.mjs`：模块链接、55 项 JavaScript、5 项 Python 检查全部通过。
- `go test ./...` 与 `go vet ./...`：通过。
- `python desktop/build-windows.py`：原生 Go 引擎构建成功；`python desktop/smoke_windows.py`：全部通过，包括独立配置、进程退出、令牌失效和重启后存档保留。
- `node desktop/electron/build.mjs --skip-sidecar`：生成 Windows Electron 包与 NSIS 安装包。
- 启动 `release/win-unpacked/szuDesktop.exe`，设置独立 `SZUNET_CONFIG_DIR` 与 `SZU_SMOKE_REPORT`：原生冒烟报告为 `version=beta0.9.6`、`packageVersion=0.9.6`、`rendered=true`、`pet.notebookReload=true`。同时通过托盘、伙伴窗口、菜单、拖动、伙伴选择和备份恢复检查。

原始日志和截图保存在本轮工作区 `native-electron-evidence/`、`checks-final2.log`、`native-smoke.log` 和 `electron-build-final.log`。本机冒烟运行的是构建出的 Electron 应用目录，未执行 NSIS 系统安装，因此不是本机安装/升级验收。安装/升级/卸载和 macOS DMG 检查由仓库 CI 在专用 runner 上执行，以 PR 和 tag Actions 日志为准。

## 发布与验收边界

beta0.9.6 是预发布。此前 45 分钟测试为浏览器测试版证据。真实校园账号登录、校园网认证、睡眠恢复、多屏日常使用与长时间真实用户验收尚未完成；生产代码签名和 macOS 公证尚未完成。自动化隔离冒烟不替代这些项目，不能据此宣称正式产品完整验收。
