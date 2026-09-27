package ui

import (
	"encoding/json"
	"errors"
	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

type guardTestStore struct {
	value  credential.Credentials
	writes int
}

func (s *guardTestStore) Save(c credential.Credentials) error   { s.value = c; s.writes++; return nil }
func (s *guardTestStore) Load() (credential.Credentials, error) { return s.value, nil }
func (s *guardTestStore) Delete() error                         { s.writes++; return nil }
func (s *guardTestStore) Describe() string                      { return "test memory" }

func TestCredentialRouteProtectsStoredAccount(t *testing.T) {
	cases := []struct {
		name, method, host, origin, site, contentType string
		want                                          int
		writes                                        int
	}{
		{"same origin save", "POST", "127.0.0.1:1234", "http://127.0.0.1:1234", "same-origin", "application/json", 200, 1},
		{"local client save", "POST", "127.0.0.1:1234", "", "", "application/json; charset=utf-8", 200, 1},
		{"cross origin JSON", "POST", "127.0.0.1:1234", "https://example.com", "", "application/json", 403, 0},
		{"cross origin form", "POST", "127.0.0.1:1234", "https://example.com", "cross-site", "text/plain", 403, 0},
		{"opaque origin", "POST", "127.0.0.1:1234", "null", "", "application/json", 403, 0},
		{"another local port", "POST", "127.0.0.1:1234", "http://127.0.0.1:5678", "same-site", "application/json", 403, 0},
		{"DNS rebinding", "POST", "example.com:1234", "http://example.com:1234", "same-origin", "application/json", 403, 0},
		{"plain body no origin", "POST", "127.0.0.1:1234", "", "", "text/plain", 415, 0},
		{"unsupported method", "PUT", "127.0.0.1:1234", "", "", "application/json", 405, 0},
		{"cross origin delete", "DELETE", "127.0.0.1:1234", "https://example.com", "", "", 403, 0},
		{"cross origin read", "GET", "127.0.0.1:1234", "https://example.com", "", "", 403, 0},
		{"local delete", "DELETE", "127.0.0.1:1234", "", "", "", 200, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := &guardTestStore{value: credential.Credentials{Username: "original", Password: "original"}}
			s := &Server{store: store}
			mux := authedRoutes(s, fstest.MapFS{})
			req := httptest.NewRequest(tc.method, "http://"+tc.host+"/api/credential", strings.NewReader(`{"username":"replacement","password":"not-real"}`))
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			req.Header.Set("Content-Type", tc.contentType)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, req)
			if w.Code != tc.want || store.writes != tc.writes {
				t.Fatalf("status=%d writes=%d, want %d/%d", w.Code, store.writes, tc.want, tc.writes)
			}
			if tc.want != http.StatusOK {
				assertAPIError(t, w)
			}
			if tc.writes == 0 && store.value.Username != "original" {
				t.Fatal("rejected request changed credentials")
			}
		})
	}
}

func TestMutatingAPIsRejectGET(t *testing.T) {
	s := &Server{}
	mux := authedRoutes(s, fstest.MapFS{})
	for _, path := range []string{"/api/login", "/api/logout", "/api/vpn/connect", "/api/vpn/auth", "/api/vpn/disconnect", "/api/vpn/proxy"} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", "http://127.0.0.1:1234"+path, nil))
		if w.Code != 405 {
			t.Fatalf("%s returned %d", path, w.Code)
		}
		assertAPIError(t, w)
	}
}

// assertAPIError 要求错误响应是统一的 {"ok":false,"message":"..."}。
// 纯文本错误会让页面只能显示笼统的“服务响应异常”，真实原因就丢了。
func assertAPIError(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	kind, _, _ := mime.ParseMediaType(w.Header().Get("Content-Type"))
	var body struct {
		OK      *bool  `json:"ok"`
		Message string `json:"message"`
	}
	if kind != "application/json" || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.OK == nil || *body.OK || body.Message == "" {
		t.Fatalf("API error must be JSON: %d %q %s", w.Code, w.Header().Get("Content-Type"), w.Body.String())
	}
}

type failingCredentialStore struct{ guardTestStore }

func (failingCredentialStore) Save(credential.Credentials) error {
	return errors.New("写入凭据失败: Access is denied.")
}
func (failingCredentialStore) Delete() error {
	return errors.New("删除凭据失败: Access is denied.")
}

func TestCredentialStoreFailuresKeepRealReason(t *testing.T) {
	s := &Server{store: &failingCredentialStore{}}
	mux := authedRoutes(s, fstest.MapFS{})
	for _, method := range []string{http.MethodPost, http.MethodDelete} {
		req := httptest.NewRequest(method, "http://127.0.0.1:1234/api/credential", strings.NewReader(`{"username":"123456","password":"not-real-secret"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), "Access is denied") || strings.Contains(w.Body.String(), "not-real-secret") {
			t.Fatalf("%s: %d %s", method, w.Code, w.Body.String())
		}
		assertAPIError(t, w)
	}
}

// writeAPIError 只在无构建标签的文件里定义一份，默认构建和 campusvpn 构建输出一致：
// 不做 HTML 转义，页面拿到的就是原文。
func TestWriteAPIErrorKeepsMessageVerbatim(t *testing.T) {
	w := httptest.NewRecorder()
	writeAPIError(w, http.StatusConflict, errors.New("请先断开 <VPN> & 重试"))
	if w.Code != http.StatusConflict || strings.TrimSpace(w.Body.String()) != `{"message":"请先断开 <VPN> & 重试","ok":false}` {
		t.Fatalf("unexpected API error: %d %s", w.Code, w.Body.String())
	}
	assertAPIError(t, w)
}

// 页面与本地服务版本不一致时会请求已改名或删除的接口，也要拿到 JSON 错误，
// 而不是静态文件服务的纯文本“404 page not found”。
func TestUnknownAPIPathsReturnJSON(t *testing.T) {
	mux := authedRoutes(&Server{}, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/removed-endpoint"},
		{http.MethodDelete, "/api/vpn/renamed"},
		{http.MethodPost, "/api/"},
		{http.MethodGet, "/api"},
	} {
		req := httptest.NewRequest(tc.method, "http://127.0.0.1:1234"+tc.path, strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), "没有这个接口") {
			t.Fatalf("%s %s: %d %s", tc.method, tc.path, w.Code, w.Body.String())
		}
		assertAPIError(t, w)
	}
	// 其他来源的页面探测未知接口，照样先被来源检查挡下。
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/removed-endpoint", nil)
	req.Header.Set("Origin", "http://evil.invalid")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-origin probe: %d", w.Code)
	}
	assertAPIError(t, w)
}
