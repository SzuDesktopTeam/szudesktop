package credential

// 学校会话在 macOS 上的信封加密。
//
// 为什么不直接把会话塞进钥匙串：security 的提示输入一行最多收 128 字节
// （见 maxKeychainSecret），而 ehall 的 Cookie 动辄一两千字节，整段写进去
// 只会被截断。所以钥匙串里只放一把随机的 AES-256 密钥（64 位十六进制，
// 远在上限以内），会话本身用它加密后写到配置目录的 session.enc。
// 密文单独拿走解不开，密钥仍由钥匙串保护，和以前「会话只在钥匙串里」同一规格。
//
// 这里全是纯函数、没有构建标签，Linux 与 Windows CI 也能测到加解密和原子写；
// 真正把它和钥匙串接起来的只有 keyring_darwin.go。

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const (
	// sessionEnvelopeMagic 放在文件开头，认出这是哪一版格式；以后换格式时旧文件能被明确拒绝。
	sessionEnvelopeMagic = "SZUS1"
	// sessionEnvelopeAAD 把密文绑定到「学校会话 v1」这个用途上，同一把密钥加密的别的东西不能冒充它。
	sessionEnvelopeAAD  = "szunet-session-v1"
	sessionKeyBytes     = 32
	sessionNonceBytes   = 12
	sessionEnvelopeFile = "session.enc"
)

// sessionEnvelopePath 返回会话密文的位置，和其他配置一样跟着 SZUNET_CONFIG_DIR 走。
func sessionEnvelopePath() (string, error) {
	d, err := dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, sessionEnvelopeFile), nil
}

// newSessionKey 生成一把新的会话密钥，以 64 位小写十六进制表示。
// 十六进制只含 0-9a-f，不会有换行，长度也远低于钥匙串写入上限。
func newSessionKey() string {
	b := make([]byte, sessionKeyBytes)
	// Go 1.24 起 crypto/rand.Read 不返回错误：系统随机源不可用时直接终止进程，不会给出弱密钥。
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// parseSessionKey 只认 64 位小写十六进制。旧版本在钥匙串里存的是会话 JSON，
// 以 '{' 开头，不会被误认成密钥。
func parseSessionKey(s string) ([]byte, bool) {
	if len(s) != sessionKeyBytes*2 {
		return nil, false
	}
	for i := 0; i < len(s); i++ {
		if c := s[i]; (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return nil, false
		}
	}
	key, err := hex.DecodeString(s)
	if err != nil {
		return nil, false
	}
	return key, true
}

func sessionAEAD(key []byte) (cipher.AEAD, error) {
	if len(key) != sessionKeyBytes {
		return nil, fmt.Errorf("会话密钥长度不对（%d 字节）", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// sealSession 用 AES-256-GCM 加密会话，输出「魔数 + 12 字节随机 nonce + 密文（含认证标签）」。
// 每次都用新的随机 nonce：同一把密钥会被反复用来保存会话，nonce 重复会直接破坏 GCM。
func sealSession(key, plain []byte) ([]byte, error) {
	aead, err := sessionAEAD(key)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, sessionNonceBytes)
	_, _ = rand.Read(nonce)
	out := make([]byte, 0, len(sessionEnvelopeMagic)+len(nonce)+len(plain)+aead.Overhead())
	out = append(out, sessionEnvelopeMagic...)
	out = append(out, nonce...)
	return aead.Seal(out, nonce, plain, []byte(sessionEnvelopeAAD)), nil
}

// openSession 解开 sealSession 的输出。密钥不对、内容被改过、文件被截断，一律报错，
// 不会返回半截明文。
func openSession(key, data []byte) ([]byte, error) {
	aead, err := sessionAEAD(key)
	if err != nil {
		return nil, err
	}
	head := len(sessionEnvelopeMagic) + sessionNonceBytes
	if len(data) < head+aead.Overhead() || string(data[:len(sessionEnvelopeMagic)]) != sessionEnvelopeMagic {
		return nil, errors.New("登录状态文件格式不对")
	}
	plain, err := aead.Open(nil, data[len(sessionEnvelopeMagic):head], data[head:], []byte(sessionEnvelopeAAD))
	if err != nil {
		return nil, errors.New("登录状态解密失败（密钥不匹配或文件被改动）")
	}
	return plain, nil
}

// sessionCorruptError 表示钥匙串里有密钥、但 session.enc 解不开或解出来不是会话。
//
// 它仍然属于 ErrSessionStorageUnavailable（调用方按「存储出了故障」处理，不说成没保存过），
// 但文字要告诉用户该做什么：重新保存一次就好，而不是去修系统安全存储。
type sessionCorruptError struct{ cause error }

func (e *sessionCorruptError) Error() string {
	return "登录状态已损坏，请重新保存（" + e.cause.Error() + "）"
}

func (e *sessionCorruptError) Unwrap() []error {
	return []error{ErrSessionStorageUnavailable, e.cause}
}

// writeFileAtomic0600 先写同目录下的临时文件、fsync，再 rename 覆盖目标。
//
// 为什么要原子写：保存到一半断电或被杀，直接覆盖会留下半截密文，
// 下次读就成了「已损坏」；rename 保证目标要么是旧的完整文件，要么是新的。
// 临时文件由 CreateTemp 以 0600 创建，rename 后目标同样只有本用户能读。
func writeFileAtomic0600(path string, data []byte) (err error) {
	d := filepath.Dir(path)
	if err := os.MkdirAll(d, 0o700); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}
	f, err := os.CreateTemp(d, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer func() {
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmp)
		}
	}()
	if _, err = f.Write(data); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
