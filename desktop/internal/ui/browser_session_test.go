package ui

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBrowserSessionInvalidReplacementClearsOnlySelectedAccount(t *testing.T) {
	for _, business := range []string{"undergrad", "graduate", "undergrad-scores", "graduate-scores"} {
		for _, row := range []struct {
			name    string
			cookies []browserCookie
		}{
			{"empty", nil},
			{"invalid", []browserCookie{{"bad\nname", "test-only", "/"}}},
		} {
			t.Run(business+"/"+row.name, func(t *testing.T) {
				s := &Server{cas: newCasService(), academic: newAcademicService()}
				s.cas.client, s.cas.authenticated = newCasClient(), true
				s.academic.client, s.academic.authenticated = newAcademicClient(), true
				body, err := json.Marshal(map[string]any{"business": business, "cookies": row.cookies})
				if err != nil {
					t.Fatal(err)
				}
				w := httptest.NewRecorder()
				s.handleBrowserSession(w, httptest.NewRequest(http.MethodPost, "/api/academic/browser-session", strings.NewReader(string(body))))
				if w.Code != http.StatusBadRequest {
					t.Fatalf("invalid replacement status = %d", w.Code)
				}
				if business == "graduate" {
					if s.academic.authenticated || s.academic.client != nil {
						t.Fatal("previous graduate account survived failed replacement")
					}
					if !s.cas.authenticated || s.cas.client == nil {
						t.Fatal("unrelated CAS account was cleared")
					}
				} else {
					if s.cas.authenticated || s.cas.client != nil {
						t.Fatal("previous CAS account survived failed replacement")
					}
					if !s.academic.authenticated || s.academic.client == nil {
						t.Fatal("unrelated graduate account was cleared")
					}
				}
			})
		}
	}
}

func TestBrowserCookiesStayOnSchoolHostAndPath(t *testing.T) {
	c := newCasClient()
	if err := setBrowserCookies(c, []browserCookie{{"SESSION", "private-value", "/jwapp/"}}); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		address string
		count   int
	}{
		{"https://ehall.szu.edu.cn/jwapp/x", 1},
		{"https://ehall.szu.edu.cn/gsapp/x", 0},
		{"https://example.org/jwapp/x", 0},
		{"http://ehall.szu.edu.cn/jwapp/x", 0},
	} {
		u, _ := url.Parse(row.address)
		if got := len(c.Jar.Cookies(u)); got != row.count {
			t.Fatalf("cookie scope %s: %d", row.address, got)
		}
	}
	if err := setBrowserCookies(c, []browserCookie{{"bad\nname", "v", "/"}}); err == nil {
		t.Fatal("invalid header accepted")
	}
}

func TestBrowserSessionRequiresBusinessResponse(t *testing.T) {
	for _, row := range []struct {
		business, body string
		ok             bool
	}{
		{"undergrad", `<html>统一身份认证</html>`, false},
		{"undergrad", `{"code":"0"}`, false},
		{"undergrad", `{"code":"0","datas":{"dqxnxq":{"rows":[{"DM":"2026-2027-1"}]}}}`, true},
		{"graduate", `{"CODE":"0"}`, false},
		{"graduate", `{"XM":"测试学生"}`, true},
	} {
		t.Run(row.business+row.body, func(t *testing.T) {
			client := newCasClient()
			client.Transport = ehallTestTransport(func(r *http.Request) (*http.Response, error) {
				if r.URL.Host != ehallHost {
					t.Fatal("unexpected destination")
				}
				body := row.body
				if row.ok && r.URL.Path == undergradTimetablePath {
					body = `{"code":"0","datas":{"xskcb":{"rows":[],"totalSize":0}}}`
				}
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
			})
			err := validateBrowserSession(context.Background(), client, row.business)
			if (err == nil) != row.ok {
				t.Fatalf("business validation: %v", err)
			}
		})
	}
}

// 导入学校窗口会话时，两次学校校验不持锁：会话查询和退出时的清除都不用排队；
// 校验途中被清除时，这次导入的结果作废，不能把会话复活。
func TestBrowserSessionValidationRunsOutsideLock(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	school := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == undergradTermPath {
			once.Do(func() { close(entered); <-release })
			w.Write([]byte(`{"code":"0","datas":{"dqxnxq":{"rows":[{"DM":"2026-2027-1"}]}}}`))
			return
		}
		w.Write([]byte(`{"code":"0","datas":{"xskcb":{"rows":[],"totalSize":0}}}`))
	}))
	defer school.Close()
	casTestBase, casTestEhall = school.URL, school.URL
	s := &Server{cas: newCasService(), academic: newAcademicService(), session: &memSessionStore{}}
	importSession := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		body := `{"business":"undergrad","cookies":[{"name":"SESSION","value":"test-only","path":"/"}]}`
		s.handleBrowserSession(w, httptest.NewRequest(http.MethodPost, "/api/academic/browser-session", strings.NewReader(body)))
		return w
	}
	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- importSession() }()
	<-entered
	quick := make(chan struct{})
	go func() {
		s.handleCasSession(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/cas/session", nil))
		s.handleBrowserSession(httptest.NewRecorder(), httptest.NewRequest(http.MethodDelete, "/api/academic/browser-session", nil))
		close(quick)
	}()
	select {
	case <-quick:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("同步学校会话期间，会话查询或退出清除被锁住了")
	}
	close(release)
	w := <-done
	if w.Code != http.StatusConflict || s.cas.authenticated || s.cas.client != nil {
		t.Fatalf("校验途中被清除后会话复活了：%d %s", w.Code, w.Body.String())
	}
	if w = importSession(); w.Code != 200 || !s.cas.authenticated || s.cas.client == nil {
		t.Fatalf("没有打扰时导入应成功：%d %s", w.Code, w.Body.String())
	}
}
