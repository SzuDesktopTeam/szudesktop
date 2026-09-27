package portal

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// srunPortalByAcID 起一个按 ac_id 决定登录结果的假门户：只认 goodAcID，
// 其余编号按深澜「ac_id 用错」的真实形态回 error=ok + error_msg。
func srunPortalByAcID(t *testing.T, goodAcID string, logins *[]string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`))
		case "/srun_portal_pc":
			_, _ = w.Write([]byte(`CONFIG = { acid: "` + r.URL.Query().Get("ac_id") + `" };`))
		case "/cgi-bin/srun_portal":
			id := r.URL.Query().Get("ac_id")
			*logins = append(*logins, id)
			if id == goodAcID {
				_, _ = w.Write([]byte(`_({"error":"ok","res":"ok","suc_msg":"login_ok"})`))
				return
			}
			_, _ = w.Write([]byte(`_({"error":"ok","error_msg":"Unknow ac-type: ` + id + `","res":"ok"})`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// gatewayRedirect 起一个假网关：任何请求都 302 到带 ac_id 的认证页。
func gatewayRedirect(t *testing.T, acID string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://net.szu.edu.cn/srun_portal_pc?ac_id="+acID, http.StatusFound)
	}))
	t.Cleanup(srv.Close)
	return srv.URL + "/generate_204"
}

// TestSrunErrorOkWithAcTypeIsNotSuccess 守住「error=ok 不等于成功」。
//
// 深澜在 ac_id 用错时也回 error=ok，结论只在 error_msg 里。以前这被判成
// 「认证成功」：CLI 退出码 0、桌面端清掉错误提示，用户却上不了网；
// 错的编号还会通过 OnAcIDResolved 写进缓存固化下来。
func TestSrunErrorOkWithAcTypeIsNotSuccess(t *testing.T) {
	var logins []string
	srv := srunPortalByAcID(t, "12", &logins)

	var cached []string
	c := NewSrunClient(srv.URL, "123456", "pw")
	c.AcID = "99"
	c.OnAcIDResolved = func(id string) { cached = append(cached, id) }

	res, err := c.Login()
	if err != nil {
		t.Fatal(err)
	}
	if res.OK {
		t.Fatalf("error_msg 说 ac-type 不对，不能报成功：%+v", res)
	}
	if !strings.Contains(res.Message, "ac_id") {
		t.Fatalf("提示里应该点明是 ac_id 的问题，实际 %q", res.Message)
	}
	if len(cached) != 0 {
		t.Fatalf("被拒的编号不该写进缓存，实际 %v", cached)
	}
	if len(logins) != 1 {
		t.Fatalf("手填的编号用户说了算，被拒也不该自动换一个重试，实际请求了 %v", logins)
	}
	if res.AcID != "99" || res.AcIDSource != string(AcIDSourceManual) {
		t.Fatalf("失败结果也要带上这次用的编号，方便排查：%+v", res)
	}
}

// TestSrunRealSuccessStillSucceeds 对照组：真实的成功响应不能被误判成失败。
func TestSrunRealSuccessStillSucceeds(t *testing.T) {
	for _, body := range []string{
		`_({"error":"ok","error_msg":"","res":"ok","suc_msg":"login_ok","ploy_msg":"E0000: Login is successful."})`,
		`_({"error":"ok","suc_msg":"already_online"})`,
	} {
		srv := fakeSrunPortal(t, body, `_({"error":"ok"})`)
		c := NewSrunClient(srv.URL, "123456", "pw")
		c.AcID = "12"
		res, err := c.Login()
		if err != nil {
			t.Fatal(err)
		}
		if !res.OK {
			t.Fatalf("%s 是成功响应，却判成了失败：%+v", body, res)
		}
	}
}

// TestCachedAcIDRejectedIsDroppedAndRediscovered 守住「缓存用错后能自己好」。
//
// 同一个网关后面换了墙口或 AP、ac_id 变了，或者不同网络撞上了同一个缓存键
// （家用路由器都是 192.168.x.1），缓存值会被服务端拒掉。以前缓存优先级排在
// 网关跳转之前、又从不失效，于是每次登录都拿着错值去撞 Unknow ac-type。
func TestCachedAcIDRejectedIsDroppedAndRediscovered(t *testing.T) {
	var logins []string
	srv := srunPortalByAcID(t, "12", &logins)

	var rejected, cached []string
	c := NewSrunClient(srv.URL, "123456", "pw")
	c.SetLastAcID("5")
	c.redirectProbes = []string{gatewayRedirect(t, "12")}
	c.OnAcIDRejected = func(id string) { rejected = append(rejected, id) }
	c.OnAcIDResolved = func(id string) { cached = append(cached, id) }

	res, err := c.Login()
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK || res.AcID != "12" || res.AcIDSource != string(AcIDSourceRedirect) {
		t.Fatalf("缓存被拒后应该重新发现并用 12 登录成功，实际 %+v（请求过 %v）", res, logins)
	}
	if strings.Join(logins, ",") != "5,12" {
		t.Fatalf("应该先试缓存的 5、被拒后重试一次 12，实际 %v", logins)
	}
	if len(rejected) != 1 || rejected[0] != "5" {
		t.Fatalf("被拒的缓存值要通知调用方删掉，实际 %v", rejected)
	}
	if len(cached) != 1 || cached[0] != "12" {
		t.Fatalf("重新发现的可信值要写回缓存，实际 %v", cached)
	}
}

// TestRedirectAcIDRejectedIsNotRetried 网关跳转来的值是权威，被拒就如实报错，不瞎换。
func TestRedirectAcIDRejectedIsNotRetried(t *testing.T) {
	var logins []string
	srv := srunPortalByAcID(t, "12", &logins)

	c := NewSrunClient(srv.URL, "123456", "pw")
	c.redirectProbes = []string{gatewayRedirect(t, "7")}
	res, err := c.Login()
	if err != nil {
		t.Fatal(err)
	}
	if res.OK || len(logins) != 1 {
		t.Fatalf("网关给的编号被拒时应该直接报错，实际 %+v（请求过 %v）", res, logins)
	}
}

// TestPortalGuessGivesUpWhenPortalUnreachable 门户连不上时兜底猜测不该挨个干等。
//
// 以前 7 个候选编号逐个请求、每个 10 秒超时：校外或代理抢走域名解析时，
// `szunet detect` 实测要一分半才出结果，看起来像卡死。
func TestPortalGuessGivesUpWhenPortalUnreachable(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		hangUp(t, w)
	}))
	defer srv.Close()

	c := NewSrunClient(srv.URL, "123456", "pw")
	start := time.Now()
	if got := c.discoverAcIDFromPortal(); got != "" {
		t.Fatalf("门户不通时不该猜出编号，实际 %q", got)
	}
	// 连接被掐断时 net/http 会对幂等请求自动重试一次，所以按「一个候选」算，不按请求数算。
	if n := hits.Load(); n > 2 {
		t.Fatalf("第一个候选就失败时应该直接放弃，实际请求了 %d 次", n)
	}
	if d := time.Since(start); d > 5*time.Second {
		t.Fatalf("放弃得太慢：%v", d)
	}
}
