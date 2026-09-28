//go:build windows

package ui

// Windows 上外壳用 /api/shutdown 和 taskkill 结束引擎，不经 POSIX 信号；保持原样，不注册任何处理。
func notifyShutdownSignals(func()) func() { return func() {} }
