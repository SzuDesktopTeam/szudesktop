//go:build darwin

package credential

// defaultSecurityBin 在 macOS 上写死系统自带的 /usr/bin/security。
//
// 为什么不按 PATH 找：机密经标准输入交给这个程序，PATH 里排在前面的同名程序
// （Homebrew、~/.local/bin 之类）就能原样收走；钥匙串条目的访问控制信任的
// 也是创建它的 /usr/bin/security，换成别的程序去读还会弹授权框。
const defaultSecurityBin = "/usr/bin/security"
