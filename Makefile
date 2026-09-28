BINARY  := szunet
DIST    := dist
LDFLAGS := -s -w
# 能直接跑的 python 优先（Windows 的 Git Bash、多数开发机），否则用 python3（只装了 python3 的 Linux/macOS）。
# 这句探测和下面的 PYTHON=… 前缀都要求 make 用 sh 执行命令；Windows 上请在 Git Bash 里跑 make。
PYTHON  ?= $(shell python -c "" >/dev/null 2>&1 && echo python || echo python3)

.PHONY: all build test vet cross clean check check-all desktop-mac desktop-mac-dev

all: check build

## 编译当前平台的程序
build:
	go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY) ./cmd/szunet

## 跑测试和静态检查（只有 Go）
check: vet test

## 提交前的全部检查，与 CI 的 test job 同一套步骤：同步桌面资源 → 全部前端 / Electron / 发布脚本回归
## → go mod tidy -diff → go vet（含 -tags campusvpn）→ go test（含 campusvpn 的桌面服务测试）。
## 只差 -race：它要 cgo，本机没有 C 编译器时跑不了，交给 CI。
check-all:
	$(PYTHON) desktop/sync-assets.py
	PYTHON=$(PYTHON) node desktop/run-checks.mjs
	go mod tidy -diff
	go vet ./...
	go vet -tags campusvpn ./...
	go test ./...
	go test -tags campusvpn ./desktop/internal/ui/

test:
	go test ./...

vet:
	go vet ./...

## 一次性交叉编译出三端产物，命名带平台和架构（CI 的 build-cli 也用它）
cross: clean
	mkdir -p $(DIST)
	GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY)-linux-amd64        ./cmd/szunet
	GOOS=linux   GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY)-linux-arm64        ./cmd/szunet
	GOOS=darwin  GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY)-darwin-amd64       ./cmd/szunet
	GOOS=darwin  GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY)-darwin-arm64       ./cmd/szunet
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(DIST)/$(BINARY)-windows-amd64.exe  ./cmd/szunet

## macOS 桌面版 DMG：编两个架构的引擎并 ad-hoc 签名，再按芯片各打一个 DMG，产物在 desktop/electron/release/。
## 需要 macOS 和 Xcode Command Line Tools（codesign、lipo、vtool、hdiutil），首次先在 desktop/electron 里执行 npm ci。
## 第一步已经编好引擎，打包时加 --skip-sidecar，不再重编一遍。
desktop-mac:
	$(PYTHON) desktop/build-macos.py && cd desktop/electron && node build-mac.mjs --skip-sidecar

## macOS 开发模式引擎：只编本机架构，复制成 dist/szudesktop；之后在 desktop/electron 里 npm start。
## 同样需要 macOS 和 Xcode Command Line Tools，首次先在 desktop/electron 里执行 npm ci。
desktop-mac-dev:
	$(PYTHON) desktop/build-macos.py --dev

clean:
	rm -rf $(DIST)
