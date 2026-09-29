package ui

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// 本包的测试不做真实 DNS：维护机自己就开着 Fake-IP 代理（学校域名解析成 198.18.x.x），
// 学校业务报错的文案会跟着机器变。要测 Fake-IP 的用例用 withSchoolFakeIP 换成固定结果。
func init() { schoolFakeIP = func(string) bool { return false } }

// withSchoolFakeIP 让学校域名一律「被接管」（fake=true）或一律正常，返回被查过的主机名。
func withSchoolFakeIP(t *testing.T, fake bool) *[]string {
	t.Helper()
	var mu sync.Mutex
	asked := &[]string{}
	old := schoolFakeIP
	schoolFakeIP = func(host string) bool {
		mu.Lock()
		*asked = append(*asked, host)
		mu.Unlock()
		return fake && portal.IsSchoolHost(host)
	}
	t.Cleanup(func() { schoolFakeIP = old })
	return asked
}

const takeoverText = "代理软件接管了学校域名，请把 szu.edu.cn 设为直连"

// 学校域名被代理的 Fake-IP 接管时，学校业务连不上要直接说原因和做法（O7）；
// 没被接管时保持原来的提示，别让在校内正常的同学去改代理。
func TestSchoolConnectionErrorsExplainFakeIPTakeover(t *testing.T) {
	reset := calendarTransport(func(r *http.Request) (*http.Response, error) {
		return nil, &net.OpError{Op: "read", Net: "tcp", Err: errors.New("connection reset by peer")}
	})
	for _, tc := range []struct {
		name, plain string // plain 是没被接管时的原文，一个字都不该变
		call        func() error
	}{
		{"ehall", "连不上学校系统，请检查网络后重试", func() error {
			c := newEhallClient("test-only", 0)
			c.http.Transport = reset
			_, err := c.postFormContext(context.Background(), undergradScorePath, allRowsForm(1))
			return err
		}},
		{"研究生教务", "学校系统暂时无法连接，请检查校园网后重试", func() error {
			client := newAcademicClient()
			client.Transport = reset
			_, err := academicRequest(context.Background(), client, graduateProfilePath, nil)
			return err
		}},
		{"统一身份认证", "学校系统暂时无法连接，请检查校园网后重试", func() error {
			client := newCasClient()
			client.Transport = reset
			_, _, _, err := casDo(context.Background(), client, "https://"+casHost+"/authserver/login", nil, "")
			return err
		}},
		{"空间预约", "", func() error {
			b := newBookingService()
			b.client.Transport = reset
			return b.request(context.Background(), "/booth/list", nil, nil)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asked := withSchoolFakeIP(t, true)
			err := tc.call()
			if err == nil || !strings.Contains(err.Error(), takeoverText) {
				t.Fatalf("学校域名被接管时没有给出代理提示：%v", err)
			}
			if len(*asked) == 0 || !portal.IsSchoolHost((*asked)[0]) {
				t.Fatalf("应该拿学校域名去查，实际查了 %v", *asked)
			}
			if strings.Contains(err.Error(), "://") || strings.Contains(err.Error(), "szu.edu.cn/") {
				t.Fatalf("报错里不能带请求地址：%v", err)
			}

			withSchoolFakeIP(t, false)
			err = tc.call()
			if err == nil || strings.Contains(err.Error(), "代理软件接管") {
				t.Fatalf("没被接管时不该提示代理：%v", err)
			}
			if tc.plain != "" && err.Error() != tc.plain {
				t.Fatalf("没被接管时应保持原来的提示 %q，实际 %q", tc.plain, err.Error())
			}
		})
	}
}

// 跳转后才连不上时，真正连不上的是跳转去的那个站点，要拿它的主机名去查；
// 地址里的票据、查询串一个字都不能进报错。
func TestSchoolConnectionErrorChecksFailingHop(t *testing.T) {
	asked := withSchoolFakeIP(t, true)
	start, _ := url.Parse("https://ehall.szu.edu.cn/jwapp/sys/wdkb/*default/index.do")
	hop := &url.Error{Op: "Get", URL: "https://authserver.szu.edu.cn/authserver/login?service=private-ticket", Err: io.ErrUnexpectedEOF}
	err := schoolConnectionError("连不上学校系统", "连不上学校系统，请检查网络后重试", start, hop)
	if len(*asked) != 1 || (*asked)[0] != "authserver.szu.edu.cn" {
		t.Fatalf("应该查跳转去的 authserver，实际查了 %v", *asked)
	}
	if !strings.Contains(err.Error(), takeoverText) || strings.Contains(err.Error(), "private-ticket") {
		t.Fatalf("提示不对或带出了地址：%v", err)
	}

	// 琴房这类直接用内网 IP 的服务不归这条管：IP 字面量不是学校域名。
	asked = withSchoolFakeIP(t, true)
	ip, _ := url.Parse("http://192.168.197.131:60837/api/web/")
	if err := schoolConnectionError("连不上", "原文", ip, errors.New("dial tcp: refused")); err.Error() != "原文" {
		t.Fatalf("IP 地址不该提示学校域名被接管：%v（查了 %v）", err, *asked)
	}

	// 页面自己取消的请求不是连不上，不查 DNS，也不提示代理。
	asked = withSchoolFakeIP(t, true)
	canceled := &url.Error{Op: "Get", URL: start.String(), Err: context.Canceled}
	if err := schoolConnectionError("连不上", "原文", start, canceled); err.Error() != "原文" || len(*asked) != 0 {
		t.Fatalf("取消的请求不该查 DNS：%v（查了 %v）", err, *asked)
	}
}
