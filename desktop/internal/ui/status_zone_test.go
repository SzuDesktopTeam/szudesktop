package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// F12：已联网时判区只有 online，zone_label 以前固定写「已联网」。门户确认在线时要显示是哪个区，
// online_zone 给出代号；zone 本身不变（页面按 zone 走的逻辑不能被这次改动带歪），没确认在线时照旧。
func TestStatusShowsConfirmedZoneWhenOnline(t *testing.T) {
	for _, tc := range []struct {
		name, srun, drcom string
		label, onlineZone string
	}{
		{"深澜确认在线", `_({"error":"ok","online_ip":"10.20.30.40"})`, `dr1003({"result":0})`, "教学区（深澜 SRun）", "teaching"},
		{"宿舍区确认在线", `_({"error":"not_online_error"})`, `dr1003({"result":1,"online_ip":"10.20.30.41"})`, "宿舍区（Dr.COM 网页认证）", "dorm"},
		{"两套都不在线", `_({"error":"not_online_error"})`, `dr1003({"result":0})`, "已联网", ""},
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
			s := &Server{
				opts:   Options{SrunHost: srv.URL, DrcomHost: srv.URL},
				store:  &statusTestStore{err: credential.ErrNotFound},
				detect: func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true} },
			}
			rec := httptest.NewRecorder()
			s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
			var got statusResp
			var raw map[string]any
			if json.Unmarshal(rec.Body.Bytes(), &got) != nil || json.Unmarshal(rec.Body.Bytes(), &raw) != nil {
				t.Fatalf("status: %s", rec.Body.String())
			}
			if got.Zone != "online" || got.ZoneLabel != tc.label || got.OnlineZone != tc.onlineZone {
				t.Fatalf("zone=%q zone_label=%q online_zone=%q，期望 online / %q / %q", got.Zone, got.ZoneLabel, got.OnlineZone, tc.label, tc.onlineZone)
			}
			if _, ok := raw["online_zone"]; ok != (tc.onlineZone != "") {
				t.Fatalf("没确认在线时不该带 online_zone：%s", rec.Body.String())
			}
		})
	}
}

// 中性说明在接口里取自 portal（命令行 status 打印的是同一句），server.go 里另有一份字面量供
// check-network-ui.mjs 核对页面的兜底文字，三处只能一起改。
func TestStatusNoCampusPortalNoteMatchesPortal(t *testing.T) {
	if got := portal.NoCampusPortalNote(&portal.DetectResult{Zone: portal.ZoneOnline, InternetOK: true}); got != noCampusPortalNote {
		t.Fatalf("portal 的中性说明 %q 与 server.go 的 noCampusPortalNote %q 不一致", got, noCampusPortalNote)
	}
}
