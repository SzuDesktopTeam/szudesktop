package ui

import "github.com/SzuDesktopTeam/szudesktop/internal/credential"

// 桌面引擎设置了 SZUNET_CONFIG_DIR 时，macOS 钥匙串的服务名带上按配置目录算出的
// -test-<哈希> 后缀，测试和冒烟不会覆盖开发机上真实的 szunet / szunet-session 条目。
//
// 放在 ui 包的 init 里而不是 main：桌面引擎和本包的测试都会链接这个包，两边一起受保护；
// 命令行版 szunet 不导入本包，服务名保持原样——它已经在 macOS 上发布过，改名会让
// 设置过 SZUNET_CONFIG_DIR 的用户升级后读不到原来的账号。桌面版在 macOS 上从未发布，
// 启用后缀没有兼容负担。规则见 internal/credential/keychain_namespace.go。
func init() {
	credential.EnableConfigDirKeychainNamespace()
}
