package credential

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"testing"
)

// setKeychainNamespace 切换包级开关，测试结束时恢复原状，
// 不让一个用例打开的后缀漏到别的用例（以及 darwin 上的假钥匙串测试）里。
func setKeychainNamespace(t *testing.T, on bool) {
	t.Helper()
	saved := keychainNamespaceEnabled.Load()
	keychainNamespaceEnabled.Store(on)
	t.Cleanup(func() { keychainNamespaceEnabled.Store(saved) })
}

var testSuffix = regexp.MustCompile(`^szunet-session-test-[0-9a-f]{12}$`)

// 命令行版 szunet 从不调用 EnableConfigDirKeychainNamespace：即使设置了 SZUNET_CONFIG_DIR，
// 服务名也必须和已发布的版本一样，否则升级后读不到原来的账号。
func TestKeychainServiceNameUnchangedWhenNamespaceDisabled(t *testing.T) {
	setKeychainNamespace(t, false)
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	for _, base := range []string{keychainServiceBaseForTest, sessionServiceBaseForTest} {
		if got := keychainServiceName(base); got != base {
			t.Fatalf("未启用时服务名被改成了 %q，命令行版升级后会读不到原来的条目", got)
		}
	}
}

func TestKeychainServiceNameSuffixedPerConfigDir(t *testing.T) {
	setKeychainNamespace(t, true)
	root := t.TempDir()
	a, b := filepath.Join(root, "a"), filepath.Join(root, "b")

	t.Setenv("SZUNET_CONFIG_DIR", a)
	first := keychainServiceName(sessionServiceBaseForTest)
	if !testSuffix.MatchString(first) {
		t.Fatalf("启用且设置了配置目录时应带 -test-<12 位十六进制>，得到 %q", first)
	}
	if again := keychainServiceName(sessionServiceBaseForTest); again != first {
		t.Fatalf("同一个配置目录两次算出的名字不同：%q 与 %q，冒烟没法按哈希清理", first, again)
	}
	// 同一目录的不同写法必须得到同一个名字（这里故意不用 filepath.Join，它会先替我们 Clean 掉）。
	sep := string(filepath.Separator)
	for _, alias := range []string{a + sep, root + sep + "x" + sep + ".." + sep + "a", root + sep + "." + sep + "a"} {
		t.Setenv("SZUNET_CONFIG_DIR", alias)
		if got := keychainServiceName(sessionServiceBaseForTest); got != first {
			t.Fatalf("%q 与 %q 是同一个目录，却得到不同的服务名 %q / %q", alias, a, got, first)
		}
	}
	t.Setenv("SZUNET_CONFIG_DIR", b)
	if other := keychainServiceName(sessionServiceBaseForTest); other == first {
		t.Fatalf("不同的配置目录共用了同一个钥匙串服务名 %q，起不到隔离作用", other)
	}
	t.Setenv("SZUNET_CONFIG_DIR", a)
	if got := keychainServiceName(keychainServiceBaseForTest); got != keychainServiceBaseForTest+first[len(sessionServiceBaseForTest):] {
		t.Fatalf("账号与会话两个条目应带同一个后缀，得到 %q 与 %q", got, first)
	}
}

// 相对路径要先按当前目录转成绝对路径再算哈希：否则在不同目录下启动的两个引擎
// 会共用同一个服务名，同一个引擎换个启动目录却又找不到自己的条目。
func TestKeychainServiceNameResolvesRelativeConfigDir(t *testing.T) {
	setKeychainNamespace(t, true)
	t.Chdir(t.TempDir())
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SZUNET_CONFIG_DIR", filepath.Join(wd, "cfg"))
	want := keychainServiceName(sessionServiceBaseForTest)
	t.Setenv("SZUNET_CONFIG_DIR", "cfg")
	if got := keychainServiceName(sessionServiceBaseForTest); got != want {
		t.Fatalf("相对路径 cfg 应按绝对路径 %s 计算，得到 %q，期望 %q", filepath.Join(wd, "cfg"), got, want)
	}
}

// 固定一组已知答案：冒烟脚本（Python）要按同一规则算出后缀，才能精确清掉本次的条目。
// 期望值由 hashlib.sha256(os.path.normpath(os.path.abspath("/tmp/szu-cfg/")).encode()).hexdigest()[:12] 得到。
func TestKeychainServiceNameMatchesPythonRule(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("/tmp/szu-cfg 在 Windows 上不是绝对路径；钥匙串只在 macOS 上用")
	}
	setKeychainNamespace(t, true)
	t.Setenv("SZUNET_CONFIG_DIR", "/tmp/szu-cfg/")
	if got, want := keychainServiceName(sessionServiceBaseForTest), "szunet-session-test-45c72b5fda1d"; got != want {
		t.Fatalf("后缀规则变了：得到 %q，期望 %q；冒烟脚本的清理会找不到条目", got, want)
	}
}

func TestKeychainServiceNameUnchangedWithoutConfigDir(t *testing.T) {
	setKeychainNamespace(t, true)
	t.Setenv("SZUNET_CONFIG_DIR", "")
	if got := keychainServiceName(sessionServiceBaseForTest); got != sessionServiceBaseForTest {
		t.Fatalf("没设置配置目录就是正常使用，服务名必须保持原样，得到 %q", got)
	}
}

// 服务名的基础部分在 keyring_darwin.go 里，其他平台编不进来；这里抄一份字面值，
// Linux 与 Windows CI 也能跑命名规则。darwin 上 keyring_darwin_test.go 会核对二者一致。
const (
	keychainServiceBaseForTest = "szunet"
	sessionServiceBaseForTest  = "szunet-session"
)
