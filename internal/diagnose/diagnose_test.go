package diagnose

import (
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// withProbe 把网络探测换成固定结果，测试结束后还原。
func withProbe(t *testing.T, d portal.DetectResult) {
	t.Helper()
	old := probe
	probe = func() *portal.DetectResult {
		cp := d
		cp.Notes = append([]string(nil), d.Notes...)
		return &cp
	}
	t.Cleanup(func() { probe = old })
}

// TestDesktopAdvicesHaveNoCLIFlags 守住桌面版诊断的建议必须能照做。
//
// 桌面版没有指定认证服务器 IP 的入口，选区在登录页的「所在区域」里。
// 以前 Advices 里直接写「用 --ip 直接指定服务器地址」「不对就用 --zone teaching」，
// 桌面用户看到的是一条执行不了的命令行建议。
func TestDesktopAdvicesHaveNoCLIFlags(t *testing.T) {
	cases := []portal.DetectResult{
		// 开着代理、域名被抢走解析，是注释里反复点名的高频场景。
		{Zone: portal.ZoneTeaching, Probed: true, TeachPortalOK: true, SrunUsable: true},
		{Zone: portal.ZoneOutside, Probed: true},
		{Zone: portal.ZoneDorm, Probed: true, DormPortalOK: true, TeachPortalOK: true, SrunUsable: true, DormUsable: true},
		{Zone: portal.ZoneOnline, InternetOK: true, Probed: true, SrunUsable: true, DormUsable: true},
	}
	for _, d := range cases {
		withProbe(t, d)
		for _, a := range Run("", "", "", "").Advices {
			if strings.Contains(a, "--") {
				t.Errorf("桌面版建议里出现了命令行参数（探测结果 %+v）：%s", d, a)
			}
		}
	}
}

// TestCLIAdvicesKeepFlagHints 命令行版显式打开 CLIHints 后，--ip / --zone 的提示要还在。
func TestCLIAdvicesKeepFlagHints(t *testing.T) {
	withProbe(t, portal.DetectResult{Zone: portal.ZoneTeaching, Probed: true, TeachPortalOK: true, SrunUsable: true})
	joined := strings.Join(RunWithOptions("", "", "", "", Options{CLIHints: true}).Advices, "\n")
	if !strings.Contains(joined, "--ip") {
		t.Fatalf("域名解析失败时，命令行版应该提示 --ip：\n%s", joined)
	}

	withProbe(t, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true, SrunDNSOK: true, Probed: true, SrunUsable: true, DormUsable: true})
	joined = strings.Join(RunWithOptions("", "", "", "", Options{CLIHints: true}).Advices, "\n")
	if !strings.Contains(joined, "--zone teaching") {
		t.Fatalf("两套指纹都有时，命令行版应该提示 --zone teaching：\n%s", joined)
	}
	desktop := strings.Join(Run("", "", "", "").Advices, "\n")
	if !strings.Contains(desktop, "所在区域") {
		t.Fatalf("桌面版应该指向登录页的「所在区域」：\n%s", desktop)
	}
}

// TestFingerprintAdviceAgreesWithNotes 守住「同一份报告不能前后矛盾」。
//
// 以前掉线预判在 portal（Notes）和 diagnose（Advices）各写了一份：两个门户都通、
// 但两种指纹都探不到时，Notes 说「掉线后按宿舍区处理」，Advices 却说「判不出来」。
// 真掉线后 classify 判的是宿舍区，所以 Advices 是错的。
// 这里把四个探测字段的 16 种组合全跑一遍，两边必须给出同一个结论。
func TestFingerprintAdviceAgreesWithNotes(t *testing.T) {
	for mask := range 16 {
		d := portal.DetectResult{
			Zone:          portal.ZoneOnline,
			InternetOK:    true,
			SrunDNSOK:     true,
			Probed:        true,
			SrunUsable:    mask&1 != 0,
			DormUsable:    mask&2 != 0,
			DormPortalOK:  mask&4 != 0,
			TeachPortalOK: mask&8 != 0,
		}
		zone, _ := portal.PredictDropZone(&d)
		advice := fingerprintAdvice(&d, Options{})

		switch zone {
		case portal.ZoneTeaching, portal.ZoneDorm:
			if !strings.Contains(advice, zone.Label()) || strings.Contains(advice, "判不出") {
				t.Errorf("%+v：预判是 %s，建议却是 %q", d, zone.Label(), advice)
			}
		default:
			if !strings.Contains(advice, "判不出") {
				t.Errorf("%+v：两个门户都探不到，建议应该说判不出区，实际 %q", d, advice)
			}
		}

		// 掉线后真去登录时，AuthenticationZone 按指纹选协议；有指纹的格子里
		// 它选的协议必须和预判一致。
		dropped := d
		dropped.InternetOK = false
		if got := dropped.AuthenticationZone(); zone != portal.ZoneOutside && got != portal.ZoneUnknown && got != zone {
			t.Errorf("%+v：预判 %s，掉线后按指纹认证却走 %s", d, zone, got)
		}
	}
}

// TestNoFingerprintBothPortalsPredictsDorm 是上面那条规则里真踩过的那一格，单独钉死。
func TestNoFingerprintBothPortalsPredictsDorm(t *testing.T) {
	d := &portal.DetectResult{InternetOK: true, Probed: true, DormPortalOK: true, TeachPortalOK: true}
	advice := fingerprintAdvice(d, Options{})
	if !strings.Contains(advice, "宿舍区") || strings.Contains(advice, "判不出") {
		t.Fatalf("两个门户都通、没有指纹时，掉线后按宿舍区处理，建议却是 %q", advice)
	}
}
