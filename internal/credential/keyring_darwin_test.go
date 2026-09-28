//go:build darwin

package credential

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

// newDarwinFakeKeychain 在 darwin 上换掉 runSecurity，并把 securityBin 指向不存在的路径：
// 万一哪条路径绕过了 runSecurity，测试会失败，而不是去碰开发机上真实的钥匙串。
// 配置目录同样隔离到临时目录，session.enc 不会写进真实的 ~/.szunet。
func newDarwinFakeKeychain(t *testing.T) (*fakeKeychain, string) {
	t.Helper()
	f := newFakeKeychain(t)
	savedBin := securityBin
	securityBin = filepath.Join(t.TempDir(), "no-such-security")
	t.Cleanup(func() { securityBin = savedBin })
	cfg := filepath.Join(t.TempDir(), "cfg")
	t.Setenv("SZUNET_CONFIG_DIR", cfg)
	return f, cfg
}

// addCalls 返回对某个服务名执行过的 add-generic-password 次数。
func (f *fakeKeychain) addCalls(service string) int {
	n := 0
	for _, c := range f.calls {
		if c.args[0] == "add-generic-password" && strings.Contains(" "+strings.Join(c.args, " ")+" ", " -s "+service+" ") {
			n++
		}
	}
	return n
}

// serviceArgs 收集所有调用里 -s 后面的服务名，自检条目除外。
func (f *fakeKeychain) serviceArgs() []string {
	var out []string
	for _, c := range f.calls {
		for i, a := range c.args {
			if a == "-s" && i+1 < len(c.args) && !strings.HasPrefix(c.args[i+1], "szunet-selftest-") {
				out = append(out, c.args[i+1])
			}
		}
	}
	return out
}

var hex64 = regexp.MustCompile(`^[0-9a-f]{64}$`)

// keychain_namespace_test.go 为了在所有平台上跑，抄了一份服务名字面值；这里核对它没抄错。
func TestKeychainServiceBaseNamesMatchDarwinConstants(t *testing.T) {
	if keychainServiceBaseForTest != keychainService || sessionServiceBaseForTest != sessionService {
		t.Fatal("keychain_namespace_test.go 里的服务名与 keyring_darwin.go 不一致")
	}
}

func TestDarwinStoresUseNamespacedServiceWhenEnabled(t *testing.T) {
	f, _ := newDarwinFakeKeychain(t)
	setKeychainNamespace(t, true)
	credSvc, sessSvc := keychainServiceName(keychainService), keychainServiceName(sessionService)
	if !strings.HasPrefix(credSvc, "szunet-test-") || !strings.HasPrefix(sessSvc, "szunet-session-test-") {
		t.Fatalf("启用后服务名应带 -test- 后缀，得到 %q / %q", credSvc, sessSvc)
	}

	if err := (&darwinStore{}).Save(Credentials{Username: "000000", Password: "test-only"}); err != nil {
		t.Fatal(err)
	}
	if _, err := (&darwinStore{}).Load(); err != nil {
		t.Fatal(err)
	}
	if err := (&darwinStore{}).Delete(); err != nil {
		t.Fatal(err)
	}
	ss := &darwinSessionStore{}
	if err := ss.Save(Session{Cookie: "a=b"}); err != nil {
		t.Fatal(err)
	}
	if _, err := ss.Load(); err != nil {
		t.Fatal(err)
	}
	if err := ss.Delete(); err != nil {
		t.Fatal(err)
	}

	for _, svc := range f.serviceArgs() {
		if svc != credSvc && svc != sessSvc {
			t.Fatalf("argv 里出现了不带后缀的服务名 %q，测试会碰到真实条目", svc)
		}
	}
	if f.addCalls(credSvc) == 0 || f.addCalls(sessSvc) == 0 {
		t.Fatal("两个条目都应经带后缀的服务名写入")
	}
	if f.addCalls(keychainService) != 0 || f.addCalls(sessionService) != 0 {
		t.Fatal("真实服务名被写过")
	}
}

func TestDarwinStoresKeepPlainServiceWhenNamespaceDisabled(t *testing.T) {
	f, _ := newDarwinFakeKeychain(t)
	setKeychainNamespace(t, false)
	if err := (&darwinStore{}).Save(Credentials{Username: "000000", Password: "test-only"}); err != nil {
		t.Fatal(err)
	}
	if f.addCalls(keychainService) != 1 {
		t.Fatalf("命令行版（未启用）应沿用 %q，argv: %v", keychainService, f.serviceArgs())
	}
}

func TestDarwinSessionSaveKeepsOnlyKeyInKeychain(t *testing.T) {
	f, cfg := newDarwinFakeKeychain(t)
	ss := &darwinSessionStore{}
	cookie := strings.Repeat("JSESSIONID=test-only-value; ", 75) // 约 2KB，远超钥匙串写入上限
	if err := ss.Save(Session{Cookie: cookie, Note: "ehall"}); err != nil {
		t.Fatalf("2KB 会话保存失败: %v", err)
	}
	stored := f.items[itemKey(sessionService, sessionAccount)]
	if !hex64.MatchString(stored) {
		t.Fatalf("钥匙串里应只有 64 位十六进制密钥，实际存了 %d 字节: %.40q", len(stored), stored)
	}
	for _, c := range f.calls {
		if strings.Contains(string(c.stdin), "test-only-value") || strings.Contains(strings.Join(c.args, " "), "test-only-value") {
			t.Fatal("会话内容被交给了 security")
		}
	}
	path := filepath.Join(cfg, "session.enc")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("session.enc 没写出来: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("session.enc 权限应为 0600，得到 %v", info.Mode().Perm())
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), "test-only-value") {
		t.Fatal("session.enc 里是明文")
	}
	v, err := ss.Load()
	if err != nil || v.Cookie != cookie || v.Note != "ehall" {
		t.Fatalf("读回的会话不对（%d 字节，%v）", len(v.Cookie), err)
	}

	// 再存一次：沿用同一把密钥，只换 session.enc，不再动钥匙串条目。
	adds := f.addCalls(sessionService)
	if err := ss.Save(Session{Cookie: "a=b"}); err != nil {
		t.Fatal(err)
	}
	if f.addCalls(sessionService) != adds || f.items[itemKey(sessionService, sessionAccount)] != stored {
		t.Fatal("已有密钥时不应重写钥匙串条目")
	}
	if v, err := ss.Load(); err != nil || v.Cookie != "a=b" {
		t.Fatalf("覆盖保存后读回 %q（%v）", v.Cookie, err)
	}
}

// 升级前的版本把会话 JSON 直接存在钥匙串里；升级后要照样能读，下次保存再换成新格式。
func TestDarwinSessionLoadsLegacyJSONEntry(t *testing.T) {
	f, cfg := newDarwinFakeKeychain(t)
	f.items[itemKey(sessionService, sessionAccount)] = `{"cookie":"legacy=1","note":"旧版"}`
	ss := &darwinSessionStore{}
	v, err := ss.Load()
	if err != nil || v.Cookie != "legacy=1" || v.Note != "旧版" {
		t.Fatalf("旧格式条目读不出来: %+v（%v）", v, err)
	}
	if err := ss.Save(Session{Cookie: "new=2"}); err != nil {
		t.Fatal(err)
	}
	if !hex64.MatchString(f.items[itemKey(sessionService, sessionAccount)]) {
		t.Fatal("保存后旧格式条目应换成密钥")
	}
	if _, err := os.Stat(filepath.Join(cfg, "session.enc")); err != nil {
		t.Fatalf("保存后应有 session.enc: %v", err)
	}
	if v, err := ss.Load(); err != nil || v.Cookie != "new=2" {
		t.Fatalf("换成新格式后读回 %q（%v）", v.Cookie, err)
	}
}

func TestDarwinSessionLoadDistinguishesMissingAndCorrupt(t *testing.T) {
	f, cfg := newDarwinFakeKeychain(t)
	ss := &darwinSessionStore{}
	if _, err := ss.Load(); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("什么都没存过应为 ErrSessionNotFound，得到 %v", err)
	}
	// 有密钥、没密文：上次保存没走完，等于没有会话。
	f.items[itemKey(sessionService, sessionAccount)] = newSessionKey()
	if _, err := ss.Load(); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("有密钥没密文应为 ErrSessionNotFound，得到 %v", err)
	}
	// 密文是另一把密钥加密的：解不开，要说成「已损坏，请重新保存」，不能说成没保存过。
	other, _ := parseSessionKey(newSessionKey())
	sealed, err := sealSession(other, []byte(`{"cookie":"a=b"}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(cfg, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfg, "session.enc"), sealed, 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = ss.Load()
	if !errors.Is(err, ErrSessionStorageUnavailable) || !strings.Contains(err.Error(), "登录状态已损坏，请重新保存") {
		t.Fatalf("解密失败应包装为 ErrSessionStorageUnavailable 并提示重新保存，得到 %v", err)
	}
	// 按提示重新保存后恢复正常。
	if err := ss.Save(Session{Cookie: "c=d"}); err != nil {
		t.Fatal(err)
	}
	if v, err := ss.Load(); err != nil || v.Cookie != "c=d" {
		t.Fatalf("重新保存后读回 %q（%v）", v.Cookie, err)
	}
}

// 钥匙串被锁之类的真故障：保存时不能生成新密钥覆盖掉旧的，否则已有会话再也解不开。
func TestDarwinSessionSaveDoesNotReplaceKeyWhenKeychainUnreadable(t *testing.T) {
	f, _ := newDarwinFakeKeychain(t)
	fake := f.run
	runSecurity = func(args []string, stdin []byte) ([]byte, error) {
		if args[0] == "find-generic-password" {
			return nil, errors.New("security find-generic-password 失败: exit status 51（User interaction is not allowed）")
		}
		return fake(args, stdin)
	}
	err := (&darwinSessionStore{}).Save(Session{Cookie: "a=b"})
	if !errors.Is(err, ErrSessionStorageUnavailable) {
		t.Fatalf("钥匙串读不出来时应报存储不可用，得到 %v", err)
	}
	if f.addCalls(sessionService) != 0 {
		t.Fatal("读不出旧密钥时不应写入新密钥")
	}
}

func TestDarwinSessionDeleteRemovesBoth(t *testing.T) {
	f, cfg := newDarwinFakeKeychain(t)
	ss := &darwinSessionStore{}
	if err := ss.Save(Session{Cookie: "a=b"}); err != nil {
		t.Fatal(err)
	}
	if err := ss.Delete(); err != nil {
		t.Fatalf("删除失败: %v", err)
	}
	if _, ok := f.items[itemKey(sessionService, sessionAccount)]; ok {
		t.Fatal("钥匙串里的密钥没删掉")
	}
	if _, err := os.Stat(filepath.Join(cfg, "session.enc")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("session.enc 没删掉: %v", err)
	}
	if err := ss.Delete(); err != nil {
		t.Fatalf("两处本来都没有时应视为已删除，得到 %v", err)
	}
	if _, err := ss.Load(); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("删除后应为 ErrSessionNotFound，得到 %v", err)
	}
}

func TestDarwinSessionDeleteReportsFailures(t *testing.T) {
	f, cfg := newDarwinFakeKeychain(t)
	ss := &darwinSessionStore{}
	if err := ss.Save(Session{Cookie: "a=b"}); err != nil {
		t.Fatal(err)
	}
	fake := f.run
	runSecurity = func(args []string, stdin []byte) ([]byte, error) {
		if args[0] == "delete-generic-password" {
			return nil, errors.New("security delete-generic-password 失败: exit status 51（User interaction is not allowed）")
		}
		return fake(args, stdin)
	}
	err := ss.Delete()
	if err == nil || !strings.Contains(err.Error(), "钥匙串") {
		t.Fatalf("钥匙串删不掉时必须如实报错，得到 %v", err)
	}
	// 钥匙串那一处失败不影响另一处照删。
	if _, statErr := os.Stat(filepath.Join(cfg, "session.enc")); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatal("钥匙串删除失败时 session.enc 也应照删")
	}

	// session.enc 删不掉（这里让它变成非空目录）同样要报错。
	runSecurity = fake
	if err := os.MkdirAll(filepath.Join(cfg, "session.enc", "keep"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := ss.Delete(); err == nil || !strings.Contains(err.Error(), "登录状态文件") {
		t.Fatalf("session.enc 删不掉时必须如实报错，得到 %v", err)
	}
}

// 桌面引擎同时服务多个窗口和浏览器标签页，两次首次保存可能同时到达。会话分两处存，交错执行时
// 钥匙串里的密钥可能和 session.enc 对不上：两边都报成功，下次读取却是「已损坏」。
// 替身里每次 security 调用都停一小会儿放大交错的机会，并记下同时在跑的调用数：没加锁时这里必然大于 1。
func TestDarwinSessionConcurrentSavesStayReadable(t *testing.T) {
	f, _ := newDarwinFakeKeychain(t)
	fake := f.run
	var mu sync.Mutex
	running, most := 0, 0
	runSecurity = func(args []string, stdin []byte) ([]byte, error) {
		mu.Lock()
		running++
		most = max(most, running)
		mu.Unlock()
		time.Sleep(2 * time.Millisecond)
		mu.Lock()
		defer mu.Unlock()
		running--
		return fake(args, stdin)
	}
	const n = 8
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() { errs[i] = (&darwinSessionStore{}).Save(Session{Cookie: fmt.Sprintf("c=%d", i)}) })
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("第 %d 次并发保存失败: %v", i, err)
		}
	}
	v, err := (&darwinSessionStore{}).Load()
	if err != nil || !strings.HasPrefix(v.Cookie, "c=") {
		t.Fatalf("并发保存都报成功之后读不出会话: %q（%v）", v.Cookie, err)
	}
	if most != 1 {
		t.Fatalf("会话的读写没有串行：同时有 %d 个 security 调用在跑", most)
	}
}

func TestDarwinCredentialsTooLongNeverWritten(t *testing.T) {
	f, _ := newDarwinFakeKeychain(t)
	old := `{"username":"000000","password":"old"}`
	f.items[itemKey(keychainService, keychainAccount)] = old
	err := (&darwinStore{}).Save(Credentials{Username: "2026123456", Password: strings.Repeat("p", 100)})
	if err == nil || !strings.Contains(err.Error(), "密码过长") || !strings.Contains(err.Error(), "原有账号保持不变") {
		t.Fatalf("超长密码应明确报「密码过长……原有账号保持不变」，得到 %v", err)
	}
	for _, c := range f.calls {
		if c.args[0] == "add-generic-password" {
			t.Fatalf("超长密码被拒之前已经执行过 %v", c.args)
		}
	}
	if f.items[itemKey(keychainService, keychainAccount)] != old {
		t.Fatal("原有账号被改动了")
	}
	// 上限以内的照常保存。
	if err := (&darwinStore{}).Save(Credentials{Username: "2026123456", Password: strings.Repeat("p", 60)}); err != nil {
		t.Fatalf("60 个字符的密码应能保存: %v", err)
	}
}
