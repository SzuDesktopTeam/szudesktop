package credential

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testSessionKey(t *testing.T) []byte {
	t.Helper()
	key, ok := parseSessionKey(newSessionKey())
	if !ok {
		t.Fatal("newSessionKey 生成的密钥自己都认不出来")
	}
	return key
}

func TestSessionKeyIsLowercaseHexWithinKeychainLimit(t *testing.T) {
	k := newSessionKey()
	if len(k) != 64 || strings.ToLower(k) != k || len(k) > maxKeychainSecret {
		t.Fatalf("密钥应为 64 位小写十六进制且不超过钥匙串写入上限，得到 %q", k)
	}
	if err := checkKeychainSecret([]byte(k)); err != nil {
		t.Fatalf("密钥过不了钥匙串写入检查: %v", err)
	}
	if newSessionKey() == k {
		t.Fatal("两次生成了同一把密钥，随机源没起作用")
	}
	// 旧版条目是会话 JSON，大写十六进制或长度不对的也都不是我们写的密钥。
	for _, bad := range []string{`{"cookie":"a=b"}`, strings.ToUpper(k), k[:63], k + "0", strings.Repeat("g", 64)} {
		if _, ok := parseSessionKey(bad); ok {
			t.Fatalf("%q 被误认成了会话密钥", bad)
		}
	}
}

func TestSessionEnvelopeRoundTrip(t *testing.T) {
	key := testSessionKey(t)
	// 2KB 的 Cookie 正是钥匙串直接存不下、才需要信封加密的那种长度。
	for _, plain := range [][]byte{[]byte(`{"cookie":"a=b"}`), []byte(`{"cookie":"` + strings.Repeat("k=v; ", 410) + `"}`)} {
		sealed, err := sealSession(key, plain)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.HasPrefix(sealed, []byte("SZUS1")) {
			t.Fatalf("密文开头应是魔数 SZUS1，得到 %q", sealed[:5])
		}
		if bytes.Contains(sealed, []byte("k=v")) || bytes.Contains(sealed, []byte("a=b")) {
			t.Fatal("密文里能直接看到 Cookie")
		}
		got, err := openSession(key, sealed)
		if err != nil {
			t.Fatalf("%d 字节的会话解不回来: %v", len(plain), err)
		}
		if !bytes.Equal(got, plain) {
			t.Fatalf("解出来的内容与原文不一致（%d 字节 → %d 字节）", len(plain), len(got))
		}
	}
	a, _ := sealSession(key, []byte("same"))
	b, _ := sealSession(key, []byte("same"))
	if bytes.Equal(a, b) {
		t.Fatal("同一把密钥加密两次得到相同密文：nonce 没有随机化，GCM 会被攻破")
	}
}

func TestSessionEnvelopeRejectsTamperingAndWrongKey(t *testing.T) {
	key := testSessionKey(t)
	sealed, err := sealSession(key, []byte(`{"cookie":"a=b"}`))
	if err != nil {
		t.Fatal(err)
	}
	for i := range sealed {
		flipped := append([]byte(nil), sealed...)
		flipped[i] ^= 0x01
		if _, err := openSession(key, flipped); err == nil {
			t.Fatalf("改掉第 %d 个字节后仍然解密成功，完整性校验没起作用", i)
		}
	}
	if _, err := openSession(testSessionKey(t), sealed); err == nil {
		t.Fatal("换一把密钥也能解开")
	}
	for _, short := range [][]byte{nil, sealed[:5], sealed[:len(sealed)-1]} {
		if _, err := openSession(key, short); err == nil {
			t.Fatalf("截断到 %d 字节的密文竟然解开了", len(short))
		}
	}
	if _, err := sealSession(key[:16], []byte("x")); err == nil {
		t.Fatal("只接受 AES-256 的 32 字节密钥")
	}
}

func TestWriteFileAtomic0600(t *testing.T) {
	parent := filepath.Join(t.TempDir(), "cfg")
	path := filepath.Join(parent, "session.enc")
	if err := writeFileAtomic0600(path, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic0600(path, []byte("second")); err != nil {
		t.Fatalf("覆盖已有文件失败: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "second" {
		t.Fatalf("读回 %q（%v），期望 second", got, err)
	}
	entries, err := os.ReadDir(parent)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "session.enc" {
		names := []string{}
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("原子写之后目录里应只剩 session.enc，实际有 %v", names)
	}
	// Windows 的文件权限不走 Unix 位，这两条只在 Unix 上有意义。
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("session.enc 的权限应为 0600，得到 %v（%v）", info.Mode().Perm(), err)
		}
		if info, err := os.Stat(parent); err != nil || info.Mode().Perm() != 0o700 {
			t.Fatalf("新建的配置目录权限应为 0700，得到 %v（%v）", info.Mode().Perm(), err)
		}
	}
}

// rename 失败时临时文件要清掉，目标保持原样，不能在配置目录里越积越多。
func TestWriteFileAtomic0600LeavesNoTempOnFailure(t *testing.T) {
	parent := t.TempDir()
	// 目标是一个非空目录，rename 一定失败。
	target := filepath.Join(parent, "session.enc")
	if err := os.MkdirAll(filepath.Join(target, "keep"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic0600(target, []byte("data")); err == nil {
		t.Fatal("目标是非空目录时 rename 应失败")
	}
	entries, err := os.ReadDir(parent)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() != "session.enc" {
			t.Fatalf("失败后留下了临时文件 %s", e.Name())
		}
	}
}

func TestSessionCorruptErrorIsStorageUnavailable(t *testing.T) {
	err := error(&sessionCorruptError{cause: os.ErrInvalid})
	if !strings.Contains(err.Error(), "登录状态已损坏，请重新保存") {
		t.Fatalf("文字要告诉用户重新保存，得到 %v", err)
	}
	if !errors.Is(err, ErrSessionStorageUnavailable) || !errors.Is(err, os.ErrInvalid) {
		t.Fatal("调用方要能按 ErrSessionStorageUnavailable 认出它，也要能看到原因")
	}
}
