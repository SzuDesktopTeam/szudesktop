package autostart

import (
	"os"
	"path/filepath"
	"testing"
)

// TestPickTarget 覆盖「开机启动哪个程序、带什么参数」的选择规则。
//
// 两个真踩过的坑：
//   - 发布附件同时有 szudesktop-windows-amd64.exe 和 szuDesktop-Setup-x.y.z.exe，
//     安装包按小写比较名字更短。「取最短的前缀匹配」会把安装包登记成开机启动，
//     每次登录都弹安装向导。
//   - 命令行版被改名、同目录又没有界面版时，兜底登记了界面版的 --no-open；
//     szunet 把它当成不认识的子命令，开机时直接 os.Exit(2)。
func TestPickTarget(t *testing.T) {
	dir := filepath.Join("C:", "Downloads")
	at := func(name string) string { return filepath.Join(dir, name) }

	cases := []struct {
		name      string
		self      string
		declared  Program
		siblings  []string
		preferCLI bool
		want      string
		wantArgs  string
	}{
		{
			name:     "命令行版旁边有安装包和单文件界面版：选界面版，不选安装包",
			self:     at("szunet-windows-amd64.exe"),
			declared: ProgramCLI,
			siblings: []string{"szuDesktop-Setup-0.9.3.exe", "szudesktop-windows-amd64.exe", "szunet-windows-amd64.exe"},
			want:     at("szudesktop-windows-amd64.exe"),
			wantArgs: autostartArgs,
		},
		{
			name:     "界面版自己登记自己，不去挑同目录里更短的名字",
			self:     at("szudesktop-windows-amd64.exe"),
			declared: ProgramGUI,
			siblings: []string{"szuDesktop-Setup-0.9.3.exe", "szudesktop-windows-amd64.exe"},
			want:     at("szudesktop-windows-amd64.exe"),
			wantArgs: autostartArgs,
		},
		{
			name:     "只有安装包：命令行版登记自己，参数是 login",
			self:     at("szunet-windows-amd64.exe"),
			declared: ProgramCLI,
			siblings: []string{"szuDesktop-Setup-0.9.3.exe", "szunet-windows-amd64.exe", "uninstall-szudesktop.exe"},
			want:     at("szunet-windows-amd64.exe"),
			wantArgs: cliLoginArgs,
		},
		{
			name:     "只有升级包和卸载程序：它们和安装包一样不算程序，命令行版登记自己",
			self:     at("szunet.exe"),
			declared: ProgramCLI,
			siblings: []string{"szudesktop-update.exe", "szuDesktop-Update-0.9.4.exe", "szudesktop-installer.exe", "szunet.exe"},
			want:     at("szunet.exe"),
			wantArgs: cliLoginArgs,
		},
		{
			name:     "命令行版被改名、没有界面版：按声明的身份给 login，不给 --no-open",
			self:     at("校园网.exe"),
			declared: ProgramCLI,
			siblings: []string{"校园网.exe"},
			want:     at("校园网.exe"),
			wantArgs: cliLoginArgs,
		},
		{
			name:     "界面版被改名：按声明的身份给 --no-open",
			self:     at("深大桌面.exe"),
			declared: ProgramGUI,
			siblings: []string{"深大桌面.exe", "szunet.exe"},
			want:     at("深大桌面.exe"),
			wantArgs: autostartArgs,
		},
		{
			name:     "固定文件名优先于更短的备份名",
			self:     at("szunet.exe"),
			declared: ProgramCLI,
			siblings: []string{"szudesktop (1).exe", "szudesktop.exe", "szudesktop.exe.old", "szunet.exe"},
			want:     at("szudesktop.exe"),
			wantArgs: autostartArgs,
		},
		{
			name:      "指定命令行版：自己就是命令行版就登记自己",
			self:      at("szunet-windows-amd64.exe"),
			declared:  ProgramCLI,
			siblings:  []string{"szudesktop.exe", "szunet-windows-amd64.exe"},
			preferCLI: true,
			want:      at("szunet-windows-amd64.exe"),
			wantArgs:  cliLoginArgs,
		},
		{
			name:      "界面版要求登记命令行版：找同目录的 szunet",
			self:      at("szudesktop.exe"),
			declared:  ProgramGUI,
			siblings:  []string{"szudesktop.exe", "szunet-windows-amd64.exe"},
			preferCLI: true,
			want:      at("szunet-windows-amd64.exe"),
			wantArgs:  cliLoginArgs,
		},
		{
			name:      "界面版要求登记命令行版但找不到：登记自己，参数仍按界面版给",
			self:      at("szudesktop.exe"),
			declared:  ProgramGUI,
			siblings:  []string{"szudesktop.exe"},
			preferCLI: true,
			want:      at("szudesktop.exe"),
			wantArgs:  autostartArgs,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, args := pickTarget(c.self, c.declared, c.siblings, c.preferCLI)
			if got != c.want || args != c.wantArgs {
				t.Fatalf("pickTarget = %q %q，期望 %q %q", got, args, c.want, c.wantArgs)
			}
		})
	}
}

// TestResolveTargetInRealDirectory 在临时目录里摆出和「下载」目录一样的文件，
// 走一遍真实的目录扫描。
func TestResolveTargetInRealDirectory(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"szuDesktop-Setup-0.9.3.exe", "szunet-windows-amd64.exe", "readme.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(dir, "szudesktop.exe"), 0o700); err != nil { // 同名目录不算
		t.Fatal(err)
	}

	self := filepath.Join(dir, "szunet-windows-amd64.exe")
	target, args, err := resolveTargetIn(self, ProgramCLI, false)
	if err != nil {
		t.Fatal(err)
	}
	if target != self || args != cliLoginArgs {
		t.Fatalf("只有安装包和命令行版时应登记命令行版 login，实际 %q %q", target, args)
	}
}
