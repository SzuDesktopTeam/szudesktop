package ui

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
)

func TestUndergradPreservesOfficialArrangement(t *testing.T) {
	data := `{"code":"0","datas":{"xskcb":{"rows":[{"KCM":"测试课程","KCH":"TEST","KXH":"01","SKJS":"测试教师","YPSJDD":"1-16周 周一 第3-4节 测试教室"}],"totalSize":1}}}`
	courses, err := parseUndergradTimetable([]byte(data))
	if err != nil || len(courses) != 1 || courses[0].Arrangement != "1-16周 周一 第3-4节 测试教室" {
		t.Fatal("raw arrangement lost", err)
	}
	for _, bad := range []string{`<html>统一身份认证</html>`, `{"datas":{"xskcb":{"rows":[{"other":"未知"}]}}}`, strings.Replace(data, `"totalSize":1`, `"totalSize":2`, 1), `{"datas":{"xskcb":{"rows":null}}}`} {
		if _, err := parseUndergradTimetable([]byte(bad)); err == nil {
			t.Fatal("invalid or incomplete table accepted")
		}
	}
	courses, err = parseUndergradTimetable([]byte(`{"datas":{"xskcb":{"rows":[]}}}`))
	if err != nil || courses == nil || len(courses) != 0 {
		t.Fatal("official empty table rejected")
	}
}
func TestUndergradUsesPersonalBusinessAndOfficialTerm(t *testing.T) {
	s := &Server{session: &memSessionStore{value: credential.Session{Cookie: "test=secret"}}}
	s.ehallFactory = func(cookie string) *ehallClient {
		c := newEhallClient(cookie, 0)
		c.http.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
			var data string
			switch r.URL.Path {
			case undergradTermPath:
				data = `{"datas":{"dqxnxq":{"rows":[{"DM":"2026-2027-1"}]}}}`
			case undergradTimetablePath:
				r.ParseForm()
				if r.Form.Get("XNXQDM") != "2026-2027-1" {
					t.Fatal("term guessed")
				}
				data = `{"datas":{"xskcb":{"rows":[]}}}`
			default:
				t.Fatal("unexpected academic path", r.URL.Path)
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(data)), Request: r}, nil
		})
		return c
	}
	w := httptest.NewRecorder()
	s.handleUndergradTimetable(w, httptest.NewRequest("GET", "http://127.0.0.1/api/academic/undergrad/timetable", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"courses":[]`) || strings.Contains(w.Body.String(), "secret") {
		t.Fatal("personal timetable failed", w.Code)
	}
}

// 本地请求已断开（切走页面、退出应用）时，本科课表不再向学校发请求。
func TestUndergradTimetableFollowsRequestContext(t *testing.T) {
	calls := 0
	s := &Server{session: &memSessionStore{value: credential.Session{Cookie: "test=secret"}}}
	s.ehallFactory = func(cookie string) *ehallClient {
		c := newEhallClient(cookie, 0)
		c.http.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"datas":{"xskcb":{"rows":[]}}}`)), Request: r}, nil
		})
		return c
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, query := range []string{"", "?term=2026-2027-1"} {
		w := httptest.NewRecorder()
		s.handleUndergradTimetable(w, httptest.NewRequest("GET", "http://127.0.0.1/api/academic/undergrad/timetable"+query, nil).WithContext(ctx))
		if calls != 0 || w.Code == 200 {
			t.Fatalf("本地请求已取消仍去读了学校课表：%d calls, HTTP %d", calls, w.Code)
		}
	}
}
