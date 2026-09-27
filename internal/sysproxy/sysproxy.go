// Package sysproxy 一键把系统代理指到本机 SOCKS5，断开时原样还回去。
//
// VPN 隧道本身只提供一个本地 SOCKS5 端口。想让浏览器和大部分软件真的走进
// 隧道，还得让系统知道「有个代理在这儿」。这个包干的就是这件事。
//
// 为什么要备份原值：很多人本来就挂着别的代理（公司代理、抓包工具、
// 学术镜像）。如果断开 VPN 时简单地把代理一关了事，等于顺手废掉了人家
// 原来的设置，而且用户根本不知道是谁改的。所以开之前先把原值抄下来，
// 断开时逐字还回去。
//
// 备份存在注册表里而不是内存里，因为程序可能在连接中被强杀（任务管理器、
// 关机、崩溃）。存在注册表里，下次启动还能把上一次没来得及恢复的设置捞回来
// （见 RecoverStale）。
package sysproxy

import (
	"net"
	"strings"
)

// Snapshot 是改动之前的系统代理设置，用来原样恢复。
type Snapshot struct {
	Enabled  bool   // 原来有没有开代理
	Server   string // 原来的代理地址（WinINET 的 ProxyServer 格式）
	Override string // 原来的不代理列表（ProxyOverride）
	Valid    bool   // 这份快照是不是真读出来的（false 表示没有可恢复的东西）

	// Applied 是我们写进系统设置的 ProxyServer，用来认出「现在的设置还是不是我们的」。
	// 老版本留下的备份没有这一项。
	Applied string
}

// setting 是系统代理此刻的三项值。
type setting struct {
	Enabled  bool
	Server   string
	Override string
}

// nextBackup 决定 Enable 这次要存下的备份。
//
// 已经有备份、而且当前设置还是我们上次写的，就沿用旧备份——那时备份里才是
// 用户真正的原始设置，拿我们自己的代理覆盖它等于弄丢原值。
//
// 当前设置已经不是我们的了（上次没善后，用户在这期间自己改过代理），备份就
// 过期了，必须按当前设置重新抓一份；否则断开时会拿崩溃前的旧值盖掉用户的新设置。
func nextBackup(cur setting, backup Snapshot, hasBackup bool, applied string) Snapshot {
	if !hasBackup || !ownedByUs(cur.Enabled, cur.Server, backup.Applied) {
		backup = Snapshot{Enabled: cur.Enabled, Server: cur.Server, Override: cur.Override, Valid: true}
	}
	backup.Applied = applied
	return backup
}

// shouldRestore 决定 Disable / RecoverStale 能不能拿备份去改系统设置。
//
// 只有当前设置还是我们写的那一份才还原。用户在这期间自己改过代理（比如上次
// 被强杀后手动换了代理），备份就过期了，只能丢掉，不能拿它盖掉用户的新设置。
// Disable 的调用方很多：隧道退出、断开连接、「关闭系统代理」按钮，都不一定
// 刚开过代理，所以这道检查放在 Disable 自己身上，而不是指望每个调用方先查。
func shouldRestore(cur setting, backup Snapshot) bool {
	return ownedByUs(cur.Enabled, cur.Server, backup.Applied)
}

// ownedByUs 判断当前的系统代理是不是我们设的那一份。
//
// 只有是我们的，才能拿备份去覆盖：用户在这期间自己改过代理的话，
// 备份里的旧值已经过期，拿它还原等于把用户的新设置弄丢。
// applied 为空（老版本的备份）时，按我们写入的格式认：socks= 指向本机端口。
func ownedByUs(enabled bool, server, applied string) bool {
	if !enabled {
		return false
	}
	if applied != "" {
		return server == applied
	}
	return isLoopbackSocks(server)
}

// isLoopbackSocks 认出 "socks=127.0.0.1:7891" 这种指向本机的 SOCKS 设置。
func isLoopbackSocks(server string) bool {
	addr, ok := strings.CutPrefix(server, "socks=")
	if !ok {
		return false
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// State 是当前系统代理的状况，给界面显示用。
type State struct {
	Supported bool   `json:"supported"` // 这个平台支不支持一键设置
	Enabled   bool   `json:"enabled"`   // 系统代理当前是否开着
	Server    string `json:"server"`    // 当前代理地址
	Managed   bool   `json:"managed"`   // 是不是我们设的（有备份在案，且当前设置就是我们写的那份）
	Note      string `json:"note"`      // 一句人话说明
}
