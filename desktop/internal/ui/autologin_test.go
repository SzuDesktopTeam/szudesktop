package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// TestLoginStillAuthenticatesWhenAlreadyOnline 锁死一个真实故障。
//
// 症状：程序明明能上外网，用户点「登录」却什么都没发生，
// 只弹一句"已经能上外网，不用再认证"——看着像登录成功了，其实一次
// 认证请求都没发。
//
// 根因：doLogin 在 zone == online 时直接 return。但"能上外网"和
// "我的账号已经在这个区认证过"是两回事：连着有线/热点/别人的会话残留时，
// 外网是通的，可用户点登录就是想把自己的会话建立起来。
//
// 修法：联网时不再直接放弃，而是看协议指纹指向哪个区，按那套协议真登录一次。
// 这条用例保证：只要指纹认得出区，就必须真的发出认证请求。
func TestLoginStillAuthenticatesWhenAlreadyOnline(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	var sawLogin bool
	srun := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
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
	defer srun.Close()

	s := New(Options{SrunHost: srun.URL, Zone: "auto"})

	// 直接按"指纹认出了教学区"的路径验证：登录必须真的打出去。
	// 指定 ac_id，免得自动发现去访问外网的跳转探测地址。
	res := s.loginWithProtocol(portal.ZoneTeaching, "123456", "not-real", "12")
	if !res.OK || !sawLogin {
		t.Fatalf("指纹认出教学区后必须真的走一次深澜认证: result=%+v sawLogin=%v", res, sawLogin)
	}
	if !strings.Contains(res.Message, "成功") {
		t.Fatalf("应报告认证成功，实际: %s", res.Message)
	}
}

// TestLoginWithProtocolDormHitsEportal 确认宿舍区那条分支打的是 ePortal。
func TestLoginWithProtocolDormHitsEportal(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	var sawLogin bool
	drcom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/eportal/portal/login" {
			http.NotFound(w, r)
			return
		}
		sawLogin = true
		_, _ = w.Write([]byte(`dr1003({"result":1,"msg":"认证成功"})`))
	}))
	defer drcom.Close()

	s := New(Options{DrcomHost: drcom.URL, Zone: "auto"})
	res := s.loginWithProtocol(portal.ZoneDorm, "123456", "not-real", "")
	if !res.OK || !sawLogin {
		t.Fatalf("宿舍区必须走 ePortal 认证: result=%+v sawLogin=%v", res, sawLogin)
	}
}

// autoLoginPortal 是一个宿舍区假门户：rad_user_info 按 online 回答，登录按 loginBody 回答。
func autoLoginPortal(t *testing.T, online bool, loginBody string, logins *int32) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/eportal/portal/rad_user_info":
			if online {
				_, _ = w.Write([]byte(`dr1003({"result":1})`))
			} else {
				_, _ = w.Write([]byte(`dr1003({"result":0})`))
			}
		case "/eportal/portal/login":
			atomic.AddInt32(logins, 1)
			_, _ = w.Write([]byte(loginBody))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func autoLoginStatus(t *testing.T, s *Server) (map[string]json.RawMessage, *autoLoginResult) {
	t.Helper()
	rec := httptest.NewRecorder()
	s.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rec.Body.String(), "S3cretPass") {
		t.Fatalf("status revealed the password: %s", rec.Body.String())
	}
	field, ok := raw["auto_login"]
	if !ok {
		return raw, nil
	}
	var result autoLoginResult
	if err := json.Unmarshal(field, &result); err != nil {
		t.Fatal(err)
	}
	return raw, &result
}

// 教学区门户把密码原样写进 error_msg 时（深澜的兜底提示会把 error/error_msg 原文拼进 Message），
// /api/status 里的自动登录说明仍然不能出现密码：这一层 scrubSecret 是独立于 portal 层的最后一道兜底，
// 不能因为宿舍区门户已经隐去正文就当它没用。
func TestAutoLoginScrubsPasswordEchoedBySrunPortal(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	const password = "S3cretPass"
	var logins int32
	srun := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/rad_user_info":
			_, _ = w.Write([]byte(`_({"error":"not_online_error"})`))
		case "/cgi-bin/get_challenge":
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.0.0.8","error":"ok"})`))
		case "/cgi-bin/srun_portal":
			atomic.AddInt32(&logins, 1)
			_, _ = w.Write([]byte(`_({"error":"E2616","error_msg":"portal echoed ` + password + ` back"})`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srun.Close()
	s := New(Options{SrunHost: srun.URL, DrcomHost: srun.URL, AutoLogin: true, AcID: "12"})
	s.store = &guardTestStore{value: credential.Credentials{Username: "123456", Password: password}}
	s.detect = func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneTeaching} }
	s.probe = func() *portal.DetectResult { return &portal.DetectResult{Zone: portal.ZoneTeaching, Probed: true} }
	s.runAutoLogin()
	_, got := autoLoginStatus(t, s) // 状态正文里出现密码会直接 Fatal
	if atomic.LoadInt32(&logins) != 1 || got == nil || got.Result != autoLoginFailed {
		t.Fatalf("logins=%d auto_login=%+v", logins, got)
	}
	if strings.Contains(got.Message, password) || !strings.Contains(got.Message, "***") {
		t.Fatalf("门户回显的密码没有被隐去：%q", got.Message)
	}
}

// 启动时自动连接校园网：本机已在线就跳过，失败要在 /api/status 里看得到，
// 而且说明里不能带密码；没保存账号时不算尝试，字段省略。
func TestAutoLoginOutcomesAreReportedInStatus(t *testing.T) {
	saved := credential.Credentials{Username: "123456", Password: "S3cretPass"}
	for _, tc := range []struct {
		name      string
		store     credential.Store
		online    bool
		zone      portal.Zone
		loginBody string
		result    string
		message   string
		logins    int32
	}{
		{"already online", &guardTestStore{value: saved}, true, portal.ZoneDorm, `dr1003({"result":1})`, autoLoginSkipped, "已在校园网在线", 0},
		{"login ok", &guardTestStore{value: saved}, false, portal.ZoneDorm, `dr1003({"result":1,"msg":"认证成功"})`, autoLoginOK, "认证成功", 1},
		{"login failed", &guardTestStore{value: saved}, false, portal.ZoneDorm, `dr1003({"result":0,"msg":"口令已过期"})`, autoLoginFailed, "已过期", 1},
		{"portal echoes the password", &guardTestStore{value: saved}, false, portal.ZoneDorm, `dr1003({"result":0,"msg":"口令 S3cretPass 已过期"})`, autoLoginFailed, "隐去", 1},
		{"off campus", &guardTestStore{value: saved}, false, portal.ZoneOutside, `dr1003({"result":1})`, autoLoginSkipped, "没有检测到校园网认证门户", 0},
		{"nothing saved", &statusTestStore{err: credential.ErrNotFound}, false, portal.ZoneDorm, `dr1003({"result":1})`, "", "", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
			var logins int32
			fake := autoLoginPortal(t, tc.online, tc.loginBody, &logins)
			s := New(Options{SrunHost: fake.URL, DrcomHost: fake.URL, AutoLogin: true})
			s.store = tc.store
			s.detect = func() *portal.DetectResult { return &portal.DetectResult{Zone: tc.zone} }
			s.probe = func() *portal.DetectResult {
				return &portal.DetectResult{Zone: tc.zone, Probed: true, DormUsable: tc.zone == portal.ZoneDorm}
			}
			before := time.Now().Unix()
			s.runAutoLogin()
			_, got := autoLoginStatus(t, s)
			if n := atomic.LoadInt32(&logins); n != tc.logins {
				t.Fatalf("login requests = %d, want %d", n, tc.logins)
			}
			if tc.result == "" {
				if got != nil {
					t.Fatalf("no saved account must not report an attempt: %+v", got)
				}
				return
			}
			if got != nil && strings.Contains(got.Message, "S3cretPass") {
				t.Fatalf("auto_login message leaks the password: %q", got.Message)
			}
			if got == nil || got.Result != tc.result || !strings.Contains(got.Message, tc.message) || got.At < before {
				t.Fatalf("auto_login = %+v, want %s containing %q", got, tc.result, tc.message)
			}
		})
	}
}
