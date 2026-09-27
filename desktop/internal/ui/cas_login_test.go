package ui

import (
	"encoding/base64"

	"encoding/json"
	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// casLoginForm 的字段名与取值直接决定学校收不收，所以逐项钉死。
func TestCasLoginFormShape(t *testing.T) {
	form := casLoginForm("  2099000001  ", "ENCRYPTED", "LT-1", "e1s1", "")
	if form.Get("username") != "2099000001" {
		t.Fatalf("username 未去空白: %q", form.Get("username"))
	}
	if form.Get("password") != "ENCRYPTED" {
		t.Fatal("password 必须是加密后的值，不能是明文")
	}
	if form.Get("lt") != "LT-1" || form.Get("execution") != "e1s1" {
		t.Fatal("lt / execution 必须原样回传")
	}
	if form.Get("_eventId") != "submit" || form.Get("cllt") != "userNameLogin" || form.Get("dllt") != "generalLogin" {
		t.Fatal("CAS 固定字段不对")
	}
	if form.Get("rememberMe") != "false" {
		t.Fatal("rememberMe 应为 false")
	}
	// 没要验证码时绝不多带这个字段。
	if form.Has("captcha") {
		t.Fatal("本次登录未要求验证码，却带了 captcha 字段")
	}
	// 要了验证码才带上。
	withCaptcha := casLoginForm("u", "e", "lt", "e1s1", "  AbC123  ")
	if withCaptcha.Get("captcha") != "AbC123" {
		t.Fatalf("captcha 未去空白: %q", withCaptcha.Get("captcha"))
	}
	// 绝不明文回传密码：表单里除了 password 不该再有别的密码字段。
	for k := range withCaptcha {
		if strings.Contains(strings.ToLower(k), "pwd") || strings.Contains(strings.ToLower(k), "plain") {
			t.Fatalf("出现了不该有的明文字段 %q", k)
		}
	}
}

// casURLAllowed 的测试模式放行注入的假源，生产模式必须仍然只认学校域名。
func TestCasURLAllowed(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()

	casTestBase, casTestEhall = "http://127.0.0.1:1", "http://127.0.0.1:2"
	for _, ok := range []string{"http://127.0.0.1:1/authserver/login", "http://127.0.0.1:2/jwapp/x"} {
		u, _ := url.Parse(ok)
		if !casURLAllowed(u) {
			t.Fatalf("测试模式应放行 %s", ok)
		}
	}
	if u, _ := url.Parse("http://evil.test/x"); casURLAllowed(u) {
		t.Fatal("测试模式也不该放行陌生源")
	}

	casTestBase, casTestEhall = "", ""
	for _, bad := range []string{"http://authserver.szu.edu.cn/authserver/login", "https://authserver.szu.edu.cn:8443/x", "https://evil.test/x"} {
		u, _ := url.Parse(bad)
		if casURLAllowed(u) {
			t.Fatalf("生产模式应拒绝 %s", bad)
		}
	}
	if u, _ := url.Parse("https://authserver.szu.edu.cn/authserver/login"); !casURLAllowed(u) {
		t.Fatal("生产模式应放行 authserver 登录页")
	}
}

// parseCasLoginPage 的行为契约。
// 其中「needCaptcha 为空就不该要验证码」是用学校真实登录页实测出来的——
// captchaDiv 容器在 HTML 里恒存在（还有一个带 hide class），拿它判断会永远多要一个框。
func TestParseCasLoginPage(t *testing.T) {
	real := `<html><body><form><input type="hidden" name="lt" id="lt" value="" /><input type="hidden" id="pwdEncryptSalt" value="1RKM2IpP3pRszFGS" /><input type="hidden" id="execution" name="execution" value="e1s1" /></form>
<script>var captchaSwitch = "2"
var needCaptcha = ""</script>
<div class="captcha item hide" id="captchaDiv"></div></body></html>`
	p := parseCasLoginPage(real)
	if p.Salt != "1RKM2IpP3pRszFGS" || p.Execution != "e1s1" || p.Lt != "" {
		t.Fatalf("解析结果不对: %+v", p)
	}
	if p.NeedCaptcha {
		t.Fatal("needCaptcha 为空字符串，不该要求验证码")
	}

	// needCaptcha 非空 → 要验证码。
	withCaptcha := strings.Replace(real, `var needCaptcha = ""`, `var needCaptcha = "1"`, 1)
	if !parseCasLoginPage(withCaptcha).NeedCaptcha {
		t.Fatal("needCaptcha 非空时应该要求验证码")
	}

	// lt 有值时原样带回。
	withLt := strings.Replace(real, `id="lt" value=""`, `id="lt" value="LT-real-123"`, 1)
	if got := parseCasLoginPage(withLt).Lt; got != "LT-real-123" {
		t.Fatalf("lt = %q", got)
	}

	// needCaptcha 变量整个缺席 → 退回结构判断：账号密码表单里有 captcha 输入框才要。
	noVar := `<input type="text" id="captcha" name="captcha"><input id="pwdEncryptSalt" value="1RKM2IpP3pRszFGS">`
	if !parseCasLoginPage(noVar).NeedCaptcha {
		t.Fatal("缺少 needCaptcha 变量但表单有验证码输入框时应要求验证码")
	}
	noVarNoInput := `<input id="pwdEncryptSalt" value="1RKM2IpP3pRszFGS"><input name="execution" value="e1s1">`
	if parseCasLoginPage(noVarNoInput).NeedCaptcha {
		t.Fatal("既没有 needCaptcha 变量也没有验证码输入框，不该要求验证码")
	}

	// 没有盐必须能被上层发现（返回空串，由调用方报错），不能panic。
	if parseCasLoginPage("<html>nothing</html>").Salt != "" {
		t.Fatal("缺少盐时应返回空串")
	}
}

// casFixture 起一个假 CAS + 假 ehall，把整个登录流程跑通。
type casFixture struct {
	srv       *httptest.Server
	ehall     *httptest.Server
	loginForm url.Values // 捕获到的登录表单
	pageHits  int
	probeHits int
}

func newCasFixture(t *testing.T, withCaptcha bool) *casFixture {
	t.Helper()
	f := &casFixture{}
	f.ehall = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "xskcb.do") {
			w.Write([]byte(`{"code":"0","datas":{"xskcb":{"rows":[],"totalSize":0}}}`))
			return
		}
		if strings.Contains(r.URL.Path, "dqxnxq.do") {
			f.probeHits++
			w.Write([]byte(`{"code":"0","datas":{"dqxnxq":{"rows":[{"DM":"2026-2027-1"}]}}}`))
			return
		}
		w.Write([]byte("<html>ehall</html>"))
	}))
	t.Cleanup(f.ehall.Close)

	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/authserver/login" && r.Method == http.MethodGet:
			f.pageHits++
			captchaDiv := ""
			if withCaptcha {
				captchaDiv = `<div class="captcha item hide" id="captchaDiv"></div>`
			}
			needCaptcha := `var needCaptcha = ""`
			if withCaptcha {
				needCaptcha = `var needCaptcha = "1"`
			}
			w.Write([]byte(`<html><body><form><input type="hidden" name="lt" id="lt" value="LT-abc" /><input type="hidden" id="pwdEncryptSalt" value="1RKM2IpP3pRszFGS" /><input type="hidden" id="execution" name="execution" value="e1s1" />` + captchaDiv + `</form><script>` + needCaptcha + `</script></body></html>`))
		case r.URL.Path == "/authserver/getCaptcha.htl":
			w.Header().Set("Content-Type", "image/gif")
			w.Write([]byte("GIF89a-fake-captcha"))
		case r.URL.Path == "/authserver/login" && r.Method == http.MethodPost:
			if err := r.ParseForm(); err != nil {
				w.WriteHeader(400)
				return
			}
			f.loginForm = r.PostForm
			// CAS 成功：302 回 service，带上 ticket。
			http.Redirect(w, r, f.ehall.URL+"/jwapp/sys/wdkb/*default/index.do?ticket=ST-123", http.StatusFound)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *casFixture) enable() {
	casTestBase, casTestEhall = f.srv.URL, f.ehall.URL
}

func TestCasLoginEndToEnd(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()

	for _, withCaptcha := range []bool{false, true} {
		t.Run(map[bool]string{false: "no captcha", true: "with captcha"}[withCaptcha], func(t *testing.T) {
			f := newCasFixture(t, withCaptcha)
			f.enable()
			s := &Server{cas: newCasService()}

			// 取登录页。
			rec := httptest.NewRecorder()
			s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
			if rec.Code != 200 {
				t.Fatalf("challenge: %d %s", rec.Code, rec.Body.String())
			}
			var ch map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &ch); err != nil {
				t.Fatal(err)
			}
			challenge, _ := ch["challenge"].(string)
			if challenge == "" {
				t.Fatal("没有拿到 challenge")
			}
			image, _ := ch["image"].(string)
			if withCaptcha && image == "" {
				t.Fatal("页面要求验证码，却没有返回图片地址")
			}
			if !withCaptcha && image != "" {
				t.Fatal("页面没要求验证码，却返回了图片地址")
			}
			if f.pageHits != 1 {
				t.Fatalf("登录页请求了 %d 次，应为 1", f.pageHits)
			}

			// 提交登录。
			body := map[string]any{"challenge": challenge, "username": "2099000001", "password": "s3cret"}
			if withCaptcha {
				body["captcha"] = "AbC123"
			}
			raw, _ := json.Marshal(body)
			rec = httptest.NewRecorder()
			s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
			if rec.Code != 200 {
				t.Fatalf("login: %d %s", rec.Code, rec.Body.String())
			}
			if !s.cas.authenticated {
				t.Fatal("登录响应 200 但服务端未标记为已登录")
			}
			// 协议形状：字段与取值都对。
			if got := f.loginForm.Get("username"); got != "2099000001" {
				t.Fatalf("username = %q", got)
			}
			if got := f.loginForm.Get("lt"); got != "LT-abc" {
				t.Fatalf("lt 未从登录页解析出来: %q", got)
			}
			if got := f.loginForm.Get("execution"); got != "e1s1" {
				t.Fatalf("execution = %q", got)
			}
			if got := f.loginForm.Get("cllt"); got != "userNameLogin" {
				t.Fatalf("cllt = %q", got)
			}
			// 口令必须已加密：不是明文，且是合法 Base64。
			pw := f.loginForm.Get("password")
			if pw == "s3cret" {
				t.Fatal("密码以明文上网了")
			}
			if _, err := base64.StdEncoding.DecodeString(pw); err != nil {
				t.Fatalf("密码不是合法 Base64: %v", err)
			}
			if f.probeHits != 1 {
				t.Fatalf("业务探针请求了 %d 次，应为 1（必须用真实读验证会话）", f.probeHits)
			}
		})
	}
}

// 登录失败必须把服务端状态清干净，不能留下半登录的会话。
func TestCasLoginFailureResets(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	s := &Server{cas: newCasService()}

	rec := httptest.NewRecorder()
	s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
	var ch map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ch)
	challenge, _ := ch["challenge"].(string)

	// challenge 不对 → 409，且不能碰坏现有状态判断。
	raw, _ := json.Marshal(map[string]any{"challenge": "wrong", "username": "u", "password": "p"})
	rec = httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	if rec.Code != 409 {
		t.Fatalf("challenge 不匹配应返回 409，实际 %d", rec.Code)
	}

	// 缺账号密码 → 400。
	raw, _ = json.Marshal(map[string]any{"challenge": challenge, "username": "", "password": ""})
	rec = httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	if rec.Code != 400 {
		t.Fatalf("缺账号密码应返回 400，实际 %d", rec.Code)
	}

	// 没取过登录页就直接登录 → 409。
	s2 := &Server{cas: newCasService()}
	raw, _ = json.Marshal(map[string]any{"challenge": "x", "username": "u", "password": "p"})
	rec = httptest.NewRecorder()
	s2.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	if rec.Code != 409 {
		t.Fatalf("未初始化应返回 409，实际 %d", rec.Code)
	}
	if s2.cas.authenticated {
		t.Fatal("失败的登录不应留下已登录状态")
	}
}

func TestCasLoginRejectsAnHTTP200LoginPage(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	f.ehall.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("<html>统一身份认证，请登录</html>"))
	})
	s := &Server{cas: newCasService()}
	s.handleCasChallenge(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", nil))
	body, _ := json.Marshal(map[string]string{"challenge": s.cas.challenge, "username": "test-student", "password": "fake-password"})
	rec := httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body))))
	if rec.Code != 401 || s.cas.authenticated || s.cas.client != nil {
		t.Fatalf("HTTP 200 login page became success: status %d authenticated %t", rec.Code, s.cas.authenticated)
	}
}

// CAS 登录过就必须优先用它，不能回落去读粘来的旧 Cookie；
// 没登录时才回落到 Cookie。两条路并存期间这个优先级不能搞反。
func TestSchoolClientPrefersCasSession(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "stale-cookie"}}}

	// 登录前：没有 CAS 会话，回落到粘来的 Cookie。
	c, err := s.schoolClient()
	if err != nil {
		t.Fatalf("schoolClient: %v", err)
	}
	if c.usesJar {
		t.Fatal("尚未登录统一身份认证，不应使用 jar 客户端")
	}
	if c.cookie != "stale-cookie" {
		t.Fatalf("应回落到粘来的 Cookie，实际 %q", c.cookie)
	}

	// 走一遍登录。
	rec := httptest.NewRecorder()
	s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
	var ch map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ch)
	challenge, _ := ch["challenge"].(string)
	raw, _ := json.Marshal(map[string]any{"challenge": challenge, "username": "u", "password": "p"})
	rec = httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	if rec.Code != 200 {
		t.Fatalf("login: %d %s", rec.Code, rec.Body.String())
	}

	// 登录后：必须用 CAS 的 cookiejar，绝不能碰那份旧 Cookie。
	c, err = s.schoolClient()
	if err != nil {
		t.Fatalf("schoolClient: %v", err)
	}
	if !c.usesJar {
		t.Fatal("已登录统一身份认证，却还在用粘来的 Cookie")
	}
	if c.cookie != "" {
		t.Fatalf("jar 客户端不该手写 Cookie 头，实际 %q", c.cookie)
	}
}

// 清除统一身份认证登录后必须自动回落到 Cookie，不能把用户晾在原地。
func TestSchoolClientFallsBackAfterCasLogout(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "kept-cookie"}}}

	rec := httptest.NewRecorder()
	s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
	var ch map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ch)
	challenge, _ := ch["challenge"].(string)
	raw, _ := json.Marshal(map[string]any{"challenge": challenge, "username": "u", "password": "p"})
	rec = httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	if rec.Code != 200 {
		t.Fatalf("login: %d", rec.Code)
	}

	// 清除 CAS 登录。
	rec = httptest.NewRecorder()
	s.handleCasSession(rec, httptest.NewRequest(http.MethodDelete, "/api/cas/session", nil))
	if rec.Code != 200 {
		t.Fatalf("cas session delete: %d", rec.Code)
	}
	c, err := s.schoolClient()
	if err != nil {
		t.Fatalf("schoolClient: %v", err)
	}
	if c.usesJar {
		t.Fatal("已清除统一身份认证登录，不应再使用 jar 客户端")
	}
	if c.cookie != "kept-cookie" {
		t.Fatalf("应回落到 Cookie，实际 %q", c.cookie)
	}
}

// 两条会话都没有时必须给出可操作的提示，而不是一句「暂无数据」。
func TestSchoolClientWithoutAnySession(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase, casTestEhall = "", ""
	// memSessionStore 在 Cookie 为空时返回 ErrSessionNotFound。
	s := &Server{cas: newCasService(), session: &memSessionStore{}}
	rec := httptest.NewRecorder()
	s.handleScores(rec, httptest.NewRequest("GET", "/api/scores?level=graduate", nil))
	if rec.Code != 409 {
		t.Fatalf("无任何会话应返回 409，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "统一身份认证") {
		t.Fatalf("提示应指引用户去登录统一身份认证，实际：%s", rec.Body.String())
	}
}

// 登录页解析不出加密盐时必须明确失败，不能硬着头皮发请求。
func TestCasChallengeWithoutSalt(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase = "http://127.0.0.1:9"
	casTestEhall = "http://127.0.0.1:9"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html><body><form><input name="lt" id="lt" value="x"></form></body></html>`))
	}))
	defer srv.Close()
	casTestBase = srv.URL
	casTestEhall = srv.URL

	s := &Server{cas: newCasService()}
	rec := httptest.NewRecorder()
	s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
	if rec.Code != 502 {
		t.Fatalf("缺少加密盐应返回 502，实际 %d", rec.Code)
	}
	if s.cas.authenticated || s.cas.challenge != "" {
		t.Fatal("失败后服务端状态应被清空")
	}
}

// casChallengeFor 取一次登录页，返回挑战号。
func casChallengeFor(t *testing.T, s *Server) string {
	t.Helper()
	rec := httptest.NewRecorder()
	s.handleCasChallenge(rec, httptest.NewRequest(http.MethodPost, "/api/cas/challenge", nil))
	var ch map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ch)
	challenge, _ := ch["challenge"].(string)
	if rec.Code != 200 || challenge == "" {
		t.Fatalf("challenge: %d %s", rec.Code, rec.Body.String())
	}
	return challenge
}

// casSubmit 用一组测试账号提交登录，返回登录响应。
func casSubmit(s *Server, challenge string) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(map[string]any{"challenge": challenge, "username": "2099000001", "password": "wrong-password"})
	rec := httptest.NewRecorder()
	s.handleCasLogin(rec, httptest.NewRequest(http.MethodPost, "/api/cas/login", strings.NewReader(string(raw))))
	return rec
}

// 学校拒绝登录时要说出原因（账号密码、验证码、账号被限制），不能一律报「登录已失效」，
// 否则用户只会拿同一组输入反复重试。这一步的 401 不是会话过期。
func TestCasLoginReportsSchoolReason(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	failurePage := func(tip, needCaptcha string) string {
		return `<html><body><form id="pwdFromId"><input type="hidden" id="pwdEncryptSalt" value="1RKM2IpP3pRszFGS" /><input type="hidden" id="execution" name="execution" value="e2s1" />` +
			`<span id="showErrorTip" class="form-error"><span>` + tip + `</span></span></form><script>var needCaptcha = "` + needCaptcha + `"</script></body></html>`
	}
	for _, row := range []struct {
		name, want string
		status     int
		page       string
	}{
		{"wrong password 401", "学号或密码不正确", 401, failurePage("您提供的用户名或者密码有误", "")},
		{"wrong password 200", "学号或密码不正确", 200, failurePage("您提供的用户名或者密码有误", "")},
		{"wrong captcha", "验证码不正确", 200, failurePage("图形动态码错误", "1")},
		{"locked", "限制了这个账号登录", 401, failurePage("该账号已被冻结，请联系管理员", "")},
		{"other reason", "学校未接受这次登录：请先完成安全验证", 200, failurePage("请先完成安全验证", "")},
		{"captcha now required", "要求本次登录输入验证码", 200, failurePage("", "1")},
		{"no reason", "学校未接受这次登录，请核对学号和密码", 401, failurePage("", "")},
		{"forbidden", "学校拒绝了这次登录", 403, "<html>forbidden</html>"},
	} {
		t.Run(row.name, func(t *testing.T) {
			f := newCasFixture(t, false)
			f.enable()
			page := f.srv.Config.Handler
			f.srv.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == casLoginPath && r.Method == http.MethodPost {
					w.WriteHeader(row.status)
					w.Write([]byte(row.page))
					return
				}
				page.ServeHTTP(w, r)
			})
			s := &Server{cas: newCasService()}
			rec := casSubmit(s, casChallengeFor(t, s))
			if rec.Code != 401 {
				t.Fatalf("status %d %s", rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), row.want) || strings.Contains(rec.Body.String(), "登录已失效") {
				t.Fatalf("没有说出学校给的原因：%s", rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "wrong-password") || strings.Contains(rec.Body.String(), "2099000001") {
				t.Fatal("错误信息回显了账号或密码")
			}
			if f.probeHits != 0 || s.cas.authenticated || s.cas.client != nil {
				t.Fatalf("登录被拒后不该继续探测或留下状态：probe=%d", f.probeHits)
			}
		})
	}
}

// 学校没有退回登录表单、但后续业务读取拿到登录页时，要说清是教务没接受，而不是账号密码错或登录过期。
func TestCasLoginAcceptedButBusinessRejected(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	f.ehall.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("<html>统一身份认证，请登录</html>"))
	})
	s := &Server{cas: newCasService()}
	rec := casSubmit(s, casChallengeFor(t, s))
	if rec.Code != 401 || !strings.Contains(rec.Body.String(), "本科教务没有接受这次登录") || s.cas.authenticated {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

// casSchoolExpired 造一条「已登录」的统一身份认证会话，学校对任何业务读取都回登录页。
func casSchoolExpired(s *Server) *http.Client {
	return casSchoolAnswers(s, ehallTestTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("<html>统一身份认证，请登录</html>")), Request: r}, nil
	}))
}

// casSchoolAnswers 造一条「已登录」的统一身份认证会话，学校那边由 rt 应答。
func casSchoolAnswers(s *Server, rt http.RoundTripper) *http.Client {
	client := newCasClient()
	client.Transport = rt
	s.cas.mu.Lock()
	s.cas.client, s.cas.authenticated = client, true
	s.cas.mu.Unlock()
	return client
}

// 统一身份认证会话过期后，成绩和本科课表读到登录页时要把这条会话复位：
// /api/cas/session 不再报已登录，下一次读取回落到粘贴的 Cookie。
func TestCasSessionExpiryResetsAndFallsBackToCookie(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase, casTestEhall = "", ""
	for name, read := range map[string]func(*Server) *httptest.ResponseRecorder{
		"scores": func(s *Server) *httptest.ResponseRecorder {
			w := httptest.NewRecorder()
			s.handleScores(w, httptest.NewRequest(http.MethodGet, "/api/scores?level=undergrad", nil))
			return w
		},
		"timetable": func(s *Server) *httptest.ResponseRecorder {
			w := httptest.NewRecorder()
			s.handleUndergradTimetable(w, httptest.NewRequest(http.MethodGet, "/api/academic/undergrad/timetable", nil))
			return w
		},
	} {
		t.Run(name, func(t *testing.T) {
			s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "kept-cookie"}}}
			casSchoolExpired(s)
			w := read(s)
			if w.Code != 401 || !strings.Contains(w.Body.String(), "统一身份认证登录已失效") {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			rec := httptest.NewRecorder()
			s.handleCasSession(rec, httptest.NewRequest(http.MethodGet, "/api/cas/session", nil))
			if !strings.Contains(rec.Body.String(), `"authenticated":false`) {
				t.Fatalf("会话过期后仍报已登录：%s", rec.Body.String())
			}
			c, err := s.schoolClient()
			if err != nil || c.usesJar || c.cookie != "kept-cookie" {
				t.Fatalf("过期后应回落到粘贴的 Cookie：%+v %v", c, err)
			}
		})
	}
}

// 只复位读取时用的那条会话：读取途中用户已经重新登录，新会话不能被旧请求的失败误伤；
// 没有权限也不是会话过期，不能清掉登录。
func TestCasExpiryOnlyResetsTheSessionThatFailed(t *testing.T) {
	s := &Server{cas: newCasService()}
	old := casSchoolExpired(s)
	s.cas.mu.Lock()
	stale := &ehallClient{base: ehallBaseURL, http: old, usesJar: true}
	s.cas.mu.Unlock()
	casSchoolExpired(s)
	s.writeSchoolReadError(httptest.NewRecorder(), stale, errSessionExpired)
	if !s.cas.authenticated || s.cas.client == nil {
		t.Fatal("旧会话的失败清掉了新登录")
	}
	s.cas.mu.Lock()
	current := s.cas.ehallClient()
	s.cas.mu.Unlock()
	w := httptest.NewRecorder()
	s.writeSchoolReadError(w, current, errSessionPermission)
	if w.Code != 403 || !s.cas.authenticated {
		t.Fatal("没有权限不该清掉登录", w.Code)
	}
}

// 登录请求在学校那边卡住时，/api/cas/session 与清除登录都不能排在锁后面；
// 途中清除后，这次登录的结果不能复活。
func TestCasLoginDoesNotHoldLockDuringSchoolRequests(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	f := newCasFixture(t, false)
	f.enable()
	entered, release := make(chan struct{}), make(chan struct{})
	page := f.srv.Config.Handler
	f.srv.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == casLoginPath && r.Method == http.MethodPost {
			close(entered)
			<-release
		}
		page.ServeHTTP(w, r)
	})
	s := &Server{cas: newCasService()}
	challenge := casChallengeFor(t, s)
	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- casSubmit(s, challenge) }()
	<-entered
	quick := make(chan string, 2)
	go func() {
		rec := httptest.NewRecorder()
		s.handleCasSession(rec, httptest.NewRequest(http.MethodGet, "/api/cas/session", nil))
		quick <- rec.Body.String()
		rec = httptest.NewRecorder()
		s.handleCasSession(rec, httptest.NewRequest(http.MethodDelete, "/api/cas/session", nil))
		quick <- rec.Body.String()
	}()
	for i := 0; i < 2; i++ {
		select {
		case <-quick:
		case <-time.After(5 * time.Second):
			close(release)
			t.Fatal("登录进行中，会话查询或清除被锁住了")
		}
	}
	close(release)
	rec := <-done
	s.cas.mu.Lock()
	defer s.cas.mu.Unlock()
	if rec.Code != 409 || s.cas.authenticated || s.cas.client != nil {
		t.Fatalf("途中清除后登录结果复活了：%d %s", rec.Code, rec.Body.String())
	}
}

// 学校回的是维护页、网关拦截页这类 200 网页时，说不准登录是否还在：不能清掉统一身份
// 认证会话（清掉就得重新输密码和验证码），也不能报成登录已失效。
func TestCasSessionSurvivesMaintenancePage(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase, casTestEhall = "", ""
	for _, page := range []string{
		"<html><head><title>系统维护中</title></head><body>服务暂时不可用，请稍后访问</body></html>",
		"<!DOCTYPE html>\n<HTML><body>Request blocked by WAF</body></HTML>",
	} {
		s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "kept-cookie"}}}
		casSchoolAnswers(s, ehallTestTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(page)), Request: r}, nil
		}))
		w := httptest.NewRecorder()
		s.handleScores(w, httptest.NewRequest(http.MethodGet, "/api/scores?level=undergrad", nil))
		if w.Code != 502 || !strings.Contains(w.Body.String(), "可能正在维护") || strings.Contains(w.Body.String(), "已失效") {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		if !s.cas.authenticated || s.cas.client == nil {
			t.Fatal("维护页清掉了仍然有效的统一身份认证登录")
		}
	}
}

// 学校回的是业务 JSON、只是 msg 里提到“登录/超时”（errSessionInvalid，不是确认过的 errSessionExpired）时，
// 说不准会话是否真的没了：要告诉用户登录状态可能失效（401），但不能把统一身份认证会话清掉——
// 清掉就得重新输密码和验证码。只有被送回登录页（errSessionExpired）才复位，两种错误不能混同。
func TestCasSessionSurvivesUncertainSessionHint(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase, casTestEhall = "", ""
	for _, body := range []string{
		`{"code":"500","msg":"登录超时，请重新登录","datas":{}}`,
		`{"code":"401","msg":"用户未认证","datas":{}}`,
	} {
		s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "kept-cookie"}}}
		casSchoolAnswers(s, ehallTestTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
		}))
		w := httptest.NewRecorder()
		s.handleScores(w, httptest.NewRequest(http.MethodGet, "/api/scores?level=undergrad", nil))
		if w.Code != 401 {
			t.Fatalf("%s: %d %s", body, w.Code, w.Body.String())
		}
		if !s.cas.authenticated || s.cas.client == nil {
			t.Fatalf("%s: 没有确认过期的提示清掉了统一身份认证登录", body)
		}
		c, err := s.schoolClient()
		if err != nil || !c.usesJar {
			t.Fatalf("%s: 之后的读取应继续用统一身份认证会话：%+v %v", body, c, err)
		}
	}
}

// 会话跟着跳转回到 authserver 时，不管那一页长什么样，都是被送回了登录页：要复位。
func TestCasSessionResetWhenRedirectedToAuthserver(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	casTestBase, casTestEhall = "", ""
	s := &Server{cas: newCasService(), session: &memSessionStore{value: credential.Session{Cookie: "kept-cookie"}}}
	casSchoolAnswers(s, ehallTestTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == ehallHost {
			h := make(http.Header)
			h.Set("Location", casBaseURL+casLoginPath+"?service="+url.QueryEscape(r.URL.String()))
			return &http.Response{StatusCode: 302, Header: h, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("<html><body>请稍候…</body></html>")), Request: r}, nil
	}))
	w := httptest.NewRecorder()
	s.handleUndergradTimetable(w, httptest.NewRequest(http.MethodGet, "/api/academic/undergrad/timetable?term=2026-2027-1", nil))
	if w.Code != 401 || !strings.Contains(w.Body.String(), "统一身份认证登录已失效") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	if s.cas.authenticated || s.cas.client != nil {
		t.Fatal("被送回 authserver 后统一身份认证会话没有复位")
	}
}

// 提交后停在 authserver 上、又不是登录表单（二次认证、完善信息一类）时，要说清是学校
// 要求额外验证；不能当成已提交，再拿业务探针的失败报成「本科教务没有接受」。
func TestCasLoginReportsExtraVerification(t *testing.T) {
	base, ehall := casTestBase, casTestEhall
	defer func() { casTestBase, casTestEhall = base, ehall }()
	extra := `<html><body><div class="reAuth">为了您的账号安全，请完成二次认证</div></body></html>`
	for name, answer := range map[string]func(http.ResponseWriter, *http.Request){
		"same page": func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(extra)) },
		"redirected": func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "/authserver/reAuthCheck/reAuthLoginView.do", http.StatusFound)
		},
	} {
		t.Run(name, func(t *testing.T) {
			f := newCasFixture(t, false)
			f.enable()
			page := f.srv.Config.Handler
			f.srv.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.URL.Path == casLoginPath && r.Method == http.MethodPost:
					answer(w, r)
				case strings.HasPrefix(r.URL.Path, "/authserver/reAuthCheck/"):
					w.Write([]byte(extra))
				default:
					page.ServeHTTP(w, r)
				}
			})
			s := &Server{cas: newCasService()}
			rec := casSubmit(s, casChallengeFor(t, s))
			if rec.Code != 401 || !strings.Contains(rec.Body.String(), "额外验证") || strings.Contains(rec.Body.String(), "本科教务") {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if f.probeHits != 0 || s.cas.authenticated || s.cas.client != nil {
				t.Fatalf("需要额外验证时不该继续探测或留下状态：probe=%d", f.probeHits)
			}
		})
	}
}
