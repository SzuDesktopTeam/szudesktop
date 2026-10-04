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

// 诊断接口要带出系统代理的开关（复测前先关代理，报告里得看得出关没关），只能是开关：
// 诊断报告会被复制出去，不能带代理地址。这个平台读不到时整项省略，不能写成「关」。
func TestDiagReportsSystemProxySwitches(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	for _, tc := range []struct {
		name  string
		proxy *diagnose.SystemProxy
		want  string // system_proxy 的原样 JSON；空串表示应当省略
	}{
		{"手动代理开着", &diagnose.SystemProxy{Manual: true}, `{"manual":true,"pac":false}`},
		{"只开了 PAC", &diagnose.SystemProxy{PAC: true}, `{"manual":false,"pac":true}`},
		{"都关着", &diagnose.SystemProxy{}, `{"manual":false,"pac":false}`},
		{"读不到", nil, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := New(Options{})
			s.store = &statusTestStore{err: credential.ErrNotFound}
			s.diagnose = func(string, string, string, string) *diagnose.Report {
				return &diagnose.Report{Detect: &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true, Probed: true, SrunDNSOK: true}}
			}
			s.systemProxy = func() *diagnose.SystemProxy { return tc.proxy }
			rec := httptest.NewRecorder()
			authedRoutes(s, fstest.MapFS{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/diag", nil))
			var raw map[string]json.RawMessage
			if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &raw) != nil {
				t.Fatalf("diag: %d %s", rec.Code, rec.Body.String())
			}
			got, ok := raw["system_proxy"]
			if ok != (tc.want != "") || (ok && string(got) != tc.want) {
				t.Fatalf("system_proxy=%s（键存在=%v），期望 %q", got, ok, tc.want)
			}
		})
	}
}
