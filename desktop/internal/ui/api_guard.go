package ui

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// 调用方凭据。
//
// 127.0.0.1 不按 Windows 用户隔离：多账户电脑、机房、远程桌面或快速切换用户时，
// 另一个用户找到随机端口，不带 Origin 就能调接口——读笔记和存档、借已保存的学校会话读成绩、
// 替换或删除校园网账号、随时关掉服务。只挡跨站请求不够，还要认调用方。
//
// 凭据就是 acquireInstance 为本次运行生成的 32 字节随机数（64 位小写十六进制），
// 除 /api/health 与 /api/instance 外，每个 /api 请求都要带上它：
//   - Electron 外壳从 sidecar 标准输出的协议行拿到它，主窗口首次打开 /?launch=<凭据>
//     换成 Cookie，主进程自己发的请求带 X-SZU-Token 头；
//   - 便携版打开浏览器时同样带 /?launch=<凭据>。
//
// 凭据不进 /api/status、错误信息和日志；Cookie 只在回环地址下发。
const (
	apiTokenHeader    = "X-SZU-Token"
	sessionCookieName = "szu_session"
	launchParam       = "launch"
	apiTokenBytes     = 32
)

var errAPIUnauthorized = errors.New("请从 szuDesktop 重新打开页面（本机服务需要验证）")

// newAPIToken 生成一份随机凭据。New 先给 Server 一份，保证任何时候都不存在“空凭据”；
// Run 拿到单实例锁后换成实例记录里的那份，复用启动器才能把同一份交给外壳。
func newAPIToken() string {
	b := make([]byte, apiTokenBytes)
	// Go 1.24 起 crypto/rand.Read 不返回错误：系统随机源不可用时直接终止进程，不会给出弱凭据。
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// validAPIToken 只认 64 位小写十六进制。空串或格式不对的配置视为没有凭据，
// 不能被空请求头或空 Cookie “匹配”上。
func validAPIToken(token string) bool {
	if len(token) != apiTokenBytes*2 {
		return false
	}
	for i := 0; i < len(token); i++ {
		if c := token[i]; (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// tokenMatches 用恒定时间比较，响应时间不泄露凭据前缀。
func tokenMatches(got, want string) bool {
	return validAPIToken(want) && subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// apiAuthorized：X-SZU-Token 头或 szu_session Cookie 与本次运行的凭据相同即可。
// Cookie 不按端口隔离，本机别的网页服务也能给 127.0.0.1 种一个同名 Cookie，
// 所以同名的每一个都要比，不能只看第一个。
func (s *Server) apiAuthorized(r *http.Request) bool {
	if tokenMatches(r.Header.Get(apiTokenHeader), s.apiToken) {
		return true
	}
	for _, cookie := range r.CookiesNamed(sessionCookieName) {
		if tokenMatches(cookie.Value, s.apiToken) {
			return true
		}
	}
	return false
}

// launchURL 是交给浏览器打开的地址：一次性的 launch 参数在首页换成 Cookie。
func (s *Server) launchURL(base string) string {
	return base + "/?" + launchParam + "=" + s.apiToken
}

// acceptLaunch 用 /?launch=<凭据> 换一个 HttpOnly、SameSite=Strict 的会话 Cookie，
// 再 303 回到不带凭据的地址，地址栏、历史记录和之后的 Referer 里都不留它。
// 凭据不对、或 Host 不是回环地址时什么都不做，照常返回页面，也不下发 Cookie。
func (s *Server) acceptLaunch(w http.ResponseWriter, r *http.Request) bool {
	query := r.URL.Query()
	if !loopbackHost(r.Host) || !tokenMatches(query.Get(launchParam), s.apiToken) {
		return false
	}
	// 不设过期时间：会话 Cookie 随浏览器会话结束；凭据每次运行都换，旧 Cookie 本来也不再有效。
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: s.apiToken, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
	query.Del(launchParam)
	target := "/"
	if rest := query.Encode(); rest != "" {
		target += "?" + rest
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, target, http.StatusSeeOther)
	return true
}

// loopbackHost 判断请求的 Host 是不是本机回环地址或 localhost，挡 DNS 重绑定。
func loopbackHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return strings.EqualFold(host, "localhost") || (ip != nil && ip.IsLoopback())
}

// protectAPI 是 /api 路由的默认保护：来源检查之外还要求调用方凭据。
func (s *Server) protectAPI(next http.HandlerFunc, methods ...string) http.HandlerFunc {
	return guardAPI(s.apiAuthorized, next, methods...)
}

// publicAPI 只给两个接口用，api_token_test 会逐条核对 server.go：
//   - /api/health 只回报“这是 szuDesktop、什么版本”，外壳确认复用的旧服务版本时还没有它的凭据；
//   - /api/instance 在请求体里自带同一份凭据，由 handleInstance 恒定时间比较。
func publicAPI(next http.HandlerFunc, methods ...string) http.HandlerFunc {
	return guardAPI(nil, next, methods...)
}

// guardAPI 的检查顺序固定：回环 Host → Sec-Fetch-Site → Origin（挡跨站和 DNS 重绑定，403）
// → 调用方凭据（401）→ 方法 → JSON 请求体。凭据查在方法之前：没有凭据的调用方
// 连“有没有这个接口、支持什么方法”都问不出来。拒绝统一用 writeAPIError 的 JSON。
// authorized 为 nil 只允许出现在 publicAPI 里。
func guardAPI(authorized func(*http.Request) bool, next http.HandlerFunc, methods ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if !loopbackHost(r.Host) {
			writeAPIError(w, http.StatusForbidden, errors.New("只接受本机地址"))
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			writeAPIError(w, http.StatusForbidden, errors.New("不接受其他页面的请求"))
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Scheme != "http" || !strings.EqualFold(u.Host, r.Host) || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
				writeAPIError(w, http.StatusForbidden, errors.New("请求来源不匹配"))
				return
			}
		}
		if authorized != nil && !authorized(r) {
			writeAPIError(w, http.StatusUnauthorized, errAPIUnauthorized)
			return
		}
		allowed := false
		for _, method := range methods {
			if r.Method == method {
				allowed = true
				break
			}
		}
		if !allowed {
			w.Header().Set("Allow", strings.Join(methods, ", "))
			writeAPIError(w, http.StatusMethodNotAllowed, errors.New("不支持的方法"))
			return
		}
		if r.Method == http.MethodPost || r.Method == http.MethodPut {
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != "application/json" {
				writeAPIError(w, http.StatusUnsupportedMediaType, errors.New("请求必须使用 JSON"))
				return
			}
		}
		limit := int64(1 << 20)
		if r.URL.Path == "/api/workspace" {
			limit = workspaceMaxBytes
		} else if r.URL.Path == "/api/notebook" {
			limit = notebookMaxBytes
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next(w, r)
	}
}
