//go:build darwin

// macOS 上校园网凭据和学校会话都进系统钥匙串，各占一个条目，
// 用户可以只清会话不动密码。
//
// 写入路径在 keychain_prompt.go：密码只从标准输入喂给 security，
// 不放进命令行参数——否则同机其他进程用 ps 就能看到（F21）。
// 这条路一次最多完整写入 128 字节，所以会话条目里只放密钥，
// 会话本身加密后写到 session.enc（见 session_envelope.go）。
package credential

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"sync"
)

// 钥匙串条目的标识。账号信息整体以 JSON 形式存在密码字段里，
// 钥匙串本身是加密存储的，不需要我们再套一层。
//
// 服务名一律经 keychainServiceName 取：桌面引擎在设置了 SZUNET_CONFIG_DIR 时
// 会带上 -test-<哈希> 后缀（见 keychain_namespace.go），账号名不变。
const (
	keychainService = "szunet"
	keychainAccount = "szunet"
	// 会话存成独立条目，和账号密码分开，用户可以只清会话不清密码。
	sessionService = "szunet-session"
	sessionAccount = "szunet-session"
)

// errPasswordTooLong 是账号 JSON 超过钥匙串写入上限时给用户看的话。
// 账号 JSON 的固定开销约 30 字节、学号 10 位上下，留给密码的大约 80 个字符。
var errPasswordTooLong = errors.New("密码过长（macOS 钥匙串写入上限约 80 个字符），未保存，原有账号保持不变")

// darwinStore 用 macOS 钥匙串保存凭据。
// 相比写配置文件，钥匙串受系统统一保护，还能被用户自己的钥匙串访问控制管住。
type darwinStore struct{}

func platformStore() Store { return &darwinStore{} }

// platformSessionStore 的会话密钥同样进钥匙串，单独一个条目；会话密文在 session.enc。
func platformSessionStore() SessionStore { return &darwinSessionStore{} }

type darwinSessionStore struct{}

// darwinSessionMu 让会话的读、写、删在进程内一次只走一个。会话分两处存（钥匙串里的密钥、session.enc 里的密文），
// 两次首次保存交错时，钥匙串里可能留下 B 的密钥、session.enc 却是用 A 的密钥封的：两边都报保存成功，
// 下次读取才发现「已损坏」。桌面引擎服务多个窗口和浏览器标签页，页面上的防重复只管自己那一页。
// 桌面引擎是单实例、命令行版不碰会话，进程内一把锁就够；按包级变量加锁，因为每个请求都会新建一个 store。
var darwinSessionMu sync.Mutex

// Save 把会话加密写进 session.enc，钥匙串里只留密钥。
//
// 钥匙串里已经有密钥就沿用，不重写条目：只换 session.enc 一处，而它是原子写的，
// 中途失败时旧会话仍然完整可读。只有第一次保存、或条目还是旧版的会话 JSON 时，
// 才生成新密钥写进钥匙串（-U 顺带把旧格式的条目换掉）。
func (s *darwinSessionStore) Save(v Session) error {
	darwinSessionMu.Lock()
	defer darwinSessionMu.Unlock()
	plain, err := json.Marshal(v)
	if err != nil {
		return err
	}
	path, err := sessionEnvelopePath()
	if err != nil {
		return fmt.Errorf("%w（无法确定配置目录: %v）", ErrSessionStorageUnavailable, err)
	}
	service := keychainServiceName(sessionService)
	var key []byte
	out, err := promptRead(service, sessionAccount)
	switch {
	case err == nil:
		key, _ = parseSessionKey(string(out))
	case !securityItemNotFound(err):
		// 读不出来不等于没有：钥匙串被锁时贸然生成新密钥覆盖，已有的会话就再也解不开了。
		return fmt.Errorf("%w（%v）", ErrSessionStorageUnavailable, err)
	}
	if key == nil {
		fresh := newSessionKey()
		if err := keychainSave(service, sessionAccount, []byte(fresh)); err != nil {
			return err
		}
		key, _ = parseSessionKey(fresh)
	}
	sealed, err := sealSession(key, plain)
	if err != nil {
		return fmt.Errorf("加密登录状态失败: %w", err)
	}
	if err := writeFileAtomic0600(path, sealed); err != nil {
		return fmt.Errorf("写入登录状态失败: %w", err)
	}
	return nil
}

// Load 兼容两种条目：新版是 64 位十六进制密钥（会话在 session.enc），
// 旧版直接是会话 JSON，原样读出来，下次保存时自然换成新格式。
func (s *darwinSessionStore) Load() (Session, error) {
	darwinSessionMu.Lock()
	defer darwinSessionMu.Unlock()
	out, err := promptRead(keychainServiceName(sessionService), sessionAccount)
	if err != nil {
		if securityItemNotFound(err) {
			return Session{}, ErrSessionNotFound
		}
		// 钥匙串被锁、授权被拒、security 命令不存在都是真故障。
		// 说成「没保存过」会让用户以为登录状态丢了，重存一遍还是读不出来。
		return Session{}, fmt.Errorf("%w（%v）", ErrSessionStorageUnavailable, err)
	}
	var v Session
	key, ok := parseSessionKey(string(out))
	if !ok {
		if err := json.Unmarshal(out, &v); err != nil {
			return Session{}, fmt.Errorf("钥匙串里的登录状态格式不对: %w", err)
		}
		return v, nil
	}
	path, err := sessionEnvelopePath()
	if err != nil {
		return Session{}, fmt.Errorf("%w（无法确定配置目录: %v）", ErrSessionStorageUnavailable, err)
	}
	sealed, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			// 有密钥没密文：上次保存没走完，或密文被手动删了，都等于没有可用的会话。
			return Session{}, ErrSessionNotFound
		}
		return Session{}, fmt.Errorf("%w（读取登录状态文件失败: %v）", ErrSessionStorageUnavailable, err)
	}
	plain, err := openSession(key, sealed)
	if err != nil {
		return Session{}, &sessionCorruptError{cause: err}
	}
	if err := json.Unmarshal(plain, &v); err != nil {
		return Session{}, &sessionCorruptError{cause: fmt.Errorf("内容格式不对: %v", err)}
	}
	return v, nil
}

// Delete 钥匙串条目和 session.enc 两处都删；哪一处本来就没有都算删掉了。
// 两处都会尝试，一处失败不影响另一处，但只要有一处删不掉就如实报错。
func (s *darwinSessionStore) Delete() error {
	darwinSessionMu.Lock()
	defer darwinSessionMu.Unlock()
	var errs []error
	_, err := runSecurity([]string{"delete-generic-password",
		"-a", sessionAccount,
		"-s", keychainServiceName(sessionService),
	}, nil)
	if err != nil && !securityItemNotFound(err) {
		// 删不掉就不能报成功：用户以为清干净了，会话其实还留在钥匙串里。
		errs = append(errs, fmt.Errorf("删除钥匙串里的登录状态失败: %v", err))
	}
	// 连配置目录都定不下来时，Save 也不可能在别处写过密文，没有要删的文件。
	if path, err := sessionEnvelopePath(); err == nil {
		if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			errs = append(errs, fmt.Errorf("删除登录状态文件失败: %v", err))
		}
	}
	return errors.Join(errs...)
}

func (s *darwinSessionStore) Describe() string {
	return "macOS 钥匙串（Keychain）"
}

func (s *darwinStore) Save(c Credentials) error {
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	if err := keychainSave(keychainServiceName(keychainService), keychainAccount, data); err != nil {
		if errors.Is(err, errKeychainSecretRejected) {
			return errPasswordTooLong
		}
		return err
	}
	return nil
}

func (s *darwinStore) Load() (Credentials, error) {
	out, err := promptRead(keychainServiceName(keychainService), keychainAccount)
	if err != nil {
		if securityItemNotFound(err) {
			return Credentials{}, ErrNotFound
		}
		// 读不到不等于没保存。界面据此提示「暂时无法读取已保存的账号」，
		// 而不是显示成没存过、让用户重新填一遍密码。
		return Credentials{}, fmt.Errorf("读不到钥匙串里的校园网账号: %v", err)
	}

	var c Credentials
	if err := json.Unmarshal(out, &c); err != nil {
		return Credentials{}, fmt.Errorf("钥匙串里的凭据格式不对: %w", err)
	}
	return c, nil
}

func (s *darwinStore) Delete() error {
	_, err := runSecurity([]string{"delete-generic-password",
		"-a", keychainAccount,
		"-s", keychainServiceName(keychainService),
	}, nil)
	if err != nil {
		if securityItemNotFound(err) {
			return nil // 本来就没有，等于已经删掉
		}
		// 删不掉就不能报成功，否则用户以为「忘掉账号」生效了，凭据其实还在。
		return fmt.Errorf("删除钥匙串里的校园网账号失败: %v", err)
	}
	return nil
}

func (s *darwinStore) Describe() string {
	return "macOS 钥匙串（Keychain）"
}
