package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/diagnose"
	"github.com/SzuDesktopTeam/szudesktop/internal/netpref"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// 诊断页只显示 advices，接入点编号要写进那里才看得到；
// 猜出来的值要说明不可靠，并指出可以手动指定。
func TestACIDAdviceExplainsSource(t *testing.T) {
	for _, tc := range []struct {
		source portal.AcIDSource
		want   string
	}{
		{portal.AcIDSourceManual, "启动参数"},
		{portal.AcIDSourceCache, "上次认证成功"},
		{portal.AcIDSourceRedirect, "网关下发"},
		{portal.AcIDSourceGuess, "手动指定"},
	} {
		got := acIDAdvice("12", tc.source)
		if !strings.Contains(got, "ac_id）：12") || !strings.Contains(got, tc.want) {
			t.Errorf("acIDAdvice(%s) = %q", tc.source, got)
		}
	}
}

// 诊断页读的是这张网上次认证成功的 ac_id：命中缓存时不能再去探测门户，
// 编号和来历要写进页面会显示的 advices；不是深澜网络时不查也不显示。
func TestDiagShowsACIDFromCacheWithoutProbing(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	key := netpref.Egress()
	if key == "" {
		t.Skip("这台机器取不到网关或本机地址，没法按网缓存 ac_id")
	}
	prefs := netpref.Load()
	prefs.SetAcID(key, "17")
	if err := prefs.Save(); err != nil {
		t.Fatal(err)
	}
	var portalHits int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&portalHits, 1)
		http.NotFound(w, r)
	}))
	defer fake.Close()
	for _, tc := range []struct {
		name       string
		acID       string // 启动参数
		srun       bool
		wantID     string
		wantAdvice string
		wantNoAcID bool
	}{
		{name: "cached", srun: true, wantID: "17", wantAdvice: "ac_id）：17，来自这张网上次认证成功的记录"},
		{name: "startup flag wins", acID: "5", srun: true, wantID: "5", wantAdvice: "ac_id）：5，来自启动参数"},
		{name: "not srun", srun: false, wantNoAcID: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := New(Options{SrunHost: fake.URL, AcID: tc.acID})
			s.store = &statusTestStore{err: credential.ErrNotFound}
			s.diagnose = func(string, string, string, string) *diagnose.Report {
				return &diagnose.Report{Detect: &portal.DetectResult{Zone: portal.ZoneTeaching, Probed: true, SrunDNSOK: true, SrunUsable: tc.srun}, Advices: []string{"你在教学区"}}
			}
			mux := authedRoutes(s, fstest.MapFS{})
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/diag", nil))
			var got diagResp
			if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &got) != nil {
				t.Fatalf("diag: %d %s", w.Code, w.Body.String())
			}
			advices := strings.Join(got.Advices, "\n")
			if tc.wantNoAcID {
				if got.AcID != "" || strings.Contains(advices, "ac_id") {
					t.Fatalf("non-srun network must not report ac_id: %+v", got)
				}
			} else if got.AcID != tc.wantID || !got.AcIDTrusted || !strings.Contains(advices, tc.wantAdvice) || !strings.HasPrefix(advices, "你在教学区") {
				t.Fatalf("ac_id must be shown in advices: %+v", got)
			}
			if n := atomic.LoadInt32(&portalHits); n != 0 {
				t.Fatalf("diag probed the portal %d times despite a known ac_id", n)
			}
		})
	}
}
