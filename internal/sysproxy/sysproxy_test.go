package sysproxy

import "testing"

// TestOwnedByUs 守住「只还原我们自己设的代理」。
//
// 上次运行没能善后（被强杀、崩溃），而用户在这期间自己改过代理时，
// 备份里的旧值已经过期：拿它还原（或者再次连接时不重新抓快照），
// 就会把用户的新设置盖掉。
func TestOwnedByUs(t *testing.T) {
	cases := []struct {
		name    string
		enabled bool
		server  string
		applied string
		want    bool
	}{
		{"当前就是我们写的", true, "socks=127.0.0.1:7891", "socks=127.0.0.1:7891", true},
		{"用户换成了自己的代理", true, "127.0.0.1:7890", "socks=127.0.0.1:7891", false},
		{"用户把代理关了", false, "socks=127.0.0.1:7891", "socks=127.0.0.1:7891", false},
		{"换了端口也不算我们的", true, "socks=127.0.0.1:7892", "socks=127.0.0.1:7891", false},
		{"老备份：按本机 SOCKS 认", true, "socks=127.0.0.1:7891", "", true},
		{"老备份：localhost 也算本机", true, "socks=localhost:7891", "", true},
		{"老备份：公司代理不是我们的", true, "proxy.corp.example:8080", "", false},
		{"老备份：远端 SOCKS 不是我们的", true, "socks=10.0.0.2:1080", "", false},
		{"老备份：格式不对", true, "socks=", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ownedByUs(c.enabled, c.server, c.applied); got != c.want {
				t.Fatalf("ownedByUs(%v, %q, %q) = %v，期望 %v", c.enabled, c.server, c.applied, got, c.want)
			}
		})
	}
}

// TestNextBackup 守住 Enable 的备份决定：什么时候沿用旧备份，什么时候按当前设置重抓。
func TestNextBackup(t *testing.T) {
	const applied = "socks=127.0.0.1:7891"
	userProxy := setting{Enabled: true, Server: "127.0.0.1:7890", Override: "<local>"}
	ours := setting{Enabled: true, Server: applied, Override: "<local>;localhost;127.*"}
	original := Snapshot{Enabled: true, Server: "proxy.corp.example:8080", Override: "*.corp", Valid: true, Applied: applied}

	cases := []struct {
		name      string
		cur       setting
		backup    Snapshot
		hasBackup bool
		want      Snapshot
	}{
		{
			name: "没有备份：按当前设置抓一份",
			cur:  userProxy,
			want: Snapshot{Enabled: true, Server: "127.0.0.1:7890", Override: "<local>", Valid: true, Applied: applied},
		},
		{
			name: "有备份且当前还是我们的（重连）：沿用旧备份，不能拿我们自己的代理当原值",
			cur:  ours, backup: original, hasBackup: true,
			want: original,
		},
		{
			name: "有过期备份、用户在这期间改过代理：按用户的新设置重抓",
			cur:  userProxy, backup: original, hasBackup: true,
			want: Snapshot{Enabled: true, Server: "127.0.0.1:7890", Override: "<local>", Valid: true, Applied: applied},
		},
		{
			name: "有过期备份、用户把代理关了：按关着的状态重抓",
			cur:  setting{Enabled: false, Server: applied}, backup: original, hasBackup: true,
			want: Snapshot{Enabled: false, Server: applied, Valid: true, Applied: applied},
		},
		{
			name:   "换了端口重连：旧备份属于我们、Applied 更新成新地址",
			cur:    setting{Enabled: true, Server: "socks=127.0.0.1:7892"},
			backup: Snapshot{Enabled: false, Valid: true, Applied: "socks=127.0.0.1:7892"}, hasBackup: true,
			want: Snapshot{Enabled: false, Valid: true, Applied: applied},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := nextBackup(c.cur, c.backup, c.hasBackup, applied); got != c.want {
				t.Fatalf("nextBackup = %+v，期望 %+v", got, c.want)
			}
		})
	}
}

// TestShouldRestore 守住 Disable 的还原条件。
//
// Disable 不只在「刚开过代理」之后被调：隧道退出、断开连接、界面上的「关闭系统
// 代理」按钮都会调它。上次被强杀留下了备份、用户又自己改过代理时，这些调用
// 都不能拿崩溃前的旧值盖掉用户的新设置。
func TestShouldRestore(t *testing.T) {
	const applied = "socks=127.0.0.1:7891"
	stale := Snapshot{Enabled: false, Valid: true, Applied: applied}
	legacy := Snapshot{Enabled: true, Server: "proxy.corp.example:8080", Valid: true}

	cases := []struct {
		name   string
		cur    setting
		backup Snapshot
		want   bool
	}{
		{"当前还是我们写的：还原", setting{Enabled: true, Server: applied}, stale, true},
		{"过期备份、用户换了自己的代理：不能覆盖", setting{Enabled: true, Server: "127.0.0.1:7890"}, stale, false},
		// 用户自己的代理工具也常是本机 SOCKS：备份记着我们写的端口时，只认那一个端口，不能按“socks= 指向本机”笼统放行。
		{"过期备份、用户换成了自己的本机 SOCKS（别的端口）：不能覆盖", setting{Enabled: true, Server: "socks=127.0.0.1:1080"}, stale, false},
		{"过期备份、用户换成了 localhost 的 SOCKS：不能覆盖", setting{Enabled: true, Server: "socks=localhost:7891"}, stale, false},
		{"过期备份、用户把代理关了：不能又打开", setting{Enabled: false, Server: applied}, stale, false},
		{"过期备份、用户清空了代理：不能覆盖", setting{}, stale, false},
		{"老备份（没有 Applied）、当前是本机 SOCKS：还原", setting{Enabled: true, Server: "socks=127.0.0.1:7891"}, legacy, true},
		{"老备份、当前是公司代理：不能覆盖", setting{Enabled: true, Server: "proxy.corp.example:8080"}, legacy, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := shouldRestore(c.cur, c.backup); got != c.want {
				t.Fatalf("shouldRestore(%+v, %+v) = %v，期望 %v", c.cur, c.backup, got, c.want)
			}
		})
	}
}
