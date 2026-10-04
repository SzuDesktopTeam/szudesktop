package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// F12：已联网时判区只有 online，status 以前固定报「已联网」。门户确认在线时，
// status --json 要带出 online_zone，zone_label 和文字版的「网络区域」换成那个区；zone 不变。
func TestStatusReportsConfirmedZone(t *testing.T) {
	for _, tc := range []struct {
		name, srun, drcom string
		onlineZone        portal.Zone
	}{
		{"深澜确认在线", `_({"error":"ok","online_ip":"10.20.30.40"})`, `dr1003({"result":0})`, portal.ZoneTeaching},
		{"宿舍区确认在线", `_({"error":"not_online_error"})`, `dr1003({"result":1})`, portal.ZoneDorm},
		{"两套都不在线", `_({"error":"not_online_error"})`, `dr1003({"result":0})`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/cgi-bin/rad_user_info":
					_, _ = w.Write([]byte(tc.srun))
				case "/eportal/portal/rad_user_info":
					_, _ = w.Write([]byte(tc.drcom))
				default:
					http.NotFound(w, r)
				}
			}))
			defer srv.Close()
			zone, det := portal.ZoneOnline, &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}
			st, err := statusOnline(zone, &options{srunHost: srv.URL, drcomHost: srv.URL}, "", "")
			if err != nil || st == nil {
				t.Fatalf("查询失败：%+v %v", st, err)
			}
			out := statusReport(zone, det)
			addOnlineReport(out, st)
			wantLabel := portal.ZoneOnline.Label()
			if tc.onlineZone != "" {
				wantLabel = tc.onlineZone.Label()
			}
			if out["zone"] != portal.ZoneOnline || out["zone_label"] != wantLabel || portal.DisplayZone(zone, st).Label() != wantLabel {
				t.Fatalf("zone=%v zone_label=%v，期望 online / %s", out["zone"], out["zone_label"], wantLabel)
			}
			if got, ok := out["online_zone"]; ok != (tc.onlineZone != "") || (ok && got != tc.onlineZone) {
				t.Fatalf("online_zone=%v（键存在=%v），期望 %q", got, ok, tc.onlineZone)
			}
		})
	}
}

// 人在校外（外网正常、门户查不到）时与桌面端同一句中性说明，不能再写「没查到」；
// 判定在教学区却查不到才保留出错原因。
func TestStatusAccountLinesMatchDesktopOffCampus(t *testing.T) {
	queryErr := errors.New("portal unreachable")
	online := &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}
	fakeIP := &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true, SrunDNSOK: true, SrunDNSFakeIP: true}
	for _, tc := range []struct {
		name string
		zone portal.Zone
		det  *portal.DetectResult
		st   *portal.OnlineStatus
		err  error
		want string
	}{
		{"校外", portal.ZoneOnline, online, nil, queryErr, "账号状态: " + portal.NoCampusPortalNote(online)},
		{"校外但学校域名被 Fake-IP 接管", portal.ZoneOnline, fakeIP, nil, queryErr, "账号状态: " + portal.NoCampusPortalNote(fakeIP)},
		{"判定在教学区却查不到", portal.ZoneTeaching, &portal.DetectResult{Zone: portal.ZoneTeaching, Probed: true}, nil, queryErr, "账号状态: 没查到（portal unreachable）"},
		{"校外不通、没查", portal.ZoneOutside, &portal.DetectResult{Zone: portal.ZoneOutside, Probed: true}, nil, nil, "账号状态: 没有判定在教学区或宿舍区，没有查询认证状态"},
		{"已在线", portal.ZoneOnline, online, &portal.OnlineStatus{Online: true, Zone: portal.ZoneTeaching}, nil, "账号状态: 已在线"},
	} {
		got := strings.Join(accountLines(tc.zone, tc.det, tc.st, tc.err), "\n")
		if got != tc.want {
			t.Errorf("%s：%q，期望 %q", tc.name, got, tc.want)
		}
	}
	if !strings.Contains(portal.NoCampusPortalNote(fakeIP), portal.ProxyTakeoverHint) {
		t.Fatal("学校域名被 Fake-IP 接管时要带上代理提示")
	}
}
