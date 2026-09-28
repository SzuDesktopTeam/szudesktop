package autostart

import (
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// 性质测试：对随机的「自己叫什么、同目录有什么、声明的身份、想登记哪一版」组合，
// 检查 pickTarget / bestMatch 的不变量。随机源用固定种子，失败时日志里有种子可复现；
// 设置 SZU_PROPERTY_SEED 可换种子。

const propertyCases = 400

func propertyRand(t *testing.T) *rand.Rand {
	t.Helper()
	seed := int64(20260928)
	if s := os.Getenv("SZU_PROPERTY_SEED"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			seed = v
		}
	}
	t.Logf("随机种子 seed=%d（可用 SZU_PROPERTY_SEED 覆盖）", seed)
	return rand.New(rand.NewSource(seed))
}

// namePool 是「下载」目录里可能同时出现的文件名：正式名、单文件名、安装包、备份、重复下载、改名。
var namePool = []string{
	"szudesktop.exe", "szudesktop-windows-amd64.exe", "SZUDesktop.exe", "szudesktop (1).exe", "szudesktop.exe.old",
	"szuDesktop-Setup-0.9.3.exe", "szudesktop-installer.exe", "szudesktop-update.exe", "uninstall-szudesktop.exe",
	"szunet.exe", "szunet-windows-amd64.exe", "SzuNet (2).exe", "szunet-setup.exe", "szunet.exe.bak", "szunetwork.exe",
	"校园网.exe", "深大桌面.exe", "readme.txt", "szudesktop", "szunet",
}

func randomNames(r *rand.Rand) []string {
	n := r.Intn(7)
	seen := map[string]bool{}
	var out []string
	for len(out) < n {
		name := namePool[r.Intn(len(namePool))]
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

// TestPropertyPickTargetArgsMatchTargetIdentity 性质：登记的参数只能是两种之一；目标一定在同目录，
// 且要么是自己、要么是同目录里确实存在的文件；目标文件名认得出身份时参数必须和这个身份配对
// （命令行版只认 login，界面版认 --no-open）；认不出身份时只能登记自己、按声明的身份给参数；
// 安装包 / 卸载程序从不被登记。
func TestPropertyPickTargetArgsMatchTargetIdentity(t *testing.T) {
	r := propertyRand(t)
	dir := filepath.Join("C:", "Users", "u", "Downloads")
	for i := 0; i < propertyCases; i++ {
		siblings := randomNames(r)
		self := namePool[r.Intn(len(namePool))]
		if r.Intn(2) == 0 && !contains(siblings, self) {
			siblings = append(siblings, self)
		}
		declared := Program(r.Intn(2))
		preferCLI := r.Intn(2) == 0
		target, args := pickTarget(filepath.Join(dir, self), declared, siblings, preferCLI)

		if args != autostartArgs && args != cliLoginArgs {
			t.Fatalf("第 %d 例：参数 %q 不是两种合法值之一", i, args)
		}
		if filepath.Dir(target) != dir {
			t.Fatalf("第 %d 例：目标 %q 不在程序所在目录", i, target)
		}
		base := filepath.Base(target)
		if base != self && !contains(siblings, base) {
			t.Fatalf("第 %d 例：目标 %q 既不是自己也不在同目录里：%v", i, base, siblings)
		}
		if base != self && isInstaller(strings.ToLower(base)) {
			t.Fatalf("第 %d 例：登记了安装包 %q", i, base)
		}
		if p, ok := programFromName(base); ok {
			if args != argsFor(p) {
				t.Fatalf("第 %d 例：目标 %q 是 %v，参数却是 %q", i, base, p, args)
			}
		} else if base != self || args != argsFor(declared) {
			t.Fatalf("第 %d 例：认不出身份时应登记自己并按声明 %v 给参数，实际 %q %q", i, declared, target, args)
		}
		// 不想要命令行版、自己又是界面版：只登记自己。
		if p, ok := programFromName(self); ok && p == ProgramGUI && !preferCLI && base != self {
			t.Fatalf("第 %d 例：界面版应登记自己，实际 %q", i, base)
		}
		// 想要命令行版、自己就是命令行版：只登记自己。
		if p, ok := programFromName(self); ok && p == ProgramCLI && preferCLI && base != self {
			t.Fatalf("第 %d 例：命令行版应登记自己，实际 %q", i, base)
		}
	}
}

// TestPropertyBestMatchPicksMinimalCandidate 性质：bestMatch 的结果要么为空、要么是候选里的一个，
// 满足前缀 / .exe / 非安装包；没有任何别的候选比它更优（固定文件名等级更高，或同级更短）；
// 候选里有固定文件名时一定选它；结果不随候选顺序改变（同级同长的不算，按第一个算）。
func TestPropertyBestMatchPicksMinimalCandidate(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		names := randomNames(r)
		prefix := []string{"szudesktop", "szunet"}[r.Intn(2)]
		got := bestMatch(names, prefix)
		rank := func(name string) (int, bool) {
			n := strings.ToLower(name)
			if !strings.HasPrefix(n, prefix) || !strings.HasSuffix(n, ".exe") || isInstaller(n) {
				return 0, false
			}
			switch n {
			case prefix + ".exe":
				return 0, true
			case prefix + "-windows-amd64.exe":
				return 1, true
			}
			return 2, true
		}
		if got == "" {
			for _, name := range names {
				if _, ok := rank(name); ok {
					t.Fatalf("第 %d 例：有合格候选 %q 却返回空：%v", i, name, names)
				}
			}
			continue
		}
		gotRank, ok := rank(got)
		if !ok || !contains(names, got) {
			t.Fatalf("第 %d 例：结果 %q 不是合格候选：%v", i, got, names)
		}
		for _, name := range names {
			rk, ok := rank(name)
			if !ok {
				continue
			}
			if rk < gotRank || (rk == gotRank && len(strings.ToLower(name)) < len(strings.ToLower(got))) {
				t.Fatalf("第 %d 例：%q 比结果 %q 更优：%v", i, name, got, names)
			}
		}
		// 倒序再算一遍：除了同级同长的并列，答案不该变。
		reversed := make([]string, len(names))
		for j, name := range names {
			reversed[len(names)-1-j] = name
		}
		if again := bestMatch(reversed, prefix); again != got {
			ra, _ := rank(again)
			if ra != gotRank || len(again) != len(got) {
				t.Fatalf("第 %d 例：候选顺序改变了结果 %q → %q：%v", i, got, again, names)
			}
		}
	}
}

func contains(names []string, name string) bool {
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}
