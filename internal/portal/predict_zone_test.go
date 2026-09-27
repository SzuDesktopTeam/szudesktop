package portal

import (
	"strings"
	"testing"
)

// TestPredictDropZoneIsTheOnlyRule 守住「判区规则只有一份」。
//
// 未联网时的 classify 和联网时「万一掉线」的预判（zoneFingerprintNote）
// 都从 PredictDropZone 取结论。四个探测字段的 16 种组合全跑一遍：
// 两边给出的区必须相同，预判说明里也必须点出同一个区。
func TestPredictDropZoneIsTheOnlyRule(t *testing.T) {
	for mask := range 16 {
		r := DetectResult{
			Probed:        true,
			SrunUsable:    mask&1 != 0,
			DormUsable:    mask&2 != 0,
			DormPortalOK:  mask&4 != 0,
			TeachPortalOK: mask&8 != 0,
		}
		want, reason := PredictDropZone(&r)
		if reason == "" {
			t.Errorf("%+v：预判要带上依据", r)
		}

		offline := r
		if got := classify(&offline); got != want {
			t.Errorf("%+v：classify 判 %s，预判却是 %s", r, got, want)
		}

		note := zoneFingerprintNote(&r)
		if want == ZoneOutside {
			if !strings.Contains(note, "判不出") {
				t.Errorf("%+v：门户都探不到时应说判不出区，实际 %q", r, note)
			}
			continue
		}
		if !strings.Contains(note, zoneShortName(want)) || strings.Contains(note, "判不出") {
			t.Errorf("%+v：预判是 %s，说明却是 %q", r, want, note)
		}
	}
}

// TestNotesHaveNoCLIFlags Notes 会原样出现在桌面版的诊断里（/api/diag），
// 所以不能写成只有命令行版才有的 --zone / --ip。
//
// 四个探测字段、外网通不通、域名能不能解析，64 种组合全跑一遍，
// 走的是 Detect / Probe 共用的 concludeProbe。
func TestNotesHaveNoCLIFlags(t *testing.T) {
	for mask := range 64 {
		r := DetectResult{
			Probed:        true,
			SrunUsable:    mask&1 != 0,
			DormUsable:    mask&2 != 0,
			DormPortalOK:  mask&4 != 0,
			TeachPortalOK: mask&8 != 0,
			InternetOK:    mask&16 != 0,
			SrunDNSOK:     mask&32 != 0,
		}
		concludeProbe(&r)
		if len(r.Notes) == 0 {
			t.Fatalf("%+v：应该有探测说明", r)
		}
		for _, n := range r.Notes {
			if strings.Contains(n, "--") {
				t.Fatalf("%+v：探测说明里出现了命令行参数：%s", r, n)
			}
		}
		if !r.SrunDNSOK && !strings.Contains(strings.Join(r.Notes, " "), "解析不出来") {
			t.Fatalf("%+v：域名解析失败时要提醒", r)
		}
	}
}
