package portal

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
)

// withLookup 把域名解析换成固定结果，测试结束后还原；返回被查过的域名。
func withLookup(t *testing.T, fn func(host string) ([]net.IP, error)) *[]string {
	t.Helper()
	var asked []string
	old := lookupIP
	lookupIP = func(_ context.Context, host string) ([]net.IP, error) {
		asked = append(asked, host)
		return fn(host)
	}
	t.Cleanup(func() { lookupIP = old })
	return &asked
}

// Fake-IP 段是 198.18.0.0/15，两头都要卡准：错把真实地址当假地址，会让在校内正常的同学去改代理。
func TestIsFakeIPBoundaries(t *testing.T) {
	for _, tc := range []struct {
		ip   string
		want bool
	}{
		{"198.17.255.255", false},
		{"198.18.0.0", true},
		{"198.18.0.167", true}, // 维护机上实测到的 net.szu.edu.cn
		{"198.19.255.255", true},
		{"198.20.0.0", false},
		{"172.30.255.42", false},
		{"::ffff:198.18.1.20", true},
		{"2001:db8::1", false},
	} {
		if got := isFakeIP(net.ParseIP(tc.ip)); got != tc.want {
			t.Errorf("isFakeIP(%s) = %v，期望 %v", tc.ip, got, tc.want)
		}
	}
	if isFakeIP(nil) {
		t.Error("空地址不能算 Fake-IP")
	}
}

func TestIsSchoolHost(t *testing.T) {
	for host, want := range map[string]bool{
		"net.szu.edu.cn":      true,
		"EHALL.SZU.EDU.CN.":   true,
		"szu.edu.cn":          true,
		"notszu.edu.cn":       false,
		"szu.edu.cn.evil.com": false,
		"192.168.197.131":     false,
		"":                    false,
	} {
		if got := IsSchoolHost(host); got != want {
			t.Errorf("IsSchoolHost(%q) = %v，期望 %v", host, got, want)
		}
	}
}

// 学校域名解析进 198.18.0.0/15 才报；解析不出来、解析到真实地址、不是学校域名都不报，
// 不是学校域名时连 DNS 都不查。
func TestSchoolHostFakeIP(t *testing.T) {
	answers := map[string][]net.IP{
		"ehall.szu.edu.cn":   {net.ParseIP("198.18.1.20")},
		"swzx.szu.edu.cn":    {net.ParseIP("210.39.3.164")},
		"github.com":         {net.ParseIP("198.18.0.9")},
		"mixed.szu.edu.cn":   {net.ParseIP("2001:db8::1"), net.ParseIP("198.19.0.1")},
		"missing.szu.edu.cn": nil,
	}
	asked := withLookup(t, func(host string) ([]net.IP, error) {
		if ips := answers[host]; ips != nil {
			return ips, nil
		}
		return nil, errors.New("no such host")
	})
	for host, want := range map[string]bool{
		"ehall.szu.edu.cn":   true,
		"mixed.szu.edu.cn":   true,
		"swzx.szu.edu.cn":    false,
		"missing.szu.edu.cn": false,
		"github.com":         false,
		"192.168.197.131":    false,
	} {
		if got := SchoolHostFakeIP(host); got != want {
			t.Errorf("SchoolHostFakeIP(%q) = %v，期望 %v", host, got, want)
		}
	}
	for _, host := range *asked {
		if !IsSchoolHost(host) {
			t.Errorf("不是学校域名也去查了 DNS：%s", host)
		}
	}
}

// 网络探测要把「net.szu.edu.cn 解析进 Fake-IP 段」带出来并写进说明：这时解析是「成功」的，
// 以前的 SrunDNSOK 看不出任何问题，门户探测也全走了代理。
func TestProbeReportsFakeIPTakeover(t *testing.T) {
	withLookup(t, func(host string) ([]net.IP, error) {
		if host != "net.szu.edu.cn" {
			t.Errorf("探测只该解析教学区门户的域名，实际查了 %s", host)
		}
		return []net.IP{net.ParseIP("198.18.0.167")}, nil
	})
	ok, fake := resolveSchoolDNS()
	if !ok || !fake {
		t.Fatalf("解析到 198.18.0.167 应得 ok=true fake=true，实际 ok=%v fake=%v", ok, fake)
	}

	for _, r := range []*DetectResult{
		{InternetOK: true, Probed: true, SrunDNSOK: true, SrunDNSFakeIP: true},
		{Probed: true, SrunDNSOK: true, SrunDNSFakeIP: true},
	} {
		concludeProbe(r)
		if joined := strings.Join(r.Notes, "\n"); !strings.Contains(joined, ProxyTakeoverHint) {
			t.Fatalf("Fake-IP 接管了学校域名，说明里却没提（外网=%v）：\n%s", r.InternetOK, joined)
		}
	}
	clean := &DetectResult{InternetOK: true, Probed: true, SrunDNSOK: true}
	concludeProbe(clean)
	if joined := strings.Join(clean.Notes, "\n"); strings.Contains(joined, "假地址") {
		t.Fatalf("没有被接管时不该出现 Fake-IP 说明：\n%s", joined)
	}
	if strings.Contains(ProxyTakeoverHint, "--") {
		t.Fatalf("提示桌面版也会显示，不能带命令行参数：%s", ProxyTakeoverHint)
	}
}
