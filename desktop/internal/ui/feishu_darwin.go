//go:build darwin

package ui

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

func hideFeishuCommand(cmd *exec.Cmd) {}

// feishuSystemDirs 是 Homebrew（Apple 芯片、Intel）与 MacPorts 的可执行目录。
// 留成变量只为让测试换成临时目录：本机真装着 lark-cli 时，测试不能被它干扰。
var feishuSystemDirs = []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"}

// 从 Finder、Dock 或登录项打开时，进程的 PATH 只有 launchd 默认的
// /usr/bin:/bin:/usr/sbin:/sbin，用户在终端里装的 lark-cli 一个都看不见。
// 这里按常见的安装方式挨个找固定目录，只在 PATH 里的查找全部落空之后才用。
func platformFeishuCLI(name string) string {
	p, _ := darwinFeishuSearch(name)
	return p
}

// prepareFeishuEnv 把兜底找到 CLI 的那个目录放到子进程 PATH 的最前面：
// npm 装的 lark-cli 还会再调 node 等同目录的工具，launchd 的 PATH 里同样没有。
// 经 PATH 找到的（终端里启动的情况）不改环境。
func prepareFeishuEnv(cmd *exec.Cmd) {
	p, dir := darwinFeishuSearch(filepath.Base(cmd.Path))
	if p == "" || p != cmd.Path {
		return
	}
	path, found := "", false
	env := make([]string, 0, len(cmd.Env)+1)
	for _, kv := range cmd.Env {
		if v, ok := strings.CutPrefix(kv, "PATH="); ok {
			// 与 os/exec 一致，重复的 PATH 以最后一个为准。
			path, found = v, true
			continue
		}
		env = append(env, kv)
	}
	if !found || path == "" {
		path = "/usr/bin:/bin:/usr/sbin:/sbin"
	}
	if slices.Contains(filepath.SplitList(path), dir) {
		return
	}
	cmd.Env = append(env, "PATH="+dir+string(os.PathListSeparator)+path)
}

// darwinFeishuSearch 返回第一个可用的 CLI 路径，以及它是在哪个目录下找到的。
func darwinFeishuSearch(name string) (string, string) {
	for _, dir := range feishuSearchDirs() {
		for _, p := range []string{
			filepath.Join(dir, name),
			filepath.Join(dir, "..", "lib", "node_modules", "@larksuite", "cli", "bin", name),
		} {
			if p = resolveFeishuRunJS(p, name); isExecutableFile(p) {
				return p, dir
			}
		}
	}
	return "", ""
}

func feishuSearchDirs() []string {
	dirs := slices.Clone(feishuSystemDirs)
	home, err := os.UserHomeDir()
	if err != nil || !filepath.IsAbs(home) {
		return dirs
	}
	for _, rel := range []string{".local/bin", ".npm-global/bin", ".volta/bin", "Library/pnpm", ".bun/bin"} {
		dirs = append(dirs, filepath.Join(home, rel))
	}
	// nvm 可能装着好几个 Node 版本，按版本号从新到旧找（v9 不能排在 v22 前面）。
	root := filepath.Join(home, ".nvm", "versions", "node")
	entries, _ := os.ReadDir(root)
	var versions []string
	for _, entry := range entries {
		if entry.IsDir() {
			versions = append(versions, entry.Name())
		}
	}
	slices.SortStableFunc(versions, func(a, b string) int { return compareNodeVersion(b, a) })
	for _, v := range versions {
		dirs = append(dirs, filepath.Join(root, v, "bin"))
	}
	return dirs
}

// compareNodeVersion 按 vMAJOR.MINOR.PATCH 比较；认不出的目录名排在所有版本号之后。
func compareNodeVersion(a, b string) int {
	pa, oka := parseNodeVersion(a)
	pb, okb := parseNodeVersion(b)
	switch {
	case oka && okb:
		return slices.Compare(pa, pb)
	case oka:
		return 1
	case okb:
		return -1
	}
	return strings.Compare(b, a)
}

func parseNodeVersion(name string) ([]int, bool) {
	parts := strings.Split(strings.TrimPrefix(name, "v"), ".")
	if len(parts) != 3 {
		return nil, false
	}
	nums := make([]int, 3)
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 {
			return nil, false
		}
		nums[i] = n
	}
	return nums, true
}

// resolveFeishuRunJS 与 findFeishuCLI 的解析一致：npm 全局安装时 bin/lark-cli 链到
// 包里的 scripts/run.js（要靠 node 解释），改用同一个包里的原生程序。
func resolveFeishuRunJS(p, name string) string {
	if real, err := filepath.EvalSymlinks(p); err == nil && filepath.Base(real) == "run.js" {
		return filepath.Join(filepath.Dir(filepath.Dir(real)), "bin", name)
	}
	return filepath.Clean(p)
}

// isExecutableFile 只认带可执行位的普通文件：残缺的安装、目录、权限被去掉的文件都跳过，
// 免得找到一个运行不了的路径，把「未安装」误报成「CLI 出错」。
func isExecutableFile(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
}
