package ui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

func TestAutoCampusLoginKeepsProbeFakeIPAdvice(t *testing.T) {
	s := New(Options{})
	s.probe = func() *portal.DetectResult {
		return &portal.DetectResult{Zone: portal.ZoneOutside, Probed: true, SrunDNSOK: true, SrunDNSFakeIP: true}
	}
	res := s.doLogin("123456", "not-real", "auto", "")
	if res.OK || !strings.Contains(res.Message, takeoverText) || !strings.Contains(res.Message, "尚未验证") {
		t.Fatalf("判区失败不能丢掉已检测出的 Fake-IP 建议：%+v", res)
	}
}

func TestCampusPortalNetworkErrorsExplainFakeIP(t *testing.T) {
	for _, action := range []string{"认证", "注销"} {
		t.Run(action, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			err := &url.Error{Op: "Get", URL: "https://net.szu.edu.cn/cgi-bin/srun_portal?password=private-secret", Err: &net.OpError{Op: "read", Net: "tcp", Err: io.ErrUnexpectedEOF}}
			msg := portalErrorMessage(action, err, "private-secret")
			if !strings.Contains(msg, takeoverText) || !strings.HasPrefix(msg, action+"失败：") {
				t.Fatalf("校园网入口没有给出代理建议：%s", msg)
			}
			if len(*asked) != 1 || (*asked)[0] != "net.szu.edu.cn" || strings.Contains(msg, "private-secret") || strings.Contains(msg, "://") {
				t.Fatalf("未检查实际失败主机或泄露请求：%s（查了 %v）", msg, *asked)
			}
		})
	}
}

func TestCampusPortalBusinessErrorsDoNotCheckDNS(t *testing.T) {
	asked := withSchoolFakeIP(t, true)
	msg := portalErrorMessage("认证", errors.New("服务端没有返回 challenge（error=auth_info_error）"), "not-real")
	if strings.Contains(msg, "代理软件接管") || !strings.Contains(msg, "auth_info_error") || len(*asked) != 0 {
		t.Fatalf("业务拒绝不能归因代理：%s（查了 %v）", msg, *asked)
	}
}

func TestCampusPortalBodyErrorsUseConfiguredHost(t *testing.T) {
	for _, tc := range []struct {
		host string
		fake bool
	}{
		{"https://net.szu.edu.cn", true},
		{"https://custom.szu.edu.cn:443", true},
		{"http://172.30.255.42", false},
		{"https://outside.example", false},
	} {
		t.Run(tc.host, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			err := &net.OpError{Op: "read", Net: "tcp", Err: errors.New("connection reset by peer: private-network-detail")}
			msg := portalErrorMessageContext(context.Background(), "认证", err, "not-real", tc.host)
			if strings.Contains(msg, takeoverText) != tc.fake || strings.Contains(msg, "private-") || strings.Contains(msg, "://") {
				t.Fatalf("应按配置主机决定代理提示且不回显错误详情：%s（查了 %v）", msg, *asked)
			}
			u, _ := url.Parse(tc.host)
			if len(*asked) != 1 || (*asked)[0] != u.Hostname() {
				t.Fatalf("应该检查配置的 %s，实际查了 %v", u.Hostname(), *asked)
			}
		})
	}
}

func TestCampusPortalDeadlineDoesNotClaimConfirmedOutcome(t *testing.T) {
	asked := withSchoolFakeIP(t, true)
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	err := &url.Error{Op: "Get", URL: "https://net.szu.edu.cn/cgi-bin/srun_portal?password=private-secret", Err: context.DeadlineExceeded}
	msg := portalErrorMessageContext(ctx, "认证", err, "private-secret", "https://net.szu.edu.cn")
	if !strings.Contains(msg, "超时") || !strings.Contains(msg, "暂不能确认结果") || strings.Contains(msg, "private-secret") || strings.Contains(msg, "://") || len(*asked) != 0 {
		t.Fatalf("截止后应说明结果未确认，不查 DNS 或泄露请求：%s（查了 %v）", msg, *asked)
	}
}

func TestCampusPortalDiagnosticDNSFollowsOperationDeadline(t *testing.T) {
	old := schoolFakeIP
	schoolFakeIP = func(ctx context.Context, _ string) bool {
		<-ctx.Done()
		return false
	}
	t.Cleanup(func() { schoolFakeIP = old })
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	done := make(chan string, 1)
	go func() {
		err := &net.OpError{Op: "read", Net: "tcp", Err: io.ErrUnexpectedEOF}
		done <- portalErrorMessageContext(ctx, "认证", err, "not-real", "https://net.szu.edu.cn")
	}()
	select {
	case msg := <-done:
		if !strings.Contains(msg, "超时") || !strings.Contains(msg, "暂不能确认结果") || strings.Contains(msg, "代理软件接管") {
			t.Fatalf("DNS 检查期间截止也不能确认认证结果或归因于代理：%s", msg)
		}
	case <-time.After(time.Second):
		t.Fatal("附带的 DNS 检查忽略了整次操作的截止时间")
	}
}

func TestCanceledCampusLoginDoesNotSendCredentials(t *testing.T) {
	for _, zone := range []string{"teaching", "dorm"} {
		t.Run(zone, func(t *testing.T) {
			t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
			var requests atomic.Int32
			fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				if r.URL.Path == "/cgi-bin/get_challenge" {
					_, _ = io.WriteString(w, `_({"challenge":"0123456789abcdef","client_ip":"10.0.0.8","error":"ok"})`)
					return
				}
				if zone == "dorm" {
					_, _ = io.WriteString(w, `dr1003({"result":1})`)
				} else {
					_, _ = io.WriteString(w, `_({"error":"ok","suc_msg":"login_ok"})`)
				}
			}))
			defer fake.Close()
			s := New(Options{SrunHost: fake.URL, DrcomHost: fake.URL, AcID: "12"})
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			body := `{"username":"123456","password":"not-real","zone":"` + zone + `"}`
			req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body)).WithContext(ctx)
			w := httptest.NewRecorder()
			s.handleLogin(w, req)
			var got loginResp
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.OK || requests.Load() != 0 {
				t.Fatalf("取消后仍发送了认证请求：requests=%d response=%s", requests.Load(), w.Body.String())
			}
		})
	}
}

func TestCancelDuringCampusChallengeStopsLaterLogin(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	started, interrupted := make(chan struct{}), make(chan struct{})
	var logins atomic.Int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cgi-bin/get_challenge" {
			close(started)
			select {
			case <-r.Context().Done():
				close(interrupted)
				return
			case <-time.After(250 * time.Millisecond):
				_, _ = io.WriteString(w, `_({"challenge":"0123456789abcdef","client_ip":"10.0.0.8","error":"ok"})`)
				return
			}
		}
		logins.Add(1)
		_, _ = io.WriteString(w, `_({"error":"ok","suc_msg":"login_ok"})`)
	}))
	defer fake.Close()
	s := New(Options{SrunHost: fake.URL, AcID: "12"})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"username":"123456","password":"not-real","zone":"teaching"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { s.handleLogin(w, req); close(done) }()
	<-started
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("取消后校园网登录没有及时结束")
	}
	var got loginResp
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.OK || logins.Load() != 0 {
		t.Fatalf("取消 challenge 后仍继续登录：logins=%d response=%s", logins.Load(), w.Body.String())
	}
	select {
	case <-interrupted:
	case <-time.After(time.Second):
		t.Fatal("学校请求没有收到本地请求的取消信号")
	}
}
