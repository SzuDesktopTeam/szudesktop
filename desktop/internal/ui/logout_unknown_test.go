package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

func TestLogoutUnknownRegionDoesNotClaimNoSession(t *testing.T) {
	var requests atomic.Int32
	local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		http.Error(w, "unexpected authentication request", http.StatusInternalServerError)
	}))
	defer local.Close()
	for _, internetOK := range []bool{false, true} {
		s := &Server{
			opts: Options{SrunHost: local.URL, DrcomHost: local.URL},
			probe: func() *portal.DetectResult {
				return &portal.DetectResult{Zone: portal.ZoneUnknown, InternetOK: internetOK, Probed: true, TeachPortalOK: true, DormPortalOK: true}
			},
		}
		req := httptest.NewRequest(http.MethodPost, "/api/logout", strings.NewReader(`{"username":"fixture","password":"not-real","zone":"auto"}`))
		rec := httptest.NewRecorder()
		s.handleLogout(rec, req)
		var got loginResp
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if got.OK || !strings.Contains(got.Message, "未能确认校园网认证区域，尚未执行注销") || !strings.Contains(got.Message, "手动选择教学区 / 宿舍区") || strings.Contains(got.Message, "没有可注销") {
			t.Fatalf("unknown region overclaimed session state: %+v", got)
		}
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("unknown region sent %d authentication/logout requests", got)
	}
}
