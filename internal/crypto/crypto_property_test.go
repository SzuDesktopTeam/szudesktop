package crypto

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"math/rand"
	"os"
	"strconv"
	"testing"
)

// 本文件是性质测试：不挑具体用例，而是对随机输入检查"任何合法输入都应成立"的约束。
// 随机源用固定种子，失败时日志里有种子，可以原样复现；设置 SZU_PROPERTY_SEED 可换种子。

const propertyCases = 400

func propertyRand(t *testing.T) *rand.Rand {
	t.Helper()
	seed := int64(20260928)
	if s := os.Getenv("SZU_PROPERTY_SEED"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			seed = v
		}
	}
	t.Logf("随机种子 seed=%d（可用 SZU_PROPERTY_SEED 覆盖）", seed)
	return rand.New(rand.NewSource(seed))
}

// randomBytes 生成 [min, max] 字节的任意二进制串（包括 0 字节和非 UTF-8）。
func randomBytes(r *rand.Rand, min, max int) string {
	b := make([]byte, min+r.Intn(max-min+1))
	for i := range b {
		b[i] = byte(r.Intn(256))
	}
	return string(b)
}

// referenceXEncode 按深澜门户 JS 里 xEncode 的原始写法（sencode / lencode / MX 三段）
// 独立改写一份，不复用 xencode.go 的任何代码。Go 里 & 的优先级高于 +，而 JS 里相反，
// 这类移植错误只会在特定长度、特定字节上露头，所以拿随机输入对照。
func referenceXEncode(content, key string) string {
	if content == "" {
		return ""
	}
	pack := func(s string, withLen bool) []uint32 {
		words := make([]uint32, (len(s)+3)/4, (len(s)+3)/4+1)
		for i := 0; i < len(s); i++ {
			words[i/4] |= uint32(s[i]) << (8 * uint(i%4))
		}
		if withLen {
			words = append(words, uint32(len(s)))
		}
		return words
	}
	v := pack(content, true)
	k := pack(key, false)
	for len(k) < 4 {
		k = append(k, 0)
	}
	n := len(v) - 1
	rounds := 6 + 52/(n+1)
	const delta uint32 = 0x9E3779B9
	mx := func(y, z, sum, kw uint32) uint32 {
		return (z>>5 ^ y<<2) + ((y>>3 ^ z<<4) ^ (sum ^ y)) + (kw ^ z)
	}
	var sum uint32
	z := v[n]
	for ; rounds > 0; rounds-- {
		sum += delta
		e := int(sum>>2) & 3
		for p := 0; p < n; p++ {
			y := v[p+1]
			v[p] += mx(y, z, sum, k[(p&3)^e])
			z = v[p]
		}
		y := v[0]
		v[n] += mx(y, z, sum, k[(n&3)^e])
		z = v[n]
	}
	out := make([]byte, 0, 4*len(v))
	for _, w := range v {
		out = append(out, byte(w), byte(w>>8), byte(w>>16), byte(w>>24))
	}
	return string(out)
}

// TestPropertyEncodeMatchesReferenceForAnyLength 性质：任意明文（含长度不是 4 的倍数、
// 含 0 字节）配任意 challenge（含空、含超过 16 字节），Encode 与独立改写的参考实现逐字节一致，
// 且输出长度恒为 4*(ceil(len/4)+1)。已知向量只覆盖 12 字节明文 + 12 字节密钥这一种形状。
func TestPropertyEncodeMatchesReferenceForAnyLength(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		content := randomBytes(r, 1, 120)
		key := randomBytes(r, 0, 40)
		got := Encode(content, key)
		if want := referenceXEncode(content, key); got != want {
			t.Fatalf("第 %d 例：Encode 与参考实现不一致\n明文 %q\n密钥 %q\n实际 %x\n期望 %x", i, content, key, got, want)
		}
		if wantLen := 4 * ((len(content)+3)/4 + 1); len(got) != wantLen {
			t.Fatalf("第 %d 例：%d 字节明文加密后应为 %d 字节，实际 %d", i, len(content), wantLen, len(got))
		}
	}
	if Encode("", randomBytes(r, 0, 16)) != "" {
		t.Fatal("空明文应加密成空串")
	}
}

// TestPropertyEncodeIsDeterministicAndKeySensitive 性质：同样输入两次结果相同；
// 换一个不同的 challenge，密文必须变化（否则加密等于没做）。
func TestPropertyEncodeIsDeterministicAndKeySensitive(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		content := randomBytes(r, 1, 64)
		key := randomBytes(r, 1, 16)
		other := randomBytes(r, 1, 16)
		if other == key {
			continue
		}
		if Encode(content, key) != Encode(content, key) {
			t.Fatalf("第 %d 例：同样输入两次结果不同", i)
		}
		// 密钥只用前 16 字节，两个密钥前 16 字节相同时密文自然相同，不算反例。
		if pad(key) != pad(other) && Encode(content, key) == Encode(content, other) {
			t.Fatalf("第 %d 例：密钥 %q 与 %q 给出同样密文，明文 %q", i, key, other, content)
		}
	}
}

// pad 取密钥实际参与运算的部分：前 16 字节，不足补 0。
func pad(key string) string {
	b := []byte(key)
	if len(b) > 16 {
		b = b[:16]
	}
	for len(b) < 16 {
		b = append(b, 0)
	}
	return string(b)
}

// TestPropertyBase64AlphaSetRoundTrip 性质：深澜字母表的 Base64 能用同一字母表解回原文，
// 且与标准编码的差别只是字母表换了（长度、填充位置一致）。
func TestPropertyBase64AlphaSetRoundTrip(t *testing.T) {
	r := propertyRand(t)
	enc := base64.NewEncoding(SrunAlphaSet)
	const std = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	for i := 0; i < propertyCases; i++ {
		data := []byte(randomBytes(r, 0, 100))
		got := Base64WithAlphaSet(data, SrunAlphaSet)
		back, err := enc.DecodeString(got)
		if err != nil || string(back) != string(data) {
			t.Fatalf("第 %d 例：深澜 Base64 解不回原文：%v", i, err)
		}
		want := base64.StdEncoding.EncodeToString(data)
		if len(got) != len(want) {
			t.Fatalf("第 %d 例：长度与标准 Base64 不一致 %d != %d", i, len(got), len(want))
		}
		if Base64WithAlphaSet(data, std) != want {
			t.Fatalf("第 %d 例：标准字母表下应与 encoding/base64 一致", i)
		}
		for j := range got {
			if (got[j] == '=') != (want[j] == '=') {
				t.Fatalf("第 %d 例：填充位置与标准 Base64 不一致：%q vs %q", i, got, want)
			}
		}
	}
}

// TestPropertyHashesMatchStdlib 性质：HMACMD5Hex 是「密码当数据、challenge 当密钥」的
// HMAC-MD5 小写十六进制；SHA1Hex 是标准 SHA1 小写十六进制。
func TestPropertyHashesMatchStdlib(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		data := randomBytes(r, 0, 64)
		key := randomBytes(r, 0, 64)
		mac := hmac.New(md5.New, []byte(key))
		mac.Write([]byte(data))
		if got, want := HMACMD5Hex(data, key), hex.EncodeToString(mac.Sum(nil)); got != want {
			t.Fatalf("第 %d 例：HMACMD5Hex(%q, %q) = %s，期望 %s", i, data, key, got, want)
		}
		sum := sha1.Sum([]byte(data))
		if got, want := SHA1Hex(data), hex.EncodeToString(sum[:]); got != want {
			t.Fatalf("第 %d 例：SHA1Hex(%q) = %s，期望 %s", i, data, got, want)
		}
	}
}
