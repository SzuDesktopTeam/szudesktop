package ui

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	xhtml "golang.org/x/net/html"
)

// 深大统一身份认证（authserver.szu.edu.cn，Apereo CAS）的应用内登录。
//
// 与研究生选课系统那套（academic_login.go）是同一个形状：挑战号 + 验证码 +
// 账号密码，全部由用户在应用内填写，登录态只留在进程内存里，关闭应用即清除。
// 差别在于本科业务挂在 ehall 的统一身份认证后面，登录成功后要拿着 CAS 发的
// ticket 跳回 ehall 才会落下 JSESSIONID，之后本科课表和成绩共用这一条会话。
const (
	casHost        = "authserver.szu.edu.cn"
	casBaseURL     = "https://" + casHost
	casLoginPath   = "/authserver/login"
	casCaptchaPath = "/authserver/getCaptcha.htl"
	// 登录成功后要回到的 ehall 业务页。它同时是 CAS 的 service 参数。
	casServicePath = "/jwapp/sys/wdkb/*default/index.do"
)

// 测试注入点：非空时用 httptest 假服务器顶替真实学校地址，
// 并放行 http 与本地回环。生产环境下两者为零值。
var casTestBase, casTestEhall string

func casRoot() string {
	if casTestBase != "" {
		return casTestBase
	}
	return casBaseURL
}

func ehallRoot() string {
	if casTestEhall != "" {
		return casTestEhall
	}
	return ehallBaseURL
}

func casServiceTarget() string { return ehallRoot() + casServicePath }

var (
	casSaltRe      = regexp.MustCompile(`id="pwdEncryptSalt"\s+value="([^"]*)"`)
	casExecutionRe = regexp.MustCompile(`name="execution"\s+value="([^"]*)"`)
	casLtRe        = regexp.MustCompile(`name="lt"\s+id="lt"\s+value="([^"]*)"`)
	// 页面上出现这个容器才说明本次登录被要求输入图形验证码。
	// 真正决定要不要验证码的是页面里的 needCaptcha 变量：空字符串表示不需要。
	// captchaDiv 在 HTML 里恒存在（其中一个还带 hide class，由 JS 按需显示），
	// 所以拿容器判断会永远多要一个验证码框——这是实测踩到的坑。
	casNeedCaptchaRe = regexp.MustCompile(`var\s+needCaptcha\s*=\s*"([^"]*)"`)
	// needCaptcha 变量缺席时（页面结构变了）的后备信号：账号密码表单里有没有验证码输入框。
	casCaptchaInputRe = regexp.MustCompile(`<input[^>]*id="captcha"[^>]*name="captcha"`)
	// 登录提交后回到的仍是账号密码表单，说明学校没有放行。
	casLoginFormRe = regexp.MustCompile(`id="pwdEncryptSalt"|name="execution"`)
	// 新版失败页放提示语的容器 id：showErrorTip 一类。
	casErrorTipID = regexp.MustCompile(`(?i)^\w*ErrorTip$`)
)

// casService 的字段语义与 academicService 一致，方便对照审查。
//
// mu 只保护字段的读写，不跨学校请求持有：取登录页、提交登录、导入学校窗口会话
// 都是先在锁内取好快照并记下 gen，锁外发请求，回到锁内确认 gen 没变才落下结果。
// reset 会让 gen 前进，所以请求途中用户清除了登录或换了账号，旧结果不会复活；
// /api/cas/session、成绩和课表也不必排在一次最长几十秒的登录后面。
type casService struct {
	mu            sync.Mutex
	gen           uint64
	client        *http.Client
	challenge     string
	salt          string
	execution     string
	lt            string
	captcha       []byte
	expires       time.Time
	authenticated bool
}

func newCasService() *casService { return &casService{} }

// errCasSuperseded：请求途中这条登录被清除，或被新的登录替换，本次结果作废。
var errCasSuperseded = errors.New("本次登录已被清除或被新的登录替换，请重新获取学校登录页")

// casLoginRejected 表示学校没有接受这次登录（账号密码、验证码或账号状态）。
// 它和「登录状态过期」是两回事：前者要改输入，后者要重新登录。
type casLoginRejected struct{ reason string }

func (e *casLoginRejected) Error() string { return e.reason }

func writeCasError(w http.ResponseWriter, err error) {
	if errors.Is(err, errSessionInvalid) {
		writeAPIError(w, 401, errors.New("统一身份认证登录已失效，请重新登录"))
		return
	}
	var rejected *casLoginRejected
	if errors.As(err, &rejected) {
		writeAPIError(w, 401, err)
		return
	}
	writeSchoolError(w, err)
}

// newCasClient 允许在 authserver 与 ehall 之间跟随跳转——CAS 的 ticket 必须
// 跳回 ehall 才会落下会话，这一点和研究生那套刻意拦住 authserver 正好相反。
func newCasClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, Timeout: 25 * time.Second, Transport: &http.Transport{Proxy: nil},
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 8 {
				return errors.New("学校登录跳转次数过多")
			}
			if !casURLAllowed(r.URL) {
				return errors.New("学校登录跳转到未支持的地址")
			}
			return nil
		},
	}
}

func casURLAllowed(u *url.URL) bool {
	if u.User != nil {
		return false
	}
	// 测试模式：只认注入进来的两个假源。
	if casTestBase != "" {
		return strings.HasPrefix(u.String(), casTestBase+"/") || strings.HasPrefix(u.String(), casTestEhall+"/")
	}
	if u.Scheme != "https" {
		return false
	}
	switch u.Hostname() {
	case casHost:
		return u.Port() == "" || u.Port() == "443"
	case ehallHost:
		return (u.Port() == "" || u.Port() == "443") && (ehallPathAllowed(u.Path) || u.Path == casServicePath)
	}
	return false
}

// casRequest 只发往白名单内的地址。form 为 nil 时是 GET。
func casRequest(ctx context.Context, client *http.Client, address string, form url.Values, referer string) ([]byte, error) {
	status, body, _, err := casDo(ctx, client, address, form, referer)
	if err != nil {
		return nil, err
	}
	switch status {
	case 200, 302:
	case 401:
		return nil, errSessionInvalid
	case 403:
		return nil, errSessionPermission
	default:
		return nil, errors.New("学校系统暂时未能完成请求，请稍后重试")
	}
	return body, nil
}

// casDo 发出请求，把状态码、正文和跟完跳转后的最终地址交给调用方判断。
// 登录这一步的 401 和 200 都要读正文找学校给的原因，还要看最后停在哪个站点，
// 所以不能套用 casRequest 的映射。
func casDo(ctx context.Context, client *http.Client, address string, form url.Values, referer string) (int, []byte, *url.URL, error) {
	u, err := url.Parse(address)
	if err != nil || !casURLAllowed(u) {
		return 0, nil, nil, errors.New("不支持的学校系统地址")
	}
	method := http.MethodGet
	var body io.Reader
	if form != nil {
		method = http.MethodPost
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, address, body)
	if err != nil {
		return 0, nil, nil, errors.New("无法创建学校请求")
	}
	req.Header.Set("User-Agent", ehallUserAgent)
	req.Header.Set("Referer", referer)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
		req.Header.Set("Origin", u.Scheme+"://"+u.Host)
	}
	res, err := client.Do(req)
	if err != nil {
		// 跳转被我们主动截断时错误里会带上 URL，不能原样透出。
		if errors.Is(err, errSessionInvalid) {
			return 0, nil, nil, errSessionInvalid
		}
		return 0, nil, nil, schoolConnectionError("学校系统暂时无法连接", "学校系统暂时无法连接，请检查校园网后重试", req.URL, err)
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, ehallMaxBody+1))
	if err != nil || len(b) > ehallMaxBody {
		return 0, nil, nil, errors.New("学校响应无法完整读取")
	}
	final := u
	if res.Request != nil && res.Request.URL != nil {
		final = res.Request.URL
	}
	return res.StatusCode, b, final, nil
}

// casOnEhall 判断请求最终落在 ehall 上：学校放行登录后，client 会一路跟着跳回那里。
func casOnEhall(u *url.URL) bool {
	if casTestEhall != "" {
		return strings.HasPrefix(u.String(), casTestEhall+"/")
	}
	return strings.EqualFold(u.Hostname(), ehallHost)
}

// reset 清空账号状态并让 gen 前进，调用方须持有 c.mu。
func (c *casService) reset() {
	if c.client != nil {
		c.client.CloseIdleConnections()
	}
	c.client = nil
	c.challenge = ""
	c.salt = ""
	c.execution = ""
	c.lt = ""
	c.captcha = nil
	c.expires = time.Time{}
	c.authenticated = false
	c.gen++
}

// ehallClient 复用 CAS 登录时积累的 cookiejar。调用方须持有 c.mu 且已确认登录。
// 不能走 newEhallClient：那会另起一个没有会话的 http.Client。
func (c *casService) ehallClient() *ehallClient {
	base := ehallBaseURL
	if casTestEhall != "" {
		base = casTestEhall
	}
	return &ehallClient{base: base, http: c.client, usesJar: true}
}

// schoolClient 决定本科业务用哪条会话：统一身份认证登录过就用它，
// 否则回落到用户粘来的 ehall Cookie。两条路并存期间谁都不能坏。
// 会话失效时要能区分「先去登录」和「重新粘一次」，所以错误信息分开。
func (s *Server) schoolClient() (*ehallClient, error) {
	// s.cas 可能为 nil：测试按需直接构造 Server，只填自己那几个字段。
	if s.cas != nil {
		c := s.cas
		c.mu.Lock()
		if c.authenticated && c.client != nil {
			client := c.ehallClient()
			c.mu.Unlock()
			return client, nil
		}
		c.mu.Unlock()
	}
	v, err := s.sessionStore().Load()
	if err != nil {
		return nil, err
	}
	return s.makeEhallClient(v.Cookie), nil
}

// writeSchoolReadError 报告本科业务读取失败。
//
// 用的是统一身份认证会话、学校又确实把请求送回了登录页（errSessionExpired）时，
// 要把这条会话复位：否则 /api/cas/session 继续报已登录，schoolClient 也会一直优先
// 返回这条死会话，用户重新粘贴 Cookie 都不起作用。维护页、网关拦截页这类说不准的
// 情况不复位，免得清掉一条仍然有效的登录。只复位读取时用的那一条——读取途中用户
// 已经重新登录的话，新会话不能被旧请求的失败误伤。
func (s *Server) writeSchoolReadError(w http.ResponseWriter, used *ehallClient, err error) {
	if used == nil || !used.usesJar || s.cas == nil || !errors.Is(err, errSessionExpired) {
		writeSchoolError(w, err)
		return
	}
	c := s.cas
	c.mu.Lock()
	if c.client == used.http {
		c.reset()
	}
	c.mu.Unlock()
	writeCasError(w, err)
}

// handleCasSession 的 DELETE 已经把 cas 状态清掉，schoolClient 会自动回落到 Cookie，
// 所以「清除统一身份认证登录」不需要额外动 Cookie，反之亦然。
func writeSchoolClientError(w http.ResponseWriter, err error) {
	if errors.Is(err, credential.ErrSessionNotFound) {
		writeAPIError(w, 409, errors.New("还没有学校系统登录状态：请先在上方用学号密码登录统一身份认证"))
		return
	}
	writeSessionLoadError(w, err)
}

func (s *Server) handleCasSession(w http.ResponseWriter, r *http.Request) {
	c := s.cas
	c.mu.Lock()
	defer c.mu.Unlock()
	if r.Method == http.MethodDelete {
		c.reset()
		writeJSON(w, map[string]bool{"ok": true})
		return
	}
	writeJSON(w, map[string]any{"authenticated": c.authenticated, "level": "undergraduate", "storage": "仅本次运行，关闭应用即清除"})
}

// handleCasChallenge 取登录页，解析加密盐与 execution，并按页面实际情况取验证码。
func (s *Server) handleCasChallenge(w http.ResponseWriter, r *http.Request) {
	c := s.cas
	c.mu.Lock()
	// 重新开始一次登录必须先把上一次的账号状态清掉。
	c.reset()
	gen := c.gen
	c.mu.Unlock()
	// 以下学校请求都在锁外。失败时状态本来就是刚复位的空白，不必再动。
	client := newCasClient()
	fail := func(status int, err error) {
		client.CloseIdleConnections()
		if status == 0 {
			writeCasError(w, err)
			return
		}
		writeAPIError(w, status, err)
	}
	page, err := casRequest(r.Context(), client, casRoot()+casLoginPath+"?service="+url.QueryEscape(casServiceTarget()), nil, casServiceTarget())
	if err != nil {
		fail(0, err)
		return
	}
	parsed := parseCasLoginPage(string(page))
	if parsed.Salt == "" {
		fail(502, errors.New("学校登录页没有返回加密参数，请稍后重试"))
		return
	}
	// 只在页面确实要求图形验证码时才去取图：多数情况下本次登录不需要验证码，
	// 硬取一张只会让用户多填一个框。
	var captcha []byte
	if parsed.NeedCaptcha {
		img, err := casRequest(r.Context(), client, casRoot()+casCaptchaPath+"?"+strconv.FormatInt(time.Now().UnixMilli(), 10), nil, casRoot()+casLoginPath)
		if err != nil || len(img) == 0 || !strings.HasPrefix(http.DetectContentType(img), "image/") {
			fail(502, errors.New("学校验证码图片未能加载，请稍后重试"))
			return
		}
		captcha = img
	}
	nonce := make([]byte, 16)
	if _, err = rand.Read(nonce); err != nil {
		fail(500, errors.New("无法创建本次登录"))
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.gen != gen {
		// 取登录页途中用户清除了登录或又开始了一次：这份登录页作废。
		fail(409, errCasSuperseded)
		return
	}
	c.client, c.salt, c.execution, c.lt, c.captcha = client, parsed.Salt, parsed.Execution, parsed.Lt, captcha
	c.challenge = hex.EncodeToString(nonce)
	c.expires = time.Now().Add(5 * time.Minute)
	out := map[string]any{"challenge": c.challenge, "message": "请填写统一身份认证的学号和密码。账号密码仅本次使用。"}
	if c.captcha != nil {
		out["image"] = "/api/cas/captcha?id=" + c.challenge
	}
	writeJSON(w, out)
}

func (s *Server) handleCasCaptcha(w http.ResponseWriter, r *http.Request) {
	c := s.cas
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.challenge == "" || r.URL.Query().Get("id") != c.challenge || time.Now().After(c.expires) {
		writeAPIError(w, 410, errors.New("验证码已过期，请刷新"))
		return
	}
	if c.captcha == nil {
		writeAPIError(w, 404, errors.New("本次登录不需要验证码"))
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(c.captcha))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(c.captcha)
}

// casLoginPage 是登录页里我们需要的全部信息。
type casLoginPage struct {
	Salt        string
	Execution   string
	Lt          string
	NeedCaptcha bool
}

// parseCasLoginPage 从登录页 HTML 里抽出登录所需的参数。
// 抽成纯函数是为了能拿学校真实页面直接验，不必真登录一次。
//
// lt 在真实页面上就是空值，而浏览器自己也从不设置它——login.js 没有任何额外
// 请求去取 lt，直接用原生表单提交隐藏域里的空值。所以这里「给空传空」是照抄
// 浏览器行为，不是图省事。
//
// 是否需要验证码看 needCaptcha 变量，不看 captchaDiv 容器：容器在 HTML 里恒存在
// （真实页面上有两个，其中一个还带 hide class，由 JS 按需显示），拿它判断会永远
// 多要一个验证码框——这是拿真实页面实测踩到的坑。
func parseCasLoginPage(body string) casLoginPage {
	var p casLoginPage
	if m := casSaltRe.FindStringSubmatch(body); m != nil {
		p.Salt = m[1]
	}
	if m := casExecutionRe.FindStringSubmatch(body); m != nil {
		p.Execution = m[1]
	}
	if m := casLtRe.FindStringSubmatch(body); m != nil {
		p.Lt = m[1]
	}
	if m := casNeedCaptchaRe.FindStringSubmatch(body); m != nil {
		// 变量在场：非空才要验证码。空字符串是学校的「本次不需要」。
		p.NeedCaptcha = m[1] != ""
	} else {
		// 变量缺席（页面结构变了）：退回结构判断，看账号密码表单里有没有验证码输入框。
		p.NeedCaptcha = casCaptchaInputRe.MatchString(body)
	}
	return p
}

// casLoginForm 拼出登录表单。抽成纯函数是为了能在不发一个请求的情况下
// 钉死协议形状——字段名和取值直接决定学校收不收。
func casLoginForm(username, encryptedPassword, lt, execution, captcha string) url.Values {
	form := url.Values{
		"username":   {strings.TrimSpace(username)},
		"password":   {encryptedPassword},
		"lt":         {lt},
		"execution":  {execution},
		"_eventId":   {"submit"},
		"cllt":       {"userNameLogin"},
		"dllt":       {"generalLogin"},
		"rememberMe": {"false"},
	}
	if captcha := strings.TrimSpace(captcha); captcha != "" {
		form.Set("captcha", captcha)
	}
	return form
}

// handleCasLogin 提交账号密码。口令按学校 encrypt.js 的规则加密后才上网。
func (s *Server) handleCasLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Challenge string `json:"challenge"`
		Username  string `json:"username"`
		Password  string `json:"password"`
		Captcha   string `json:"captcha"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.Username) == "" || in.Password == "" || len(in.Username) > 80 || len(in.Password) > 128 {
		writeAPIError(w, 400, errors.New("请填写学号和密码"))
		return
	}
	c := s.cas
	c.mu.Lock()
	if c.challenge == "" || in.Challenge != c.challenge || time.Now().After(c.expires) {
		c.mu.Unlock()
		writeAPIError(w, 409, errors.New("本次登录已失效，请重新获取登录页"))
		return
	}
	// 验证码是条件性的：页面没要就不校验，页面要了就必须填。
	if c.captcha != nil && strings.TrimSpace(in.Captcha) == "" {
		c.mu.Unlock()
		writeAPIError(w, 400, errors.New("请填写学校验证码"))
		return
	}
	// 挑战号只能用一次：取走快照后立刻作废，并发的第二次提交会拿到 409。
	client, salt, lt, execution, gen := c.client, c.salt, c.lt, c.execution, c.gen
	askedCaptcha := c.captcha != nil
	c.challenge, c.captcha = "", nil
	c.mu.Unlock()

	encrypted, err := casEncryptPassword(in.Password, salt)
	in.Password = ""
	// submitted：学校没有退回登录表单。之后再读到登录页，是本科教务没接受，不是账号密码错。
	submitted := false
	if err == nil {
		form := casLoginForm(in.Username, encrypted, lt, execution, in.Captcha)
		err = casSubmitLogin(r.Context(), client, form, askedCaptcha)
		// 密码字段用完即从表单里删掉，后面的错误处理也不再接触它。
		form.Del("password")
		submitted = err == nil
	}
	if err == nil {
		// 拿着 CAS 发的 ticket 跳回 ehall，会话才真正建立。
		_, err = casRequest(r.Context(), client, casServiceTarget(), nil, casRoot()+casLoginPath)
	}
	if err == nil {
		// 用一次真实业务读验证会话，而不是只看有没有 cookie。
		err = validateUndergradSession(r.Context(), client)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.gen != gen {
		// 登录途中用户清除了登录或又开始了一次：这次的结果不能复活。
		client.CloseIdleConnections()
		writeAPIError(w, 409, errCasSuperseded)
		return
	}
	if err != nil {
		c.reset()
		if submitted && errors.Is(err, errSessionInvalid) {
			writeAPIError(w, 401, errors.New("统一身份认证已提交，但本科教务没有接受这次登录；请稍后重新获取学校登录页再试，多次失败请在学校官方页面核对"))
			return
		}
		writeCasError(w, err)
		return
	}
	c.authenticated = true
	writeJSON(w, map[string]any{"ok": true, "authenticated": true, "message": "统一身份认证已登录，本科课表与成绩可以读取了；登录状态仅保留到关闭应用"})
}

// casSubmitLogin 提交登录表单，并把学校拒绝登录的原因读出来。
//
// 成功时学校 302 回 service（client 会一路跟到 ehall）；失败时要么 401、要么 200，
// 两种都是把登录页连同错误提示重新渲染一遍。这一步的 401 是「这次登录没被接受」，
// 不是「会话失效」——交给 casRequest 会被映射成 errSessionInvalid，用户只会看到
// 「登录已失效」，拿同一组输入反复重试。
//
// 只有最后落在 ehall 上才算学校放行了。停在 authserver 上、又不是登录表单的页面，
// 是二次认证、完善信息、修改初始密码一类的额外步骤，应用内的表单完成不了。
func casSubmitLogin(ctx context.Context, client *http.Client, form url.Values, askedCaptcha bool) error {
	status, body, final, err := casDo(ctx, client, casRoot()+casLoginPath, form, casRoot()+casLoginPath+"?service="+url.QueryEscape(casServiceTarget()))
	if err != nil {
		return err
	}
	switch status {
	case 200, 302:
		if !casLoginFormRe.Match(body) {
			if !casOnEhall(final) {
				return &casLoginRejected{"学校要求额外验证（如二次认证或完善信息），请在学校窗口或学校官方页面完成登录"}
			}
			return nil
		}
	case 401:
	case 403:
		return &casLoginRejected{"学校拒绝了这次登录，请在学校官方页面核对账号状态"}
	default:
		return errors.New("学校系统暂时未能完成请求，请稍后重试")
	}
	return casLoginFailure(string(body), askedCaptcha)
}

// casLoginFailure 从登录失败后重新渲染的页面里取出原因，翻成用户能照着改的话。
// 抽成纯函数是为了能拿失败页片段直接验。页面上的提示语只在去标签、截短后引用，
// 不回显任何表单字段。
func casLoginFailure(page string, askedCaptcha bool) error {
	tip := casErrorTip(page)
	has := func(words ...string) bool {
		for _, word := range words {
			if strings.Contains(tip, word) {
				return true
			}
		}
		return false
	}
	switch {
	case has("验证码", "动态码"):
		return &casLoginRejected{"验证码不正确，请重新获取学校登录页后再填写"}
	case has("锁定", "冻结", "次数过多", "频繁"):
		return &casLoginRejected{"学校暂时限制了这个账号登录（错误次数过多或账号被锁定），请稍后再试或在学校官方页面处理"}
	case has("密码", "用户名", "账号", "帐号", "学号"):
		return &casLoginRejected{"学号或密码不正确，请核对后重新获取学校登录页再登录"}
	case tip != "":
		return &casLoginRejected{"学校未接受这次登录：" + tip}
	}
	// 没有提示语，但页面这回要验证码了，而刚才并没有要：多半是错误次数触发了验证码。
	if !askedCaptcha && parseCasLoginPage(page).NeedCaptcha {
		return &casLoginRejected{"学校要求本次登录输入验证码，请重新获取学校登录页后填写"}
	}
	return &casLoginRejected{"学校未接受这次登录，请核对学号和密码，或在学校官方页面确认是否需要额外验证"}
}

// casErrorTip 取失败页里第一条非空的错误提示，去标签、压空白，最多 60 个字。
// 先找新版的 *ErrorTip 容器，找不到再退到旧版的 msg / errorMsg / auth_error，
// 免得把页面上别处的公告当成失败原因。
func casErrorTip(page string) string {
	root, err := xhtml.Parse(strings.NewReader(page))
	if err != nil {
		return ""
	}
	find := func(match func(*xhtml.Node) bool) string {
		var tip string
		var visit func(*xhtml.Node)
		visit = func(n *xhtml.Node) {
			if n.Type == xhtml.ElementNode && match(n) {
				tip = strings.TrimSpace(noticeNodeText(n, false))
			}
			for child := n.FirstChild; child != nil && tip == ""; child = child.NextSibling {
				visit(child)
			}
		}
		visit(root)
		return tip
	}
	tip := find(func(n *xhtml.Node) bool { return casErrorTipID.MatchString(noticeNodeAttr(n, "id")) })
	if tip == "" {
		tip = find(func(n *xhtml.Node) bool {
			id := strings.ToLower(noticeNodeAttr(n, "id"))
			return id == "msg" || id == "errormsg" || strings.Contains(noticeNodeAttr(n, "class"), "auth_error")
		})
	}
	if runes := []rune(tip); len(runes) > 60 {
		tip = string(runes[:60]) + "…"
	}
	return tip
}
