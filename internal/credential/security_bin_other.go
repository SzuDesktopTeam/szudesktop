//go:build !darwin

package credential

// defaultSecurityBin 在 macOS 以外只是占位：真正的钥匙串只有 darwin 会调用。
// 保持命令名而不是绝对路径，Linux CI 上的假命令测试会把 securityBin 换成自己的脚本。
const defaultSecurityBin = "security"
