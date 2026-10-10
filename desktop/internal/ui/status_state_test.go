package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/diagnose"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// /api/status 要把「外网正常、不在校园网」和「在校园网里却查不到认证状态」分开（O7）。
//
// 以前人在校外时 Dr.COM 查询必然失败，QueryOnline 返回错误，这里一律写成
// 「暂时无法确认校园网认证状态，请稍后刷新或运行网络诊断」，首页常驻一条琥珀色警告，
// 让在家安装的新生去排查一个不存在的问题。只有判定在教学区或宿舍区时才该警告。
func TestStatusSeparatesOffCampusFromUnconfirmedAuth(t *testing.T) {
	portalAt := func(srun, drcom string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/cgi-bin/rad_user_info":
				_, _ = w.Write([]byte(srun))
			case "/eportal/portal/rad_user_info":
				_, _ = w.Write([]byte(drcom))
			default:
				http.NotFound(w, r)
			}
		}))
	}
	// 校外常见形态：深澜那边答了「不在线」，宿舍区门户连不上（这里用读不懂的正文代替）。
	offCampus := portalAt(`_({"error":"not_online_error"})`, "<html>unreachable</html>")
	defer offCampus.Close()
	bothDown := portalAt("<html>unreachable</html>", "<html>unreachable</html>")
	defer bothDown.Close()
	online := portalAt(`_({"error":"ok","online_ip":"10.20.30.40"})`, `dr1003({"result":0})`)
	defer online.Close()
	dormOffline := portalAt("", `dr1003({"result":0})`)
	defer dormOffline.Close()

	for _, tc := range []struct {
		name       string
		portal     *httptest.Server
		det        portal.DetectResult
		forcedZone string
		state      string
		warn, note bool
		known      bool
	}{
		{"外网正常、宿舍门户连不上", offCampus, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}, "", onlineStateNoPortal, false, true, false},
		{"外网正常、两个门户都连不上", bothDown, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}, "", onlineStateNoPortal, false, true, false},
		// 同一次探测看到学校域名解析进了 Fake-IP 段：仍是灰色，但说明里要带上代理提示。
		{"外网正常、学校域名被 Fake-IP 接管", bothDown, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true, SrunDNSOK: true, SrunDNSFakeIP: true}, "", onlineStateNoPortal, false, true, false},
		{"判定在教学区却查不到", bothDown, portal.DetectResult{Zone: portal.ZoneTeaching, Probed: true, SrunUsable: true}, "", onlineStateUnconfirmed, true, false, false},
		{"判定在宿舍区却查不到", offCampus, portal.DetectResult{Zone: portal.ZoneDorm, Probed: true, DormUsable: true}, "", onlineStateUnconfirmed, true, false, false},
		{"手动指定宿舍区时照样警告", offCampus, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}, "dorm", onlineStateUnconfirmed, true, false, false},
		{"外网正常、深澜确认在线", online, portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}, "", onlineStateOnline, false, false, true},
		{"宿舍区确认不在线", dormOffline, portal.DetectResult{Zone: portal.ZoneDorm, Probed: true, DormUsable: true}, "", onlineStateOffline, false, false, true},
		{"校外不通、没查门户", bothDown, portal.DetectResult{Zone: portal.ZoneOutside, Probed: true}, "", onlineStateNotQueried, false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			det := tc.det
			s := &Server{
				opts:   Options{SrunHost: tc.portal.URL, DrcomHost: tc.portal.URL, Zone: tc.forcedZone},
				store:  &statusTestStore{err: credential.ErrNotFound},
				detect: func() *portal.DetectResult { cp := det; return &cp },
			}
			rec := httptest.NewRecorder()
			s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
			var got statusResp
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.OnlineState != tc.state || got.OnlineKnown != tc.known {
				t.Fatalf("online_state=%q online_known=%v，期望 %q / %v：%+v", got.OnlineState, got.OnlineKnown, tc.state, tc.known, got)
			}
			if (got.OnlineError != "") != tc.warn {
				t.Fatalf("online_error 只在判定在校园网里却查不到时出现，实际 %q", got.OnlineError)
			}
			want := "外网可用；校园网认证状态暂未确认"
			if tc.det.SrunDNSFakeIP {
				want += "。人在校内的话：" + portal.ProxyTakeoverHint
			}
			if tc.note && got.OnlineNote != want {
				t.Fatalf("中性状态的说明文字不对：%q，期望 %q", got.OnlineNote, want)
			}
			if !tc.note && got.OnlineNote != "" {
				t.Fatalf("只有中性状态才带说明文字，实际 %q", got.OnlineNote)
			}
		})
	}
}

// 首页和内嵌资源不进磁盘缓存：端口每次启动都换，写下的缓存下次一条也命中不了（O14）。
func TestPagesAndStaticAssetsAreNotDiskCached(t *testing.T) {
	mux := http.NewServeMux()
	(&Server{}).routes(mux, fstest.MapFS{
		"index.html":      {Data: []byte("<!doctype html>")},
		"garden/app.mjs":  {Data: []byte("export const ready = true;")},
		"art/sprite.webp": {Data: []byte("RIFF")},
	})
	for _, path := range []string{"/", "/index.html", "/assets/garden/app.mjs", "/garden/app.mjs", "/assets/art/sprite.webp"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: %d Cache-Control=%q，应为 no-store", path, rec.Code, rec.Header().Get("Cache-Control"))
		}
	}
}

// 诊断接口要把「学校域名被 Fake-IP 接管」带给页面，提示本身在 advices 里原样显示。
func TestDiagReportsFakeIPTakeover(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	s := New(Options{})
	s.store = &statusTestStore{err: credential.ErrNotFound}
	s.diagnose = func(string, string, string, string) *diagnose.Report {
		return &diagnose.Report{Detect: &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true, Probed: true, SrunDNSOK: true, SrunDNSFakeIP: true}, Advices: []string{portal.ProxyTakeoverHint}}
	}
	mux := authedRoutes(s, fstest.MapFS{})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/diag", nil))
	var got diagResp
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &got) != nil {
		t.Fatalf("diag: %d %s", rec.Code, rec.Body.String())
	}
	if !got.DNSFakeIP || len(got.Advices) == 0 || got.Advices[0] != portal.ProxyTakeoverHint {
		t.Fatalf("诊断结果没带出 Fake-IP 接管：%+v", got)
	}
}
