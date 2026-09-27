//go:build windows

package sysproxy

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Windows 的系统代理设置在这个注册表键里（当前用户，不需要管理员权限）。
// 浏览器（Edge/Chrome）和绝大多数走系统设置的软件都读它。
const inetPath = `Software\Microsoft\Windows\CurrentVersion\Internet Settings`

// 改动之前的原值抄在这里。
//
// 为什么不放内存：程序可能被任务管理器强杀、被关机打断、或者崩了。
// 那种情况下内存里的备份跟着一起没了，用户的代理设置就永远停在我们改过的
// 样子——他还不知道是谁改的。存注册表的话，下次启动一看有备份没清掉，
// 就知道上回没善后，可以直接还原。
const backupPath = `Software\szuDesktop\ProxyBackup`

// InternetSetOptionW 的两个通知码：光改注册表不通知，已经开着的浏览器
// 不会重新读设置，得等重启才生效。这两个调用让改动立刻起作用。
const (
	optSettingsChanged = 39 // INTERNET_OPTION_SETTINGS_CHANGED
	optRefresh         = 37 // INTERNET_OPTION_REFRESH
)

var (
	wininet              = windows.NewLazySystemDLL("wininet.dll")
	procInternetSetOptio = wininet.NewProc("InternetSetOptionW")
)

// notifyChanged 告诉系统「代理设置变了，重新读一次」。
func notifyChanged() {
	// 失败也不当错误处理：设置已经落到注册表了，最坏情况是用户重开一下
	// 浏览器才生效，没必要为此让整个连接流程失败。
	_, _, _ = procInternetSetOptio.Call(0, optSettingsChanged, 0, 0)
	_, _, _ = procInternetSetOptio.Call(0, optRefresh, 0, 0)
}

// readInet 读当前的系统代理设置。键不存在（从没配过代理）按全空处理。
func readInet() (setting, error) {
	k, err := registry.OpenKey(registry.CURRENT_USER, inetPath, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return setting{}, nil
	}
	if err != nil {
		return setting{}, fmt.Errorf("读不到系统代理设置: %w", err)
	}
	defer k.Close()

	var cur setting
	if v, _, err := k.GetIntegerValue("ProxyEnable"); err == nil {
		cur.Enabled = v != 0
	}
	cur.Server, _, _ = k.GetStringValue("ProxyServer")
	cur.Override, _, _ = k.GetStringValue("ProxyOverride")
	return cur, nil
}

// saveBackup 把原值抄进我们自己的键。
func saveBackup(s Snapshot) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, backupPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("写代理备份失败: %w", err)
	}
	defer k.Close()

	var on uint32
	if s.Enabled {
		on = 1
	}
	if err := k.SetDWordValue("Enabled", on); err != nil {
		return err
	}
	if err := k.SetStringValue("Server", s.Server); err != nil {
		return err
	}
	if err := k.SetStringValue("Applied", s.Applied); err != nil {
		return err
	}
	return k.SetStringValue("Override", s.Override)
}

// loadBackup 取出备份。第二个返回值表示有没有备份。
func loadBackup() (Snapshot, bool) {
	k, err := registry.OpenKey(registry.CURRENT_USER, backupPath, registry.QUERY_VALUE)
	if err != nil {
		return Snapshot{}, false
	}
	defer k.Close()

	var s Snapshot
	v, _, err := k.GetIntegerValue("Enabled")
	if err != nil {
		return Snapshot{}, false
	}
	s.Enabled = v != 0
	s.Server, _, _ = k.GetStringValue("Server")
	s.Override, _, _ = k.GetStringValue("Override")
	s.Applied, _, _ = k.GetStringValue("Applied") // 老版本的备份没有，读不到就是空
	s.Valid = true
	return s, true
}

func dropBackup() {
	// 删不掉不算致命：下次 Enable 会按当前设置判断要不要沿用，
	// Disable 也会先确认当前设置还是我们的才还原。
	_ = registry.DeleteKey(registry.CURRENT_USER, backupPath)
}

// HasBackup 报告有没有「还没还原」的备份。
// 启动时为真，说明上一次运行没能正常善后（被强杀或崩了）。
func HasBackup() bool {
	_, ok := loadBackup()
	return ok
}

// RecoverStale 在启动时善后上一次没来得及还原的系统代理。
//
// 有备份说明上次运行没能正常断开（被强杀、崩溃、关机）。这时系统代理多半还
// 指着一个已经没人监听的本机端口，浏览器和大多数软件都会断网，而用户根本
// 不知道是谁改的。
//
//   - 当前设置还是我们写的：按备份还原，返回 true；
//   - 当前设置已经被用户改过：尊重用户的新设置，只丢掉过期的备份，返回 false；
//   - 没有备份：什么都不做。
//
// 只能在 VPN 没连着的时候调（也就是进程刚启动时），否则会把正在用的代理关掉。
func RecoverStale() (bool, error) {
	return restore()
}

// Query 返回当前系统代理状况。
func Query() State {
	cur, _ := readInet()
	// 有备份不等于还在接管：上次没善后、用户又自己改过代理时，备份已经过期，
	// 断开时也不会拿它去还原（见 shouldRestore），不能说成是我们在接管。
	backup, ok := loadBackup()
	managed := ok && shouldRestore(cur, backup)

	st := State{Supported: true, Enabled: cur.Enabled, Server: cur.Server, Managed: managed}
	switch {
	case managed:
		st.Note = "系统代理由 szuDesktop 接管中，断开 VPN 会自动还回原来的设置"
	case cur.Enabled:
		st.Note = "系统里本来就挂着代理：" + cur.Server
	default:
		st.Note = "系统代理没开，全部流量直连"
	}
	return st
}

// Enable 把系统代理指到本机的 SOCKS 端口。socksAddr 形如 127.0.0.1:7891。
//
// 注意 WinINET 这个 socks= 前缀的历史包袱：Chromium 读到它会按 SOCKS4
// 发握手，不是 SOCKS5。所以隧道那侧的 SOCKS 服务必须同时听得懂 SOCKS4，
// 否则这里设完看着成功、浏览器却一个页面都打不开。
func Enable(socksAddr string) error {
	if socksAddr == "" {
		return errors.New("没有给 SOCKS 地址")
	}

	// 先抄原值。沿用旧备份还是重新抓一份，见 nextBackup。
	// 读不到当前设置就不改：没有可靠的原值，断开时就还不回去。
	applied := "socks=" + socksAddr
	cur, err := readInet()
	if err != nil {
		return err
	}
	old, ok := loadBackup()
	if err := saveBackup(nextBackup(cur, old, ok, applied)); err != nil {
		return err
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, inetPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("打不开系统代理设置: %w", err)
	}
	defer k.Close()

	if err := k.SetStringValue("ProxyServer", applied); err != nil {
		return fmt.Errorf("写代理地址失败: %w", err)
	}
	// 本机地址和校内直连域名不走代理，否则访问 127.0.0.1 上的界面自己
	// 都要绕一圈，而且容易绕出死循环。
	if err := k.SetStringValue("ProxyOverride", "<local>;localhost;127.*"); err != nil {
		return fmt.Errorf("写例外列表失败: %w", err)
	}
	if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
		return fmt.Errorf("打开代理开关失败: %w", err)
	}

	notifyChanged()
	return nil
}

// Disable 把系统代理还原成我们改之前的样子。
//
// 没有备份就什么都不做；当前设置已经不是我们写的（用户在这期间自己改过），
// 只丢掉过期的备份、不碰系统设置，见 shouldRestore。
func Disable() error {
	_, err := restore()
	return err
}

// restore 是 Disable 和 RecoverStale 共用的还原逻辑，restored 表示真的改了系统设置。
func restore() (restored bool, err error) {
	s, ok := loadBackup()
	if !ok {
		return false, nil // 没动过，没什么可还的
	}
	cur, err := readInet()
	if err != nil {
		return false, err // 读不到就先别动，备份留着下次再判断
	}
	if !shouldRestore(cur, s) {
		dropBackup()
		return false, nil
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, inetPath, registry.SET_VALUE)
	if err != nil {
		return false, fmt.Errorf("打不开系统代理设置: %w", err)
	}
	defer k.Close()

	// 逐字还原：原来有代理就把地址填回去，原来没有就把开关关掉。
	if err := k.SetStringValue("ProxyServer", s.Server); err != nil {
		return false, err
	}
	if err := k.SetStringValue("ProxyOverride", s.Override); err != nil {
		return false, err
	}
	var on uint32
	if s.Enabled {
		on = 1
	}
	if err := k.SetDWordValue("ProxyEnable", on); err != nil {
		return false, err
	}

	dropBackup()
	notifyChanged()
	return true, nil
}
