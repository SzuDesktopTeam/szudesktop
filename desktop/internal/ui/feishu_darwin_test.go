//go:build darwin

package ui

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// useLaunchdPath 模拟从 Finder 打开：PATH 只剩系统目录，HOME 换成临时目录；
// Homebrew 等固定目录换成测试给的目录，本机真装的 lark-cli 不会混进来。
func useLaunchdPath(t *testing.T, systemDirs ...string) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("PATH", "/usr/bin:/bin")
	t.Setenv("HOME", home)
	old := feishuSystemDirs
	t.Cleanup(func() { feishuSystemDirs = old })
	feishuSystemDirs = systemDirs
	return home
}

// npmGlobalCLI 按 npm 全局安装的布局造一份 CLI：<prefix>/bin/lark-cli 链到包里的
// scripts/run.js，原生程序在 <prefix>/lib/node_modules/@larksuite/cli/bin/lark-cli。
func npmGlobalCLI(t *testing.T, prefix string, mode os.FileMode, link bool) string {
	t.Helper()
	pkg := filepath.Join(prefix, "lib", "node_modules", "@larksuite", "cli")
	native := filepath.Join(pkg, "bin", "lark-cli")
	for _, dir := range []string{filepath.Join(prefix, "bin"), filepath.Dir(native), filepath.Join(pkg, "scripts")} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(pkg, "scripts", "run.js"), []byte("#!/usr/bin/env node\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(native, []byte("#!/bin/sh\nprintf '%s' \"$PATH\"\n"), mode); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(native, mode); err != nil {
		t.Fatal(err)
	}
	if !link {
		return native
	}
	if err := os.Symlink("../lib/node_modules/@larksuite/cli/scripts/run.js", filepath.Join(prefix, "bin", "lark-cli")); err != nil {
		t.Fatal(err)
	}
	// 经 run.js 解析出的路径是真实路径（macOS 的临时目录在 /private/var 下）。
	real, err := filepath.EvalSymlinks(native)
	if err != nil {
		t.Fatal(err)
	}
	return real
}

// 同时装着多个 nvm 版本时取最新的（按版本号，不按字典序）；没有可执行位的跳过。
func TestFeishuDarwinFindsNewestNvmNode(t *testing.T) {
	home := useLaunchdPath(t, filepath.Join(t.TempDir(), "missing"))
	nvm := filepath.Join(home, ".nvm", "versions", "node")
	v9 := npmGlobalCLI(t, filepath.Join(nvm, "v9.11.2"), 0o755, true)
	v22 := npmGlobalCLI(t, filepath.Join(nvm, "v22.3.0"), 0o755, true)
	v24 := npmGlobalCLI(t, filepath.Join(nvm, "v24.1.0"), 0o755, true)
	if err := os.MkdirAll(filepath.Join(nvm, "system"), 0o700); err != nil {
		t.Fatal(err)
	}
	if got := findFeishuCLI(); got != v24 {
		t.Fatalf("应找到最新的 v24，实际 %q", got)
	}
	if err := os.Chmod(v24, 0o644); err != nil {
		t.Fatal(err)
	}
	if got := findFeishuCLI(); got != v22 {
		t.Fatalf("v24 没有可执行位应跳过、改用 v22，实际 %q", got)
	}
	if err := os.Remove(v22); err != nil {
		t.Fatal(err)
	}
	if got := findFeishuCLI(); got != v9 {
		t.Fatalf("v22 残缺时应回到 v9，实际 %q", got)
	}
}

// Homebrew 前缀：bin/lark-cli 链到 run.js 时取原生程序；bin 里没有入口、只剩
// lib/node_modules 里的原生程序时也要找得到。系统目录排在用户目录之前。
func TestFeishuDarwinFindsHomebrewPrefix(t *testing.T) {
	root := t.TempDir()
	linked, bare := filepath.Join(root, "brew"), filepath.Join(root, "ports")
	home := useLaunchdPath(t, filepath.Join(linked, "bin"), filepath.Join(bare, "bin"))
	npmGlobalCLI(t, filepath.Join(home, ".nvm", "versions", "node", "v24.1.0"), 0o755, true)
	want := npmGlobalCLI(t, linked, 0o755, true)
	if got := findFeishuCLI(); got != want {
		t.Fatalf("应经 run.js 解析到 Homebrew 前缀下的原生程序，实际 %q", got)
	}
	if err := os.RemoveAll(linked); err != nil {
		t.Fatal(err)
	}
	want = npmGlobalCLI(t, bare, 0o755, false)
	if got := findFeishuCLI(); got != want {
		t.Fatalf("应找到 <dir>/../lib/node_modules 下的原生程序，实际 %q", got)
	}
	if err := os.Chmod(want, 0o600); err != nil {
		t.Fatal(err)
	}
	if got := findFeishuCLI(); !strings.Contains(got, filepath.Join(".nvm", "versions", "node", "v24.1.0")) {
		t.Fatalf("系统目录的程序没有可执行位时应落到 nvm，实际 %q", got)
	}
}

// 兜底找到的 CLI 运行时，PATH 以它所在的目录开头；经 PATH 找到的不改环境。
func TestFeishuDarwinPrependsFoundDirToPath(t *testing.T) {
	brew := filepath.Join(t.TempDir(), "brew")
	useLaunchdPath(t, filepath.Join(brew, "bin"))
	native := npmGlobalCLI(t, brew, 0o755, true)
	dir := filepath.Join(brew, "bin")

	cmd := exec.Command(native)
	cmd.Env = append(os.Environ(), "PATH=/stale", "LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1")
	prepareFeishuEnv(cmd)
	var paths []string
	for _, kv := range cmd.Env {
		if v, ok := strings.CutPrefix(kv, "PATH="); ok {
			paths = append(paths, v)
		}
	}
	if len(paths) != 1 || !strings.HasPrefix(paths[0], dir+":") || !strings.HasSuffix(paths[0], ":/stale") {
		t.Fatalf("PATH 应只有一项、以 %s 开头并保留原值：%q", dir, paths)
	}

	// 真实跑一遍 runFeishuCLI：替身 CLI 把自己看到的 PATH 原样打印出来。
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := runFeishuCLI(ctx, "auth", "status")
	if err != nil || !strings.HasPrefix(string(out), dir+":/usr/bin:/bin") {
		t.Fatalf("CLI 看到的 PATH 应以 %s 开头：%q %v", dir, out, err)
	}

	// 目录已经在 PATH 里（从终端启动）时不重复添加。
	t.Setenv("PATH", dir+":/usr/bin:/bin")
	cmd = exec.Command(native)
	cmd.Env = os.Environ()
	before := strings.Join(cmd.Env, "\n")
	prepareFeishuEnv(cmd)
	if strings.Join(cmd.Env, "\n") != before {
		t.Fatal("PATH 已包含该目录时不应改动环境")
	}
	// 不是兜底找到的程序（例如别处的同名文件）也不改环境。
	cmd = exec.Command(filepath.Join(t.TempDir(), "lark-cli"))
	cmd.Env = []string{"PATH=/usr/bin"}
	prepareFeishuEnv(cmd)
	if len(cmd.Env) != 1 || cmd.Env[0] != "PATH=/usr/bin" {
		t.Fatalf("非兜底路径不应改环境：%q", cmd.Env)
	}
}

func TestFeishuDarwinNodeVersionOrder(t *testing.T) {
	for _, row := range []struct {
		a, b string
		want int
	}{
		{"v24.1.0", "v22.30.0", 1},
		{"v9.11.2", "v22.3.0", -1},
		{"v22.3.0", "v22.3.0", 0},
		{"v22.3.1", "v22.3.0", 1},
		{"v22.3.0", "system", 1},
		{"system", "v1.0.0", -1},
	} {
		if got := compareNodeVersion(row.a, row.b); got != row.want {
			t.Fatalf("compare(%s,%s)=%d，应为 %d", row.a, row.b, got, row.want)
		}
	}
}
