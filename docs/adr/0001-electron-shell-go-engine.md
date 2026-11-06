# ADR 0001：Electron 只做窗口，业务与页面都由 Go 引擎提供

- 状态：已接受（2026-09 起实施，2026-11-06 追溯整理）
- 相关：`desktop/cmd/szudesktop/main.go`、`desktop/internal/ui/server.go`、`desktop/electron/sidecar.mjs`、`desktop/electron/listen-url.mjs`、`desktop/sync-assets.py`

## 背景

同一个产品要支持三种用法：命令行 `szunet`、双击 Go 程序自动开浏览器、以及带托盘和多窗口的 Electron 桌面应用。三者需要完全一致的校园网认证、网络诊断、学校业务查询和本机数据层。

## 备选方案

| 方案 | 好处 | 为什么不选 |
|---|---|---|
| Electron 里用 Node 重写全部业务 | 单进程、调试直观 | 认证协议、加密流程、判区与诊断那套 Go 内核要重写一遍；`szunet` 命令行没法共用；两份逻辑迟早不一致 |
| Go 只做 HTTP API，前端由 Electron 打包并直连学校系统 | 前端热更新方便 | 浏览器直连学校域名会被同源策略与登录态挡住，且要把学校 Cookie 暴露给渲染进程 |
| **Electron 做壳，Go 引擎同时提供页面和 API** | 一份内核三种用法；页面与接口同源，凭据不出主进程 | 见下节代价 |

## 决定

Go 引擎是唯一的业务进程。`server.go` 用 `go:embed all:assets` 把整个前端编进二进制，静态页面和 69 条 `/api` 由同一个回环服务提供；`desktop/assets` 由 `sync-assets.py` 同步到 `desktop/internal/ui/assets`（这是 gitignored 的生成物，不是两份手工维护的源码）。

`desktop/cmd/szudesktop/main.go` 是三用入口：带 `--no-open` 时作为 sidecar 被拉起，不带时自己开浏览器；`cmd/szunet` 复用 `internal/` 下的同一套认证内核。Electron 侧 `main.mjs` 只组装窗口、托盘、宠物窗和退出协调，`sidecar.mjs` 负责拉起引擎，`listen-url.mjs` 从引擎 stdout 解析出地址和会话凭据。

## 代价与边界

- 改前端等于重新编 Go，没有前端热更新；网页不在 `app.asar` 里，排查时容易找错地方。
- 双进程把启动和退出养得很胖：握手、单实例锁、引擎健康监控、宠物窗与托盘各有一套模块。项目配了 40 多个静态检查和 90 项整机冒烟来兜底，这不是「测试写得多」，是这种架构的必要成本。
- 便携版不捆绑 Chromium，用系统浏览器，所以 Electron 相关行为只在安装版存在。

## 怎么验证

`go build ./...` 与 `go vet ./...`；`desktop/smoke_windows.py` 检查成品二进制；`desktop/check_licenses.py` 保证随包资源与源码一致；用真实二进制直接打 HTTP 验证静态页与 `/api` 都从同一端口出来。
