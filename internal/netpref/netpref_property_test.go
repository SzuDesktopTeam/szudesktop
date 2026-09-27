package netpref

import (
	"fmt"
	"math/rand"
	"os"
	"reflect"
	"strconv"
	"testing"
)

// 性质测试：把 Prefs 当成「网络标识 → ac_id」的一张表，对随机的写 / 删 / 落盘 / 重读序列，
// 检查它始终和一份最简单的 map 模型一致。随机源用固定种子，失败时日志里有种子可复现；
// 设置 SZU_PROPERTY_SEED 可换种子。

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

// randomNetKey 生成各种形态的网络标识：网关 IP、IPv6 带 zone、带空格、非 ASCII，偶尔给空串。
func randomNetKey(r *rand.Rand) string {
	switch r.Intn(7) {
	case 0:
		return ""
	case 1:
		return fmt.Sprintf("192.168.%d.1", r.Intn(4))
	case 2:
		return fmt.Sprintf("172.27.%d.1", r.Intn(4))
	case 3:
		return "fe80::1%eth" + strconv.Itoa(r.Intn(3))
	case 4:
		return " 10.0.0.1 " // 键原样保存，不做归一
	case 5:
		return "热点-" + strconv.Itoa(r.Intn(3))
	default:
		return `key "with" quotes\` + strconv.Itoa(r.Intn(3))
	}
}

// TestPropertyPrefsMatchMapModelAcrossSaveAndLoad 性质：任意 SetAcID / DeleteAcID / Save+Load
// 序列之后，AcIDFor 的结果与 map 模型逐键一致；空键或空值的 SetAcID 不改变任何东西；
// 落盘再读回不丢键、不改值、不多出键。
func TestPropertyPrefsMatchMapModelAcrossSaveAndLoad(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	r := propertyRand(t)
	model := map[string]string{}
	p := Load()
	for i := 0; i < propertyCases; i++ {
		key := randomNetKey(r)
		switch r.Intn(5) {
		case 0, 1:
			acID := ""
			if r.Intn(6) != 0 {
				acID = strconv.Itoa(1 + r.Intn(20))
			}
			p.SetAcID(key, acID)
			if key != "" && acID != "" {
				model[key] = acID
			}
		case 2:
			p.DeleteAcID(key)
			delete(model, key)
		case 3:
			if err := p.Save(); err != nil {
				t.Fatalf("第 %d 步：保存失败 %v", i, err)
			}
			p = Load()
		}
		if !reflect.DeepEqual(p.AcID, model) {
			t.Fatalf("第 %d 步：表与模型不一致\n实际 %v\n模型 %v", i, p.AcID, model)
		}
		if got := p.AcIDFor(key); got != model[key] {
			t.Fatalf("第 %d 步：AcIDFor(%q) = %q，模型 %q", i, key, got, model[key])
		}
	}
	// 最后一次落盘再读回，模型必须完整还原。
	if err := p.Save(); err != nil {
		t.Fatal(err)
	}
	if again := Load(); !reflect.DeepEqual(again.AcID, model) {
		t.Fatalf("重读后与模型不一致\n实际 %v\n模型 %v", again.AcID, model)
	}
}

// TestPropertyNilAndEmptyPrefsAreSafe 性质：nil 的 *Prefs 和零值 Prefs 上所有方法都不 panic，
// 读到的都是空串；零值上 SetAcID 会自己建表。
func TestPropertyNilAndEmptyPrefsAreSafe(t *testing.T) {
	r := propertyRand(t)
	var nilPrefs *Prefs
	for i := 0; i < propertyCases; i++ {
		key := randomNetKey(r)
		nilPrefs.SetAcID(key, "1")
		nilPrefs.DeleteAcID(key)
		if nilPrefs.AcIDFor(key) != "" {
			t.Fatalf("第 %d 例：nil Prefs 读出了值", i)
		}
		var zero Prefs
		if zero.AcIDFor(key) != "" {
			t.Fatalf("第 %d 例：零值 Prefs 读出了值", i)
		}
		zero.DeleteAcID(key)
		zero.SetAcID(key, "7")
		if want := ""; key != "" {
			want = "7"
			if zero.AcIDFor(key) != want {
				t.Fatalf("第 %d 例：零值 Prefs 写入后读不到", i)
			}
		}
	}
}

// TestPropertyLoadToleratesAnyFileContent 性质：缓存文件里无论是什么字节，Load 都返回可用的空表
// 或部分表，绝不 panic、绝不返回 nil；文件是合法 JSON 但 ac_id 形状不对时同样按空表处理。
func TestPropertyLoadToleratesAnyFileContent(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	r := propertyRand(t)
	shapes := []string{
		`{"ac_id": null}`, `{"ac_id": []}`, `{"ac_id": {"k": 1}}`, `{"ac_id": "12"}`, `[]`, `null`, `123`, ``, `{`,
		`{"ac_id": {"192.168.1.1": "12"}, "extra": true}`,
	}
	for i := 0; i < propertyCases; i++ {
		var content []byte
		if r.Intn(2) == 0 {
			content = []byte(shapes[r.Intn(len(shapes))])
		} else {
			content = make([]byte, r.Intn(64))
			for j := range content {
				content[j] = byte(r.Intn(256))
			}
		}
		if err := os.WriteFile(dir+"/netpref.json", content, 0o600); err != nil {
			t.Fatal(err)
		}
		p := Load()
		if p == nil || p.AcID == nil {
			t.Fatalf("第 %d 例：Load 返回了 nil 表（文件内容 %q）", i, content)
		}
		for k, v := range p.AcID {
			if k == "" || v == "" {
				t.Fatalf("第 %d 例：读出了空键或空值 %q=%q", i, k, v)
			}
		}
	}
}
