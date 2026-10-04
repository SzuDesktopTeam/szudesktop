package portal

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestQueryOnlineCoversOnlineZone 锁死这次修的核心：
// 能上外网（ZoneOnline）时也必须去问在线状态。
//
// 以前命令行和桌面界面都在这个分支上直接跳过，用户拿到的只有一句"没查到"，
// 于是以为自己掉线了，跑去反复点登录，然后被 ip_already_online 挡回来。
// 可"能上网"恰恰是已登录的最强证据，这种时候最不该装聋作哑。
func TestQueryOnlineCoversOnlineZone(t *testing.T) {
	srv := fakeSrunPortal(t, "",
		`_({"error":"ok","online_ip":"10.20.30.40","online_device_total":"1"})`)

	st, err := QueryOnline(ZoneOnline, srv.URL, srv.URL, "123456", "pw")
	if err != nil {
		t.Fatal(err)
	}
	if st == nil {
		t.Fatal("联网时必须查到在线状态，不能返回空")
	}
	if !st.Online || st.IP != "10.20.30.40" {
		t.Errorf("结果不对：%+v", st)
	}
}

// TestQueryOnlineZoneOnlineFallsBackToDorm 联网时 Detect() 提前返回、没跑协议
// 指纹，所以不知道当初是哪套协议认证的：深澜那边没结果，要接着问宿舍区那套。
func TestQueryOnlineZoneOnlineFallsBackToDorm(t *testing.T) {
	mux := http.NewServeMux()
	// 深澜：够得着，但当前不在线
	mux.HandleFunc("/cgi-bin/rad_user_info", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`_({"error":"not_online"})`))
	})
	// 宿舍区：在线
	mux.HandleFunc("/eportal/portal/rad_user_info", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`dr1003({"result":1,"online_ip":"10.20.30.41"})`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	st, err := QueryOnline(ZoneOnline, srv.URL, srv.URL, "123456", "pw")
	if err != nil {
		t.Fatal(err)
	}
	if st == nil || !st.Online || st.IP != "10.20.30.41" {
		t.Fatalf("深澜没结果时该采信宿舍区那套，实际 %+v", st)
	}
}

// TestQueryOnlineOutsideAsksNothing 人在校外（或判不出区）就别问了，
// 返回空让调用方跳过显示。地址故意给了个连不上的，真发请求就会失败。
func TestQueryOnlineOutsideAsksNothing(t *testing.T) {
	for _, zone := range []Zone{ZoneOutside, ZoneUnknown} {
		t.Run(string(zone), func(t *testing.T) {
			st, err := QueryOnline(zone, "http://127.0.0.1:1", "http://127.0.0.1:1", "123456", "pw")
			if err != nil || st != nil {
				t.Errorf("%s 不该发起查询，实际 st=%+v err=%v", zone, st, err)
			}
		})
	}
}

// TestQueryOnlineReportsConfirmingZone 是 F12：联网时判区只有 online，界面固定写「已联网」。
// QueryOnline 两套门户都问，谁确认在线就该带回谁的区域；两套都不在线时不能挂在哪一套名下。
func TestQueryOnlineReportsConfirmingZone(t *testing.T) {
	portalAt := func(srun, drcom string) string {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/cgi-bin/rad_user_info":
				_, _ = w.Write([]byte(srun))
			case "/eportal/portal/rad_user_info":
				_, _ = w.Write([]byte(drcom))
			default:
				http.NotFound(w, r)
			}
		}))
		t.Cleanup(srv.Close)
		return srv.URL
	}
	for _, tc := range []struct {
		name, srun, drcom string
		zone              Zone // 查询时的判区
		online            bool
		confirmed, shown  Zone
	}{
		{"联网时深澜确认在线", `_({"error":"ok"})`, `dr1003({"result":0})`, ZoneOnline, true, ZoneTeaching, ZoneTeaching},
		{"联网时宿舍区确认在线", `_({"error":"not_online_error"})`, `dr1003({"result":1})`, ZoneOnline, true, ZoneDorm, ZoneDorm},
		{"联网时两套都不在线", `_({"error":"not_online_error"})`, `dr1003({"result":0})`, ZoneOnline, false, "", ZoneOnline},
		{"教学区不在线", `_({"error":"not_online_error"})`, "", ZoneTeaching, false, "", ZoneTeaching},
		{"宿舍区在线", "", `dr1003({"result":1})`, ZoneDorm, true, ZoneDorm, ZoneDorm},
	} {
		t.Run(tc.name, func(t *testing.T) {
			host := portalAt(tc.srun, tc.drcom)
			st, err := QueryOnline(tc.zone, host, host, "", "")
			if err != nil || st == nil || st.Online != tc.online {
				t.Fatalf("查询结果不对：st=%+v err=%v", st, err)
			}
			if got := st.ConfirmedZone(); got != tc.confirmed {
				t.Fatalf("确认在线的区域是 %q，期望 %q（%+v）", got, tc.confirmed, st)
			}
			if got := DisplayZone(tc.zone, st); got != tc.shown {
				t.Fatalf("显示的区域是 %q，期望 %q", got, tc.shown)
			}
		})
	}
	if got := DisplayZone(ZoneOnline, nil); got != ZoneOnline {
		t.Fatalf("没查到时照旧显示判区，实际 %q", got)
	}
}

// TestNoCampusPortalNeedsWorkingInternetAndQueryError 锁住「校外属正常」的判据：
// 只有外网正常、判区是 online、门户又查不到才算；判定在教学区或宿舍区时查不到是真问题。
func TestNoCampusPortalNeedsWorkingInternetAndQueryError(t *testing.T) {
	queryErr := errors.New("portal unreachable")
	online := &DetectResult{Zone: ZoneOnline, InternetOK: true}
	if !NoCampusPortal(ZoneOnline, online, queryErr) {
		t.Fatal("外网正常、门户查不到应算作不在校园网")
	}
	for _, tc := range []struct {
		name string
		zone Zone
		det  *DetectResult
		err  error
	}{
		{"门户查到了", ZoneOnline, online, nil},
		{"判定在教学区", ZoneTeaching, online, queryErr},
		{"外网不通", ZoneOnline, &DetectResult{Zone: ZoneOnline}, queryErr},
		{"没有探测结果", ZoneOnline, nil, queryErr},
	} {
		if NoCampusPortal(tc.zone, tc.det, tc.err) {
			t.Errorf("%s 不该算作不在校园网", tc.name)
		}
	}
	plain := NoCampusPortalNote(online)
	if plain != "外网正常；没有检测到校园网认证页面（不在校园网内时属正常）" || strings.Contains(NoCampusPortalNote(nil), ProxyTakeoverHint) {
		t.Fatalf("中性说明不对：%q", plain)
	}
	if got := NoCampusPortalNote(&DetectResult{InternetOK: true, SrunDNSFakeIP: true}); got != plain+"。人在校内的话："+ProxyTakeoverHint {
		t.Fatalf("学校域名被 Fake-IP 接管时要带上代理提示：%q", got)
	}
}
