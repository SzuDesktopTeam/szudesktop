package diagnose

import (
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// 学校域名解析进 198.18.0.0/15（代理的 Fake-IP 模式）时，诊断结论要直接说出原因和做法（O7）。
//
// 这时 net.szu.edu.cn 是「能解析」的，以前的诊断只看得出解析失败，看不出被接管：
// 外网正常时只说「不用做任何事」，学校系统却一直连不上；掉线时门户探测也全走了代理，
// 只会得出「两个门户都连不上，先确认是不是在校外」。
func TestDiagnoseReportsFakeIPTakeover(t *testing.T) {
	cases := []portal.DetectResult{
		{Zone: portal.ZoneOnline, InternetOK: true, Probed: true, SrunDNSOK: true, SrunUsable: true},
		{Zone: portal.ZoneOutside, Probed: true, SrunDNSOK: true},
		{Zone: portal.ZoneTeaching, Probed: true, SrunDNSOK: true, TeachPortalOK: true, SrunUsable: true},
	}
	for _, d := range cases {
		d.SrunDNSFakeIP = true
		withProbe(t, d)
		for name, advices := range map[string][]string{
			"桌面版":  Run("", "", "", "").Advices,
			"命令行版": RunWithOptions("", "", "", "", Options{CLIHints: true}).Advices,
		} {
			joined := strings.Join(advices, "\n")
			if !strings.Contains(joined, "代理软件接管了学校域名，请把 szu.edu.cn 设为直连") {
				t.Errorf("%s（区域 %s）没有给出代理接管的提示：\n%s", name, d.Zone, joined)
			}
		}
		// 这条要排在前面：后面按门户连通性给的结论本身就可能是代理造成的。
		advices := Run("", "", "", "").Advices
		first := 0
		if d.Zone == portal.ZoneOnline {
			first = 1
		}
		if len(advices) <= first || !strings.Contains(advices[first], "198.18.0.0/15") {
			t.Errorf("区域 %s：代理接管的提示应该排在第 %d 条，实际：\n%s", d.Zone, first+1, strings.Join(advices, "\n"))
		}
	}

	// 没被接管时不能凭空冒出这条，免得在校内正常的同学去改代理。
	for _, d := range cases {
		withProbe(t, d)
		if joined := strings.Join(Run("", "", "", "").Advices, "\n"); strings.Contains(joined, "代理软件接管") {
			t.Errorf("区域 %s 没有 Fake-IP，却提示了代理接管：\n%s", d.Zone, joined)
		}
	}
}
