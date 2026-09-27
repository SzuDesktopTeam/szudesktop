//go:build !campusvpn

package ui

// quietVPN 与 campusvpn 构建里的同名替身对齐：发布版本来就不碰系统代理。
func quietVPN() *vpnManager { return newVPNManager() }
