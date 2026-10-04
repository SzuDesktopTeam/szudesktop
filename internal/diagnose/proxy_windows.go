//go:build windows

package diagnose

import (
	"errors"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// inetSettingsPath 是当前用户的 WinINET 代理设置，Edge、Chrome 和大多数软件认的就是它，
// 和 internal/sysproxy 读写的是同一个键。不直接用 sysproxy.Query：它连代理地址一起读出来，
// 也不看自动配置脚本（PAC）。
const inetSettingsPath = `Software\Microsoft\Windows\CurrentVersion\Internet Settings`

// ReadSystemProxy 读当前用户的系统代理开关；读不到时返回 nil，调用方省略这一项。
// 只读 ProxyEnable 和 AutoConfigURL 是否为空，不读 ProxyServer。
func ReadSystemProxy() *SystemProxy {
	k, err := registry.OpenKey(registry.CURRENT_USER, inetSettingsPath, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return &SystemProxy{} // 从没配过代理
	}
	if err != nil {
		return nil
	}
	defer k.Close()

	p := &SystemProxy{}
	if v, _, err := k.GetIntegerValue("ProxyEnable"); err == nil {
		p.Manual = v != 0
	}
	if v, _, err := k.GetStringValue("AutoConfigURL"); err == nil {
		p.PAC = strings.TrimSpace(v) != ""
	}
	return p
}
