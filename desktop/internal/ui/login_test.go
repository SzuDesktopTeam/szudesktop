package ui

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

func TestDoLoginUsesRequestedTeachingZone(t *testing.T) {
	// 隔离配置目录：ac_id 缓存（netpref）不能读写开发者真实的 ~/.szunet。
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	var sawChallenge, sawLogin bool
	portal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
			sawChallenge = true
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.0.0.8","error":"ok"})`))
		case "/srun_portal_pc":
			_, _ = w.Write([]byte(`var acid = 12;`))
		case "/cgi-bin/srun_portal":
			sawLogin = true
			_, _ = w.Write([]byte(`_({"error":"ok","suc_msg":"login_ok"})`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer portal.Close()

	s := New(Options{SrunHost: portal.URL, Zone: "auto"})
	// 指定 ac_id，免得自动发现去访问外网的跳转探测地址。
	res := s.doLogin("123456", "not-real", "teaching", "12")
	if !res.OK || !sawChallenge || !sawLogin {
		t.Fatalf("forced teaching login did not complete: result=%+v challenge=%v login=%v", res, sawChallenge, sawLogin)
	}
}

func TestDoLoginUsesRequestedDormZone(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	var sawLogin bool
	portal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/eportal/portal/login" {
			http.NotFound(w, r)
			return
		}
		sawLogin = true
		_, _ = w.Write([]byte(`dr1003({"result":1,"msg":"认证成功"})`))
	}))
	defer portal.Close()

	s := New(Options{DrcomHost: portal.URL, Zone: "auto"})
	res := s.doLogin("123456", "not-real", "dorm", "")
	if !res.OK || !sawLogin {
		t.Fatalf("forced dorm login did not complete: result=%+v login=%v", res, sawLogin)
	}
}

// hangUpPortal 对指定路径直接挂断连接，模拟高峰期门户断连；其余路径按深澜应答。
func hangUpPortal(t *testing.T, hangUp func(path string) bool) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hangUp(r.URL.Path) {
			conn, _, err := http.NewResponseController(w).Hijack()
			if err == nil {
				_ = conn.Close()
			}
			return
		}
		if r.URL.Path == "/cgi-bin/get_challenge" {
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.0.0.8","error":"ok"})`))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// 宿舍区 Dr.COM 把明文密码放在登录 URL 的查询参数里，net/http 的 *url.Error
// 会把整个 URL 带进错误文本。登录失败的提示和 /api/status 的 last_error
// 绝不能包含密码，也不能包含请求地址。
func TestLoginNetworkFailuresNeverRevealPassword(t *testing.T) {
	const password = "S3cret Pa55&word"
	closed := httptest.NewServer(http.NotFoundHandler())
	refused := closed.URL
	closed.Close()
	for _, tc := range []struct {
		name, zone, host, want string
	}{
		{"dorm hang-up", "dorm", hangUpPortal(t, func(string) bool { return true }).URL, "连接中断"},
		{"dorm refused", "dorm", refused, "连不上认证门户"},
		{"teaching hang-up after challenge", "teaching", hangUpPortal(t, func(p string) bool { return p == "/cgi-bin/srun_portal" }).URL, "连接中断"},
		{"teaching refused", "teaching", refused, "连不上认证门户"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
			s := New(Options{SrunHost: tc.host, DrcomHost: tc.host, AcID: "12"})
			s.store = &guardTestStore{}
			s.detect = func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneOutside} }
			mux := authedRoutes(s, fstest.MapFS{})
			body, _ := json.Marshal(map[string]string{"username": "123456", "password": password, "zone": tc.zone})
			req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:1234/api/login", strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			login := httptest.NewRecorder()
			mux.ServeHTTP(login, req)
			status := httptest.NewRecorder()
			mux.ServeHTTP(status, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1234/api/status", nil))

			var got loginResp
			if err := json.Unmarshal(login.Body.Bytes(), &got); err != nil || got.OK || !strings.Contains(got.Message, tc.want) {
				t.Fatalf("login failure must be a fixed friendly message: %s", login.Body.String())
			}
			var st statusResp
			if err := json.Unmarshal(status.Body.Bytes(), &st); err != nil || st.LastError != got.Message {
				t.Fatalf("last_error should cache the same safe message: %s", status.Body.String())
			}
			for _, leaked := range []string{password, url.QueryEscape(password), "user_password", "{MD5}", "http://", tc.host} {
				if strings.Contains(login.Body.String(), leaked) || strings.Contains(status.Body.String(), leaked) {
					t.Fatalf("response leaked %q:\nlogin=%s\nstatus=%s", leaked, login.Body.String(), status.Body.String())
				}
			}
		})
	}
}

type timeoutError struct{}

func (timeoutError) Error() string   { return "i/o timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }

func TestPortalErrorMessageClassifiesWithoutDetails(t *testing.T) {
	const secretURL = "http://172.30.255.42/eportal/portal/login?user_account=%2C0%2C123456&user_password=MySecretPass"
	wrap := func(err error) error { return &url.Error{Op: "Get", URL: secretURL, Err: err} }
	for _, tc := range []struct {
		err  error
		want string
	}{
		{wrap(&net.OpError{Op: "dial", Net: "tcp", Err: &net.DNSError{Err: "no such host", Name: "net.szu.edu.cn", IsNotFound: true}}), "解析不到"},
		{wrap(timeoutError{}), "超时"},
		{wrap(&net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connectex: No connection could be made")}), "连不上"},
		{wrap(io.EOF), "连接中断"},
		{fmt.Errorf("读取响应失败: %w", &net.OpError{Op: "read", Net: "tcp", Err: errors.New("wsarecv: An existing connection was forcibly closed")}), "连接中断"},
		// 没用 %w 包装、地址混进文本里的，也只能给固定文案。
		{fmt.Errorf("发送登录请求失败: %v", wrap(io.EOF)), "无法识别"},
	} {
		msg := portalErrorMessage("认证", tc.err, "MySecretPass")
		if !strings.HasPrefix(msg, "认证失败：") || !strings.Contains(msg, tc.want) {
			t.Errorf("%v => %q, want %q", tc.err, msg, tc.want)
		}
		if strings.Contains(msg, "MySecretPass") || strings.Contains(msg, "http") || strings.Contains(msg, "wsarecv") {
			t.Errorf("message leaked details: %q", msg)
		}
	}
	// 门户自己回的错误不带地址，对排查有用：保留原文，只去掉密码。
	for _, tc := range []struct {
		err  error
		want string
	}{
		{errors.New("服务端没有返回 challenge（error=auth_info_error）"), "认证失败：服务端没有返回 challenge（error=auth_info_error）"},
		{fmt.Errorf("解析登录响应失败: %w", errors.New("invalid character '<' looking for beginning of value")), "认证失败：解析登录响应失败: invalid character"},
		{errors.New("门户回显了 MySecretPass"), "认证失败：门户回显了 ***"},
	} {
		if msg := portalErrorMessage("认证", tc.err, "MySecretPass"); !strings.HasPrefix(msg, tc.want) || strings.Contains(msg, "MySecretPass") {
			t.Errorf("%v => %q, want prefix %q", tc.err, msg, tc.want)
		}
	}
	if got := scrubSecret("认证失败：a&b c a%26b+c", "a&b c"); strings.Contains(got, "a&b") || strings.Contains(got, "a%26b") {
		t.Fatalf("secret not scrubbed: %q", got)
	}
}
