package ui

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"fmt"
	"math/rand"
	"strings"
	"testing"
)

// casDecrypt 用标准库把 casAesString 的输出解回明文：AES-CBC 解密后按 PKCS7 去填充。
// 不复用 cas_crypto.go 的任何代码，作为独立对照。
func casDecrypt(t *testing.T, encoded, salt, iv string) string {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("输出不是合法 Base64：%v", err)
	}
	if len(raw) == 0 || len(raw)%aes.BlockSize != 0 {
		t.Fatalf("密文长度 %d 不是块的整数倍", len(raw))
	}
	block, err := aes.NewCipher([]byte(salt))
	if err != nil {
		t.Fatal(err)
	}
	plain := make([]byte, len(raw))
	cipher.NewCBCDecrypter(block, []byte(iv)).CryptBlocks(plain, raw)
	pad := int(plain[len(plain)-1])
	if pad < 1 || pad > aes.BlockSize || pad > len(plain) {
		t.Fatalf("PKCS7 填充值 %d 不合法", pad)
	}
	for _, b := range plain[len(plain)-pad:] {
		if int(b) != pad {
			t.Fatalf("PKCS7 填充字节不一致：%v", plain[len(plain)-pad:])
		}
	}
	return string(plain[:len(plain)-pad])
}

// randomCASText 生成密码 / 明文：ASCII 可见字符、空格、汉字都可能出现，长度 0~80 字节。
func randomCASText(r *rand.Rand) string {
	alphabet := []rune("abcXYZ0123456789 !@#$%^&*()_+-=[]{}|;:',.<>/?中文密码\"\\")
	var b strings.Builder
	for n := r.Intn(40); n > 0; n-- {
		b.WriteRune(alphabet[r.Intn(len(alphabet))])
	}
	return b.String()
}

// randomSalt 生成合法长度（16 / 24 / 32 字节）的盐。
func randomSalt(r *rand.Rand) string {
	n := []int{16, 24, 32}[r.Intn(3)]
	b := make([]byte, n)
	for i := range b {
		b[i] = casAlphabet[r.Intn(len(casAlphabet))]
	}
	return string(b)
}

// TestPropertyCasAesStringDecryptsToInput 性质：任意明文、任意合法盐、任意 16 字节 iv，
// casAesString 的输出解密后恰好是原明文（PKCS7 填充合法、刚好整块时也补一整块）；
// 密文长度是 (len+16)/16*16 的 Base64。
func TestPropertyCasAesStringDecryptsToInput(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		data, salt := randomCASText(r), randomSalt(r)
		iv, err := casRandomString(casIVLen)
		if err != nil {
			t.Fatal(err)
		}
		got, err := casAesString(data, salt, iv)
		if err != nil {
			t.Fatalf("第 %d 例：casAesString 报错 %v", i, err)
		}
		if back := casDecrypt(t, got, salt, iv); back != data {
			t.Fatalf("第 %d 例：解密得到 %q，期望 %q", i, back, data)
		}
		raw, _ := base64.StdEncoding.DecodeString(got)
		if want := (len(data) + aes.BlockSize) / aes.BlockSize * aes.BlockSize; len(raw) != want {
			t.Fatalf("第 %d 例：%d 字节明文的密文应为 %d 字节，实际 %d", i, len(data), want, len(raw))
		}
		// 盐或 iv 长度不对时必须报错，不能悄悄产出别的东西。
		if _, err := casAesString(data, salt[:len(salt)-1], iv); err == nil {
			t.Fatalf("第 %d 例：盐长度 %d 应报错", i, len(salt)-1)
		}
		if _, err := casAesString(data, salt, iv+"x"); err == nil {
			t.Fatalf("第 %d 例：iv 长度 17 应报错", i)
		}
	}
}

// TestPropertyCasEncryptPasswordShape 性质：casEncryptPassword 的输出用同一把盐解开后，
// 是 64 个字母表内的随机字符紧跟着原密码；每次的随机前缀都不同；密文里不含明文密码。
// 解密要用的 iv 不在输出里（服务端自己知道），所以这里穷举不了，改为验证：对固定 iv 的
// casAesString 与 casEncryptPassword 用同样的前缀长度约定，即长度恰为 (64+len+16)/16*16。
func TestPropertyCasEncryptPasswordShape(t *testing.T) {
	r := propertyRand(t)
	seen := map[string]bool{}
	for i := 0; i < propertyCases; i++ {
		password, salt := randomCASText(r), randomSalt(r)
		got, err := casEncryptPassword(password, salt)
		if err != nil {
			t.Fatalf("第 %d 例：casEncryptPassword 报错 %v", i, err)
		}
		if seen[got] {
			t.Fatalf("第 %d 例：两次加密得到同样密文，随机前缀或 iv 没生效", i)
		}
		seen[got] = true
		raw, err := base64.StdEncoding.DecodeString(got)
		if err != nil {
			t.Fatalf("第 %d 例：输出不是合法 Base64：%v", i, err)
		}
		if want := (casPrefixLen + len(password) + aes.BlockSize) / aes.BlockSize * aes.BlockSize; len(raw) != want {
			t.Fatalf("第 %d 例：密文应为 %d 字节，实际 %d", i, want, len(raw))
		}
		if len(password) >= 4 && strings.Contains(got, password) {
			t.Fatalf("第 %d 例：密文里出现了明文密码", i)
		}
		// 直接验证「前缀 + 密码」这一约定：同样的盐、自造的 iv 与前缀，解出来必须是前缀 + 密码。
		prefix, _ := casRandomString(casPrefixLen)
		iv, _ := casRandomString(casIVLen)
		enc, _ := casAesString(prefix+password, salt, iv)
		if back := casDecrypt(t, enc, salt, iv); !strings.HasPrefix(back, prefix) || back[len(prefix):] != password {
			t.Fatalf("第 %d 例：解密结果 %q 不是前缀 + 密码", i, back)
		}
	}
}

// TestPropertyCasRandomStringLengthAndAlphabet 性质：casRandomString(n) 恰好 n 个字符、
// 每个都在字母表里；n 为 0 时给空串；字母表里每个字符在足够多次采样后都出现过（拒绝采样没有漏字符）。
func TestPropertyCasRandomStringLengthAndAlphabet(t *testing.T) {
	r := propertyRand(t)
	counts := map[byte]int{}
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(100)
		s, err := casRandomString(n)
		if err != nil || len(s) != n {
			t.Fatalf("第 %d 例：casRandomString(%d) 给出 %d 个字符 %v", i, n, len(s), err)
		}
		for j := 0; j < len(s); j++ {
			if strings.IndexByte(casAlphabet, s[j]) < 0 {
				t.Fatalf("第 %d 例：出现了字母表外的字符 %q", i, s[j])
			}
			counts[s[j]]++
		}
	}
	for j := 0; j < len(casAlphabet); j++ {
		if counts[casAlphabet[j]] == 0 {
			t.Fatalf("字母表里的 %q 在约 %d 次采样里从未出现", casAlphabet[j], propertyCases*50)
		}
	}
	if s, err := casRandomString(0); err != nil || s != "" {
		t.Fatal("n=0 应给空串")
	}
	_ = fmt.Sprint(counts)
}
