package ui

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// testAPIToken 与 acquireInstance 生成的凭据同一格式：64 位小写十六进制。
var testAPIToken = strings.Repeat("0123456789abcdef", 4)

// authedRoutes 注册全部路由，并替没带凭据的请求补上本次运行的 X-SZU-Token。
// 用它的用例测的是接口本身；调用方鉴权由本文件的用例直接对 s.routes 覆盖。
func authedRoutes(s *Server, static fs.FS) http.Handler {
	if s.apiToken == "" {
		s.apiToken = testAPIToken
	}
	mux := http.NewServeMux()
	s.routes(mux, static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(apiTokenHeader) == "" {
			r.Header.Set(apiTokenHeader, s.apiToken)
		}
		mux.ServeHTTP(w, r)
	})
}

type registeredRoute struct{ path, guard string }

// apiRoutesInSource 从 server.go 读出全部 /api 路由和各自用的保护函数，
// 以后新增接口不用记得来这里登记，也躲不开凭据检查。
func apiRoutesInSource(t *testing.T) []registeredRoute {
	t.Helper()
	source, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`unknownAPI := s\.protectAPI\(`).Match(source) {
		t.Fatal("未知 /api 路径必须同样经过凭据检查")
	}
	var routes []registeredRoute
	for _, m := range regexp.MustCompile(`mux\.HandleFunc\("(/api[^"]*)",\s*([\w.]+)`).FindAllSubmatch(source, -1) {
		routes = append(routes, registeredRoute{string(m[1]), string(m[2])})
	}
	if len(routes) < 40 {
		t.Fatalf("只从 server.go 读到 %d 条 /api 路由，正则可能失效了", len(routes))
	}
	return routes
}

var publicRoutes = map[string]bool{"/api/health": true, "/api/instance": true}

func TestEveryAPIRouteRequiresCallerToken(t *testing.T) {
	routes := apiRoutesInSource(t)
	for _, route := range routes {
		want := "s.protectAPI"
		if route.path == "/api" || route.path == "/api/" {
			want = "unknownAPI"
		}
		if publicRoutes[route.path] {
			want = "publicAPI"
		}
		if route.guard != want {
			t.Errorf("%s 用的是 %s，应为 %s", route.path, route.guard, want)
		}
	}
	if t.Failed() {
		return // 保护函数用错时，下面逐条请求可能直接跑进没有初始化的处理函数
	}

	wrong := strings.Repeat("f", 64)
	for _, server := range []*Server{{apiToken: testAPIToken}, {}} {
		mux := http.NewServeMux()
		server.routes(mux, fstest.MapFS{})
		for _, route := range routes {
			if publicRoutes[route.path] {
				continue
			}
			for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
				for name, apply := range map[string]func(*http.Request){
					"无凭据":             func(*http.Request) {},
					"空请求头和空 Cookie":   func(r *http.Request) { r.Header.Set(apiTokenHeader, ""); r.Header.Set("Cookie", sessionCookieName+"=") },
					"错误请求头":           func(r *http.Request) { r.Header.Set(apiTokenHeader, wrong) },
					"错误 Cookie":       func(r *http.Request) { r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: wrong}) },
					"大写凭据":            func(r *http.Request) { r.Header.Set(apiTokenHeader, strings.ToUpper(testAPIToken)) },
					"多一个字符":           func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken+"0") },
					"少一个字符":           func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken[1:]) },
					"凭据放在查询参数":        func(r *http.Request) { r.URL.RawQuery = launchParam + "=" + testAPIToken },
					"凭据放在别的 Cookie 名": func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "session", Value: testAPIToken}) },
				} {
					req := httptest.NewRequest(method, "http://127.0.0.1:1234"+route.path, strings.NewReader("{}"))
					req.Header.Set("Content-Type", "application/json")
					apply(req)
					w := httptest.NewRecorder()
					mux.ServeHTTP(w, req)
					if w.Code != http.StatusUnauthorized {
						t.Fatalf("%s %s（%s，服务端凭据=%q）：%d %s", method, route.path, name, server.apiToken, w.Code, w.Body.String())
					}
					assertAPIError(t, w)
					if !strings.Contains(w.Body.String(), "请从 szuDesktop 重新打开页面") {
						t.Fatalf("401 文案不对：%s", w.Body.String())
					}
					if strings.Contains(w.Body.String()+strings.Join(w.Header().Values("Set-Cookie"), ""), testAPIToken) {
						t.Fatal("拒绝响应里出现了凭据")
					}
				}
			}
		}
	}
}

func TestPublicAPIsNeedNoHeaderOrCookie(t *testing.T) {
	var opened []string
	old := openBrowser
	openBrowser = func(url string) error { opened = append(opened, url); return nil }
	defer func() { openBrowser = old }()

	base := "http://127.0.0.1:1234"
	s := &Server{apiToken: testAPIToken, windows: newWindowSessions(),
		instance: &desktopInstance{instanceRecord: instanceRecord{URL: base, Token: testAPIToken}}}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, base+"/api/health", nil))
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), testAPIToken) {
		t.Fatalf("health: %d %s", w.Code, w.Body.String())
	}

	activate := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, base+"/api/instance", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}
	if w := activate(`{"token":"` + strings.Repeat("f", 64) + `","open":true}`); w.Code != http.StatusForbidden {
		t.Fatalf("wrong instance token: %d", w.Code)
	}
	if w := activate(`{"token":"` + testAPIToken + `","open":false}`); w.Code != http.StatusOK || len(opened) != 0 {
		t.Fatalf("instance activation: %d %v", w.Code, opened)
	}
	// 再次双击便携版时打开的地址必须带 launch 参数，新页面才能换到会话 Cookie。
	if w := activate(`{"token":"` + testAPIToken + `","open":true}`); w.Code != http.StatusOK {
		t.Fatalf("instance open: %d", w.Code)
	}
	if len(opened) != 1 || opened[0] != base+"/?launch="+testAPIToken {
		t.Fatalf("opened %v", opened)
	}
	if strings.Contains(w.Body.String(), testAPIToken) {
		t.Fatal("instance 响应里出现了凭据")
	}
}

func TestAPIAcceptsTokenHeaderOrSessionCookie(t *testing.T) {
	store := &guardTestStore{value: credential.Credentials{Username: "private-test", Password: "not-real"}}
	s := &Server{store: store, apiToken: testAPIToken}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})
	foreign := &http.Cookie{Name: sessionCookieName, Value: strings.Repeat("e", 64)}
	ours := &http.Cookie{Name: sessionCookieName, Value: testAPIToken}
	for _, tc := range []struct {
		name, host, origin, site string
		credential               func(*http.Request)
		want                     int
	}{
		{"请求头", "127.0.0.1:1234", "", "", func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }, 200},
		{"Cookie", "127.0.0.1:1234", "", "", func(r *http.Request) { r.AddCookie(ours) }, 200},
		{"同源页面带 Cookie", "127.0.0.1:1234", "http://127.0.0.1:1234", "same-origin", func(r *http.Request) { r.AddCookie(ours) }, 200},
		// 本机别的网页服务给 127.0.0.1 种了同名 Cookie（Cookie 不按端口隔离），我们的那个仍然有效。
		{"同名 Cookie 在前", "127.0.0.1:1234", "", "", func(r *http.Request) { r.AddCookie(foreign); r.AddCookie(ours) }, 200},
		{"请求头错但 Cookie 对", "127.0.0.1:1234", "", "", func(r *http.Request) { r.Header.Set(apiTokenHeader, strings.Repeat("e", 64)); r.AddCookie(ours) }, 200},
		{"localhost", "localhost:1234", "", "", func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }, 200},
		// 有凭据也挡不住跨站和 DNS 重绑定。
		{"跨域 Origin 带请求头", "127.0.0.1:1234", "https://example.com", "", func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }, 403},
		{"本机别的端口带 Cookie", "127.0.0.1:1234", "http://127.0.0.1:5678", "same-site", func(r *http.Request) { r.AddCookie(ours) }, 403},
		{"跨站 Sec-Fetch-Site 带 Cookie", "127.0.0.1:1234", "", "cross-site", func(r *http.Request) { r.AddCookie(ours) }, 403},
		{"DNS 重绑定带请求头", "example.com:1234", "", "", func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }, 403},
		{"只有别人的同名 Cookie", "127.0.0.1:1234", "", "", func(r *http.Request) { r.AddCookie(foreign) }, 401},
	} {
		req := httptest.NewRequest(http.MethodGet, "http://"+tc.host+"/api/credential?reveal=1", nil)
		req.Header.Set("Origin", tc.origin)
		req.Header.Set("Sec-Fetch-Site", tc.site)
		tc.credential(req)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != tc.want {
			t.Fatalf("%s: %d %s", tc.name, w.Code, w.Body.String())
		}
		if tc.want == http.StatusOK && !strings.Contains(w.Body.String(), "private-test") {
			t.Fatalf("%s: %s", tc.name, w.Body.String())
		}
		if tc.want != http.StatusOK {
			assertAPIError(t, w)
			if strings.Contains(w.Body.String(), "private-test") {
				t.Fatalf("%s 被拒绝时仍泄露了账号", tc.name)
			}
		}
	}
}

// 凭据只从标准输出交给外壳：状态、健康和错误响应里都不能出现它，也不会被接口重新下发 Cookie。
func TestTokenNeverAppearsInAPIResponses(t *testing.T) {
	s := &Server{apiToken: testAPIToken, store: &statusTestStore{err: credential.ErrNotFound},
		detect:   func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneOutside} },
		instance: &desktopInstance{instanceRecord: instanceRecord{URL: "http://127.0.0.1:1234", Token: testAPIToken}}}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{})
	for _, tc := range []struct {
		path string
		want int
		auth func(*http.Request)
	}{
		{"/api/status", http.StatusOK, func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }},
		{"/api/status", http.StatusOK, func(r *http.Request) { r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: testAPIToken}) }},
		{"/api/health", http.StatusOK, func(*http.Request) {}},
		{"/api/removed-endpoint", http.StatusNotFound, func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken) }},
		{"/api/status", http.StatusUnauthorized, func(r *http.Request) { r.Header.Set(apiTokenHeader, testAPIToken[:63]) }},
	} {
		req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234"+tc.path, nil)
		tc.auth(req)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		var headers strings.Builder
		for name, values := range w.Header() {
			headers.WriteString(name + ": " + strings.Join(values, ",") + "\n")
		}
		if w.Code != tc.want || strings.Contains(w.Body.String()+headers.String(), testAPIToken) || w.Header().Get("Set-Cookie") != "" {
			t.Fatalf("%s: %d %s\n%s", tc.path, w.Code, w.Body.String(), headers.String())
		}
	}
}

func sessionCookieFrom(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	cookies := (&http.Response{Header: w.Header()}).Cookies()
	if len(cookies) != 1 || cookies[0].Name != sessionCookieName {
		t.Fatalf("Set-Cookie: %v", w.Header().Values("Set-Cookie"))
	}
	return cookies[0]
}

func TestLaunchExchangesTokenForSessionCookie(t *testing.T) {
	store := &guardTestStore{value: credential.Credentials{Username: "private-test", Password: "not-real"}}
	s := &Server{store: store, apiToken: testAPIToken}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	for _, tc := range []struct{ path, location string }{
		{"/?launch=" + testAPIToken, "/"},
		{"/index.html?launch=" + testAPIToken, "/"},
		// 其他参数原样保留，只去掉凭据。
		{"/?smoke=backup&launch=" + testAPIToken, "/?smoke=backup"},
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234"+tc.path, nil))
		if w.Code != http.StatusSeeOther || w.Header().Get("Location") != tc.location {
			t.Fatalf("%s: %d Location=%q", tc.path, w.Code, w.Header().Get("Location"))
		}
		if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Referrer-Policy") != "no-referrer" {
			t.Fatalf("%s: 跳转响应不能被缓存或带出 Referer：%v", tc.path, w.Header())
		}
		if strings.Contains(w.Body.String(), testAPIToken) {
			t.Fatalf("%s: 跳转正文里出现了凭据", tc.path)
		}
		cookie := sessionCookieFrom(t, w)
		raw := w.Header().Get("Set-Cookie")
		if cookie.Value != testAPIToken || cookie.Path != "/" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Domain != "" || cookie.Secure || !cookie.Expires.IsZero() || cookie.MaxAge != 0 {
			t.Fatalf("%s: Cookie 属性不对：%s", tc.path, raw)
		}
		// 拿到的 Cookie 能直接调接口。
		req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/credential", nil)
		req.AddCookie(&http.Cookie{Name: cookie.Name, Value: cookie.Value})
		api := httptest.NewRecorder()
		mux.ServeHTTP(api, req)
		if api.Code != http.StatusOK {
			t.Fatalf("%s: Cookie 调接口 %d %s", tc.path, api.Code, api.Body.String())
		}
	}
}

func TestInvalidLaunchIsIgnored(t *testing.T) {
	for _, tc := range []struct {
		name, method, host, launch, serverToken string
	}{
		{"错误凭据", http.MethodGet, "127.0.0.1:1234", strings.Repeat("f", 64), testAPIToken},
		{"大写凭据", http.MethodGet, "127.0.0.1:1234", strings.ToUpper(testAPIToken), testAPIToken},
		{"长度不对", http.MethodGet, "127.0.0.1:1234", testAPIToken[:63], testAPIToken},
		{"空参数", http.MethodGet, "127.0.0.1:1234", "", testAPIToken},
		{"服务端没有凭据时的空参数", http.MethodGet, "127.0.0.1:1234", "", ""},
		// DNS 重绑定：别的域名指到 127.0.0.1，就算拿到凭据也不给它的站点下发 Cookie。
		{"非回环 Host", http.MethodGet, "example.com:1234", testAPIToken, testAPIToken},
		{"POST 首页", http.MethodPost, "127.0.0.1:1234", testAPIToken, testAPIToken},
		{"HEAD 首页", http.MethodHead, "127.0.0.1:1234", testAPIToken, testAPIToken},
	} {
		s := &Server{apiToken: tc.serverToken}
		mux := http.NewServeMux()
		s.routes(mux, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(tc.method, "http://"+tc.host+"/?launch="+tc.launch, nil))
		if w.Code != http.StatusOK || len(w.Header().Values("Set-Cookie")) != 0 || w.Header().Get("Location") != "" {
			t.Fatalf("%s: %d Set-Cookie=%v Location=%q", tc.name, w.Code, w.Header().Values("Set-Cookie"), w.Header().Get("Location"))
		}
	}
	// 只有首页换 Cookie，静态资源路径上的 launch 参数不理会。
	s := &Server{apiToken: testAPIToken}
	mux := http.NewServeMux()
	s.routes(mux, fstest.MapFS{"garden/app.mjs": {Data: []byte("export {}")}})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/assets/garden/app.mjs?launch="+testAPIToken, nil))
	if w.Code != http.StatusOK || len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatalf("static asset: %d %v", w.Code, w.Header().Values("Set-Cookie"))
	}
}

// lockedBuffer 收集 Run 在另一个 goroutine 里写出的协议行。
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}
func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// Run 把地址和凭据作为两行完整的协议行交给外壳（格式与 listen-url.mjs 严格一致）；
// 复用启动器交出的是正在运行那份服务的同一份凭据。
func TestRunAnnouncesTokenAndReuseSharesIt(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	out := &lockedBuffer{}
	oldOutput := startupOutput
	startupOutput = out
	defer func() { startupOutput = oldOutput }()

	s := New(Options{NoOpen: true})
	s.store = &statusTestStore{err: credential.ErrNotFound}
	s.vpn = quietVPN()
	runErr := make(chan error, 1)
	go func() { runErr <- s.Run() }()

	started := regexp.MustCompile(`\AszuDesktop 已启动: (http://127\.0\.0\.1:\d+)\nszuDesktop 会话: ([0-9a-f]{64})\n\z`)
	var base, token string
	for deadline := time.Now().Add(5 * time.Second); base == ""; time.Sleep(20 * time.Millisecond) {
		if m := started.FindStringSubmatch(out.String()); m != nil {
			base, token = m[1], m[2]
		} else if time.Now().After(deadline) {
			t.Fatalf("没有等到协议行：%q", out.String())
		}
	}
	var record instanceRecord
	data, err := os.ReadFile(filepath.Join(dir, "desktop-instance.json"))
	if err != nil || json.Unmarshal(data, &record) != nil || record.URL != base || record.Token != token {
		t.Fatalf("协议行与实例记录不一致：%v %s", err, data)
	}

	get := func(path string, header bool) int {
		req, _ := http.NewRequest(http.MethodGet, base+path, nil)
		if header {
			req.Header.Set(apiTokenHeader, token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if code := get("/api/credential", false); code != http.StatusUnauthorized {
		t.Fatalf("没带凭据：%d", code)
	}
	if code := get("/api/credential", true); code != http.StatusOK {
		t.Fatalf("带凭据：%d", code)
	}
	if code := get("/api/health", false); code != http.StatusOK {
		t.Fatalf("health：%d", code)
	}

	// 第二次启动复用这一份服务，交出同一份凭据。
	second := New(Options{NoOpen: true})
	second.vpn = quietVPN()
	before := len(out.String())
	if err := second.Run(); err != nil {
		t.Fatal(err)
	}
	if got, want := out.String()[before:], "szuDesktop 已复用: "+base+"\nszuDesktop 会话: "+token+"\n"; got != want {
		t.Fatalf("复用协议行：%q，应为 %q", got, want)
	}

	req, _ := http.NewRequest(http.MethodPost, base+"/api/shutdown", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(apiTokenHeader, token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	select {
	case err := <-runErr:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run 没有退出")
	}
}

func TestNewServerAlwaysHasRandomToken(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	a, b := New(Options{}), New(Options{})
	if !validAPIToken(a.apiToken) || !validAPIToken(b.apiToken) || a.apiToken == b.apiToken {
		t.Fatalf("凭据：%q %q", a.apiToken, b.apiToken)
	}
	for _, token := range []string{"", testAPIToken[:62], strings.ToUpper(testAPIToken), testAPIToken[:63] + "g", testAPIToken + "00"} {
		if validAPIToken(token) || tokenMatches(token, token) {
			t.Fatalf("接受了格式不对的凭据 %q", token)
		}
	}
	if !tokenMatches(testAPIToken, testAPIToken) || tokenMatches("", "") {
		t.Fatal("tokenMatches")
	}
}
