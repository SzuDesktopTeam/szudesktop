package portal

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// 这组用例守住一件事：门户请求出错时，错误文本里绝不能带出密码。
//
// 背景：*url.Error 的 Error() 会原样带上完整请求地址。Dr.COM 登录把明文密码
// 放在查询串里（user_password=...），深澜登录放的是学号、{MD5} 摘要和加密后的
// 用户信息。宿舍门户超时、连接被拒在高峰期很常见，这段文字会显示在界面上、
// 被 /api/status 的 last_error 缓存、被用户截图发群求助。

const leakTestPassword = "S3cr3t-Pass&中文"

// hangUp 让服务端在读到请求后直接断开连接，模拟门户掉线 / 被代理掐断。
func hangUp(t *testing.T, w http.ResponseWriter) {
	t.Helper()
	hj, ok := w.(http.Hijacker)
	if !ok {
		t.Fatal("测试服务器不支持 Hijack")
	}
	conn, _, err := hj.Hijack()
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()
}

// assertNoSecret 断言错误文本里既没有密码原文，也没有它按查询串编码后的样子。
func assertNoSecret(t *testing.T, text string, secrets ...string) {
	t.Helper()
	for _, s := range secrets {
		for _, form := range []string{s, url.QueryEscape(s)} {
			if form != "" && strings.Contains(text, form) {
				t.Fatalf("错误文本泄露了机密 %q：%s", form, text)
			}
		}
	}
	if strings.Contains(text, "?") {
		t.Fatalf("错误文本里不该再有查询串：%s", text)
	}
}

func TestDrcomLoginNetworkErrorDoesNotLeakPassword(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hangUp(t, w)
	}))
	defer srv.Close()

	_, err := NewDrcomClient(srv.URL, "123456", leakTestPassword).Login()
	if err == nil {
		t.Fatal("连接被掐断时应该报错")
	}
	assertNoSecret(t, err.Error(), leakTestPassword, "user_password")
	if !strings.Contains(err.Error(), "/eportal/portal/login") {
		t.Fatalf("错误里应该保留请求路径方便排查，实际 %s", err)
	}
	// 去掉查询串不能把错误链也弄断：调用方要靠它分辨超时、拒绝连接等类别。
	var ue *url.Error
	if !errors.As(err, &ue) {
		t.Fatalf("错误链里应该还能取到 *url.Error，实际 %T", err)
	}
}

func TestDrcomLoginRefusedConnectionKeepsNetError(t *testing.T) {
	// 起一个服务再关掉，拿到一个肯定没人监听的端口。
	srv := httptest.NewServer(http.NotFoundHandler())
	addr := srv.URL
	srv.Close()

	_, err := NewDrcomClient(addr, "123456", leakTestPassword).Login()
	if err == nil {
		t.Fatal("连不上时应该报错")
	}
	assertNoSecret(t, err.Error(), leakTestPassword, "user_password")
	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		t.Fatalf("错误链里应该还能取到 *net.OpError，实际 %v", err)
	}
}

// assertNoSecretPrefix 断言文本里连机密的前 n 个字节都没有。
//
// 只查整串不够：正文先被截断、再按整串查，截断线落在密码中间时，
// 前半截照样会漏出去，而整串匹配认不出来。
func assertNoSecretPrefix(t *testing.T, text string, n int, secrets ...string) {
	t.Helper()
	for _, s := range secrets {
		for _, form := range []string{s, url.QueryEscape(s)} {
			if len(form) >= n && strings.Contains(text, form[:n]) {
				t.Fatalf("文本里漏出了机密的前 %d 个字节 %q：%s", n, form[:n], text)
			}
		}
	}
}

// 透明代理、运营商劫持页常把完整请求地址写进错误页，parseJSONP 又会带上一截正文
// （截到 160 字节）。密码放在截断线以内、跨过截断线、编码后跨过截断线三种位置，
// 都不能漏出哪怕前几个字节。
func TestDrcomLoginEchoedPasswordIsWithheld(t *testing.T) {
	cases := []struct {
		name    string
		offset  int
		escaped bool
	}{
		{"整段在截断线以内", 20, false},
		{"跨过截断线", 150, false},
		{"编码后跨过截断线", 150, true},
		{"编码后在截断线以内", 20, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				secret := r.URL.Query().Get("user_password")
				if c.escaped {
					secret = url.QueryEscape(secret)
				}
				w.WriteHeader(http.StatusBadGateway)
				_, _ = io.WriteString(w, strings.Repeat("x", c.offset)+secret+" proxy error")
			}))
			defer srv.Close()

			_, err := NewDrcomClient(srv.URL, "123456", leakTestPassword).Login()
			if err == nil {
				t.Fatal("响应不是 JSONP 时应该报错")
			}
			if !strings.Contains(err.Error(), "JSONP") {
				t.Fatalf("错误要说明响应格式不对，实际 %s", err)
			}
			assertNoSecretPrefix(t, err.Error(), 4, leakTestPassword)
		})
	}
}

// 没有机密的正文照常带出来，排查时要看。
func TestDrcomLoginKeepsHarmlessBodyExcerpt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, "<html>502 Bad Gateway</html>")
	}))
	defer srv.Close()

	_, err := NewDrcomClient(srv.URL, "123456", leakTestPassword).Login()
	if err == nil || !strings.Contains(err.Error(), "502 Bad Gateway") {
		t.Fatalf("不含机密的正文应该原样带出，实际 %v", err)
	}
}

// Result.Raw（--verbose 会打印）和界面上显示的 Message 也一样：先查密码再截断。
func TestDrcomLoginRawAndMessageWithholdPassword(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secret := r.URL.Query().Get("user_password")
		// JSON 部分开头 {"result":0,"msg":" 是 19 字节，密码落在第 390 字节，跨过 Raw 的 400 字节截断线。
		fmt.Fprintf(w, `dr1003({"result":0,"msg":"%s%s"})`, strings.Repeat("x", 371), secret)
	}))
	defer srv.Close()

	res, err := NewDrcomClient(srv.URL, "123456", leakTestPassword).Login()
	if err != nil {
		t.Fatal(err)
	}
	assertNoSecretPrefix(t, res.Raw, 4, leakTestPassword)
	assertNoSecretPrefix(t, res.Message, 4, leakTestPassword)
}

func TestSrunLoginEchoedURLIsWithheld(t *testing.T) {
	var sent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`))
		case "/cgi-bin/srun_portal":
			// 把 password 参数（{MD5} 摘要）放在跨过 160 字节截断线的位置。
			sent = r.URL.Query().Get("password")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, strings.Repeat("x", 150)+sent+"&"+r.URL.RawQuery)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := NewSrunClient(srv.URL, "123456", leakTestPassword)
	c.AcID = "12"
	_, err := c.Login()
	if err == nil {
		t.Fatal("响应不是 JSONP 时应该报错")
	}
	if sent == "" {
		t.Fatal("假门户没收到登录请求")
	}
	// sent 形如 {MD5}xxxx，摘要本身也不能露头。
	assertNoSecretPrefix(t, err.Error(), 4, leakTestPassword, sent, strings.TrimPrefix(sent, "{MD5}"))
}

// TestShortPasswordIsNotUsedAsAnOracle 密码很短时不能在错误文本里做替换：
// 以前密码 "127" 撞上连接被拒的地址，得到 "dial tcp ***.0.0.1"，等于把密码
// 告诉了看截图的人。错误链也要完整，调用方靠它分辨拒绝连接、超时等。
func TestShortPasswordIsNotUsedAsAnOracle(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	addr := srv.URL
	srv.Close()

	_, err := NewDrcomClient(addr, "123456", "127").Login()
	if err == nil {
		t.Fatal("连不上时应该报错")
	}
	if strings.Contains(err.Error(), "***") {
		t.Fatalf("短密码不该在错误文本里被替换：%s", err)
	}
	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		t.Fatalf("错误链里应该还能取到 *net.OpError，实际 %v", err)
	}
}

// TestScrubSecretsKeepsErrorChain 兜底替换命中时，错误链不能断。
func TestScrubSecretsKeepsErrorChain(t *testing.T) {
	const secret = "hunter2hunter2"
	base := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("echo " + secret)}
	err := scrubSecrets(fmt.Errorf("发送登录请求失败: %w", base), secret)
	if strings.Contains(err.Error(), secret) {
		t.Fatalf("机密没有抹掉：%s", err)
	}
	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		t.Fatalf("抹掉机密后错误链断了：%T", err)
	}
	if got := scrubSecrets(base, "abc"); got != error(base) {
		t.Fatal("短机密不替换，错误应该原样返回")
	}
}

func TestWithholdSecrets(t *testing.T) {
	cases := []struct {
		text, secret string
		withheld     bool
	}{
		{"user_password=abc&x=1", "abc", true},       // 短机密照样整段不给
		{"user_password=a%26b", "a&b", true},         // 查询串编码
		{"<p>a&amp;b</p>", "a&b", true},              // HTML 转义
		{"502 Bad Gateway", leakTestPassword, false}, // 没出现就原样
		{"anything", "", false},                      // 空机密不算
	}
	for _, c := range cases {
		got := withholdSecrets(c.text, c.secret)
		if (got == withheldBody) != c.withheld {
			t.Errorf("withholdSecrets(%q, %q) = %q", c.text, c.secret, got)
		}
		if !c.withheld && got != c.text {
			t.Errorf("没有机密时应原样返回，实际 %q", got)
		}
	}
}

func TestSrunLoginNetworkErrorDoesNotLeakSecrets(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cgi-bin/get_challenge":
			_, _ = w.Write([]byte(`_({"challenge":"0123456789abcdef","client_ip":"10.20.30.40","error":"ok"})`))
		case "/cgi-bin/srun_portal":
			hangUp(t, w)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := NewSrunClient(srv.URL, "123456", leakTestPassword)
	c.AcID = "12"
	_, err := c.Login()
	if err == nil {
		t.Fatal("连接被掐断时应该报错")
	}
	assertNoSecret(t, err.Error(), leakTestPassword, "{MD5}", "chksum", "{SRBX1}")
	if !strings.Contains(err.Error(), "/cgi-bin/srun_portal") {
		t.Fatalf("错误里应该保留请求路径方便排查，实际 %s", err)
	}
}

func TestRedactURL(t *testing.T) {
	cases := map[string]string{
		"http://172.30.255.42/eportal/portal/login?user_password=x":  "http://172.30.255.42/eportal/portal/login",
		"https://u:p@net.szu.edu.cn/cgi-bin/srun_portal?info=x#frag": "https://net.szu.edu.cn/cgi-bin/srun_portal",
		"http://h/path":             "http://h/path",
		"%%bad url?user_password=x": "%%bad url",
	}
	for in, want := range cases {
		if got := redactURL(in); got != want {
			t.Errorf("redactURL(%q) = %q，期望 %q", in, got, want)
		}
	}
}
