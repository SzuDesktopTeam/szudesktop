package ui

import (
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"
)

// 本包各 *_property_test.go 共用的随机工具。性质测试对随机输入检查"任何合法输入都应成立"的约束，
// 随机源用固定种子，失败时日志里有种子可以原样复现；设置 SZU_PROPERTY_SEED 可换种子。

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

// randomCJK 生成 [min, max] 个汉字：不含数字、标点和空白，不会被日期 / 标签 / 属性解析误认。
func randomCJK(r *rand.Rand, min, max int) string {
	n := min + r.Intn(max-min+1)
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteRune(rune(0x4E00 + r.Intn(0x9FA5-0x4E00)))
	}
	return b.String()
}

// randomBinary 生成任意字节串（含 0 字节、非 UTF-8）。
func randomBinary(r *rand.Rand, min, max int) string {
	b := make([]byte, min+r.Intn(max-min+1))
	for i := range b {
		b[i] = byte(r.Intn(256))
	}
	return string(b)
}
