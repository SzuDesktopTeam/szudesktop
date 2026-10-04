//go:build !darwin && !windows

package diagnose

// ReadSystemProxy 在其他平台上不读：Linux 各桌面环境一套（GNOME 走 gsettings、KDE 走
// 配置文件，命令行程序只认 http_proxy 环境变量），没有一处能代表「系统代理」。
// 返回 nil，诊断报告省略这一项，不猜。
func ReadSystemProxy() *SystemProxy { return nil }
