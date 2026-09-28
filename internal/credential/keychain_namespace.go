package credential

// 设置了 SZUNET_CONFIG_DIR 时，给 macOS 钥匙串的服务名加上按配置目录算出的后缀。
//
// 为什么需要：SZUNET_CONFIG_DIR 是测试和冒烟用来隔离数据的开关，但它只隔离了文件；
// 钥匙串是整个用户共用的，在开发机上跑一遍桌面引擎的测试或冒烟，就会覆盖掉
// 真实的 szunet / szunet-session 条目。加上 -test-<哈希> 后，每个配置目录各用各的条目，
// 冒烟结束后也能按同一个哈希精确地清掉，不会误删真实数据。
//
// 为什么默认关闭、只由桌面引擎打开（desktop/internal/ui 在 init 里调用
// EnableConfigDirKeychainNamespace）：命令行版 szunet 已经在 macOS 上发布过，
// 有用户设置了 SZUNET_CONFIG_DIR 在用；它的服务名一变，升级后就读不到原来的账号。
// 桌面版在 macOS 上从未发布，启用后缀没有兼容负担。
//
// 放在没有构建标签的文件里，是为了让 Linux CI 也能测到命名规则；
// 真正用这个名字去读写钥匙串的只有 keyring_darwin.go。

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"sync/atomic"
)

// keychainNamespaceEnabled 默认为假：没调用 EnableConfigDirKeychainNamespace 的程序
// （命令行版 szunet）服务名与以前完全一样。
var keychainNamespaceEnabled atomic.Bool

// EnableConfigDirKeychainNamespace 让本进程在设置了 SZUNET_CONFIG_DIR 时，
// 钥匙串服务名带上 -test-<配置目录哈希> 后缀。只应由桌面引擎调用。
func EnableConfigDirKeychainNamespace() {
	keychainNamespaceEnabled.Store(true)
}

// keychainServiceName 返回 base 实际使用的钥匙串服务名。账号名不受影响。
//
// 后缀是 sha256(配置目录的绝对路径，经 filepath.Clean) 的前 12 位小写十六进制。
// 不解析符号链接：冒烟脚本按同一个字符串算哈希就能找到条目
// （Python 里是 os.path.normpath(os.path.abspath(dir))），macOS 上 /var 与 /private/var
// 会得到不同的名字，这正是「按传入的路径隔离」该有的样子。
func keychainServiceName(base string) string {
	if !keychainNamespaceEnabled.Load() {
		return base
	}
	d := os.Getenv("SZUNET_CONFIG_DIR")
	if d == "" {
		return base
	}
	if abs, err := filepath.Abs(d); err == nil {
		d = abs
	}
	sum := sha256.Sum256([]byte(filepath.Clean(d)))
	return base + "-test-" + hex.EncodeToString(sum[:])[:12]
}
