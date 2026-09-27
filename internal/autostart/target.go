package autostart

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 选「开机启动哪个程序、带什么参数」的逻辑放在没有构建标签的文件里，
// 这样 Linux CI 也能跑它的测试；真正写注册表的只有 Windows 那个文件。

// Program 说明发起登记的是哪个程序。
//
// 程序被改了名（比如「校园网.exe」）之后，从文件名已经看不出自己是界面版
// 还是命令行版，只能由调用方说清楚。两者认的参数完全不同：界面版认
// --no-open，命令行版只认子命令，拿错了开机时就是一次静默失败。
type Program int

const (
	// ProgramGUI 是界面程序 szudesktop：开机静默起常驻服务。
	ProgramGUI Program = iota
	// ProgramCLI 是命令行版 szunet：开机登录一次就退出。
	ProgramCLI
)

// 开机自启时的参数：不弹浏览器（开机就弹窗很烦），但自动登录。
// 用户可以随时双击程序手动开界面。
const autostartArgs = " --no-open"

// 命令行版开机自启的参数。
//
// 只放 szunet 真正认识的子命令：`szunet login` 本身就是非交互的——它按
// 「命令行参数 > 环境变量 > 已保存凭据」取账号，失败只反映在退出码上，
// 没有任何需要用户确认的提示，所以不需要额外的开关。
//
// 这里原来写的是 `login --auto`，而 login 从来没有 --auto 这个参数。szunet 的
// flag 集用的是 ExitOnError，遇到未知参数会直接 os.Exit(2)：于是「用命令行版
// 开机自启」这条路上程序什么都没做就退出了，用户看到的是一个静默失效的开关。
// 注册的命令行必须能被 szunet 真的接受，改这里时请对着 cmd/szunet 的 flag 核对。
const cliLoginArgs = " login"

// CLILoginArgs 返回命令行版开机自启登记的参数。
// 导出只为一件事：让 cmd/szunet 的测试能断言「登记的参数 login 一定认得」。
func CLILoginArgs() string { return cliLoginArgs }

// argsFor 按程序身份给出开机自启参数。
func argsFor(p Program) string {
	if p == ProgramCLI {
		return cliLoginArgs
	}
	return autostartArgs
}

// programFromName 从文件名认程序身份。认不出来（被改名了）返回 false。
func programFromName(name string) (Program, bool) {
	n := strings.ToLower(name)
	switch {
	case isInstaller(n):
		return 0, false
	case strings.HasPrefix(n, "szudesktop"):
		return ProgramGUI, true
	case strings.HasPrefix(n, "szunet"):
		return ProgramCLI, true
	default:
		return 0, false
	}
}

// isInstaller 认出安装包、卸载程序这类同前缀的文件。
//
// 发布附件里同时有 szudesktop-windows-amd64.exe 和 szuDesktop-Setup-x.y.z.exe，
// 后者按小写比较时名字更短。以前「取最短的前缀匹配」会把安装包登记成开机启动，
// 之后每次登录 Windows 都弹安装向导，真正的程序却没有自启。
func isInstaller(lowerName string) bool {
	for _, marker := range []string{"setup", "install", "update"} {
		if strings.Contains(lowerName, marker) {
			return true
		}
	}
	return false
}

// bestMatch 在同目录的文件名里挑出某个程序。
//
// 固定文件名优先：szudesktop.exe（ZIP 里的名字）、szudesktop-windows-amd64.exe
// （单文件发布的名字）；都没有再从前缀匹配里挑名字最短的（避开 .old 之类的备份，
// 以及浏览器重复下载加的「 (1)」）。安装包、卸载程序一律不算。
func bestMatch(names []string, prefix string) string {
	preferred := []string{prefix + ".exe", prefix + "-windows-amd64.exe"}
	var best string
	bestRank := len(preferred)
	for _, name := range names {
		n := strings.ToLower(name)
		if !strings.HasPrefix(n, prefix) || !strings.HasSuffix(n, ".exe") || isInstaller(n) {
			continue
		}
		rank := len(preferred)
		for i, p := range preferred {
			if n == p {
				rank = i
				break
			}
		}
		switch {
		case best == "",
			rank < bestRank,
			rank == bestRank && len(n) < len(best):
			best, bestRank = name, rank
		}
	}
	return best
}

// pickTarget 决定开机启动哪个程序、带什么参数。
//
// self 是当前程序的完整路径，declared 是调用方声明的身份（文件名认不出时用它），
// siblings 是同目录下的文件名。
//
// 规则：
//   - 想要命令行版：自己就是命令行版就登记自己，否则找同目录的 szunet；
//   - 否则优先界面版（它起的是常驻服务，能一直盯着网络；命令行版只连一次）：
//     自己就是界面版就登记自己，不去同目录里找别的；否则找同目录的 szudesktop；
//   - 都找不到时登记自己，参数按自己的身份给——被改名的命令行版登记成
//     `--no-open` 的话，开机时 szunet 会把它当成不认识的子命令直接退出。
func pickTarget(self string, declared Program, siblings []string, preferCLI bool) (string, string) {
	dir := filepath.Dir(self)
	me := declared
	if p, ok := programFromName(filepath.Base(self)); ok {
		me = p
	}

	if preferCLI {
		if me == ProgramCLI {
			return self, cliLoginArgs
		}
		if cli := bestMatch(siblings, "szunet"); cli != "" {
			return filepath.Join(dir, cli), cliLoginArgs
		}
		return self, argsFor(me)
	}

	if me == ProgramGUI {
		return self, autostartArgs
	}
	if gui := bestMatch(siblings, "szudesktop"); gui != "" {
		return filepath.Join(dir, gui), autostartArgs
	}
	return self, argsFor(me)
}

// resolveTargetIn 读 self 所在目录，按 pickTarget 的规则选登记目标。
func resolveTargetIn(self string, declared Program, preferCLI bool) (string, string, error) {
	entries, err := os.ReadDir(filepath.Dir(self))
	if err != nil {
		return "", "", fmt.Errorf("读不了程序所在的目录: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	target, args := pickTarget(self, declared, names, preferCLI)
	return target, args, nil
}
