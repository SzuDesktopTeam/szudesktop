package portal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"syscall"
	"testing"
)

// 本文件是 http.go 的性质测试：对随机输入检查"任何合法输入都应成立"的约束，
// 而不是挑几个具体用例。随机源用固定种子，失败时日志里有种子可以原样复现；
// 设置 SZU_PROPERTY_SEED 可换种子。

const propertyCases = 400

func propertyRand(t *testing.T) *rand.Rand {
	t.Helper()
	seed := int64(20260928)
	if s := os.Getenv("SZU_PROPERTY_SEED"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			seed = v
		}
	}
	t.Logf("随机种子 seed=%d（可用 SZU_PROPERTY_SEED 覆盖）", seed)
	return rand.New(rand.NewSource(seed))
}

// randomBinary 生成任意二进制串（含 0 字节、非 UTF-8）。
func randomBinary(r *rand.Rand, min, max int) string {
	b := make([]byte, min+r.Intn(max-min+1))
	for i := range b {
		b[i] = byte(r.Intn(256))
	}
	return string(b)
}

// randomCJK 生成只含汉字和空格的文本：里面既没有括号，也不会碰巧凑出机密。
func randomCJK(r *rand.Rand, min, max int) string {
	n := min + r.Intn(max-min+1)
	var b strings.Builder
	for i := 0; i < n; i++ {
		if r.Intn(8) == 0 {
			b.WriteByte(' ')
			continue
		}
		b.WriteRune(rune(0x4E00 + r.Intn(0x9FFF-0x4E00)))
	}
	return b.String()
}

// secretAlphabet 是密码里常见的字符，特意混进查询串和 HTML 里有特殊含义的那些。
const secretAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" +
	"!@#$%^&*_+-=[]{}|;:',.<>/? 中文密码~`\""

// randomSecret 生成 [min, max] 字节的密码，不含小括号（括号会把正文变成 JSONP）。
func randomSecret(r *rand.Rand, min, max int) string {
	runes := []rune(secretAlphabet)
	for {
		var b strings.Builder
		n := min + r.Intn(max-min+1)
		for b.Len() < n {
			b.WriteRune(runes[r.Intn(len(runes))])
		}
		if s := b.String(); len(s) >= min && len(s) <= max+4 {
			return s
		}
	}
}

// containsAnyForm 判断文本里有没有机密的任一形态（原文 / 查询串编码 / 路径编码 / HTML 转义）。
func containsAnyForm(text string, secrets ...string) string {
	for _, form := range secretForms(secrets) {
		if strings.Contains(text, form) {
			return form
		}
	}
	return ""
}

// TestPropertyParseJSONPNeverPanicsAndRoundTrips 性质：任意字节串都不 panic；
// 合法 JSONP「回调名(任意内容)」剥壳后原样得到括号里的内容，哪怕内容里自己带括号或前后有空白。
func TestPropertyParseJSONPNeverPanicsAndRoundTrips(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		garbage := randomBinary(r, 0, 200)
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					t.Fatalf("第 %d 例：parseJSONP(%q) panic: %v", i, garbage, rec)
				}
			}()
			_, _ = parseJSONP([]byte(garbage), randomSecret(r, 0, 12))
		}()

		inner := randomBinary(r, 0, 120)
		callback := []string{"_", "dr1003", "jsonp", "cb_1", "callback"}[r.Intn(5)]
		lead := strings.Repeat(" ", r.Intn(3)) + strings.Repeat("\n", r.Intn(2))
		tail := strings.Repeat("\t", r.Intn(2)) + strings.Repeat("\r\n", r.Intn(2))
		got, err := parseJSONP([]byte(lead + callback + "(" + inner + ")" + tail))
		if err != nil {
			t.Fatalf("第 %d 例：合法 JSONP 被拒：%v", i, err)
		}
		if string(got) != inner {
			t.Fatalf("第 %d 例：剥壳结果不是括号里的原文\n期望 %q\n实际 %q", i, inner, got)
		}
	}
}

// TestPropertyNonJSONPErrorWithholdsEveryKnownForm 性质：正文不是 JSONP 时，错误里带的正文
// 只要出现过机密的任一形态（原文 / 查询串编码 / 路径编码 / HTML 转义），就整段隐去；
// 机密不论长短（哪怕 1 个字节）、不论落在 160 字节截断线哪一侧，错误文本里都找不到任一形态。
func TestPropertyNonJSONPErrorWithholdsEveryKnownForm(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		secret := randomSecret(r, 1, 20)
		forms := secretForms([]string{secret})
		form := forms[r.Intn(len(forms))]
		body := randomCJK(r, 0, 220) + form + randomCJK(r, 0, 40)
		_, err := parseJSONP([]byte(body), secret)
		if err == nil {
			t.Fatalf("第 %d 例：没有括号的正文应报「不是 JSONP」", i)
		}
		// 机密可能只是一个标点（比如 ":"），固定文案里本来就有冒号，所以不能只查「文本里有没有
		// 机密」，而要查「正文那一截是不是被整段换成了说明」。
		if err.Error() != "响应不是预期的 JSONP 格式: "+withheldBody {
			t.Fatalf("第 %d 例：出现机密 %q 时应整段隐去，实际 %s", i, secret, err)
		}
		// 对照：正文里没有机密时要原样带出，排查靠它。空格也是合法密码字符，所以先确认
		// 随机正文里确实没有机密的任何形态。
		clean := randomCJK(r, 1, 100)
		if containsAnyForm(clean, secret) != "" {
			continue
		}
		if _, err = parseJSONP([]byte(clean), secret); err == nil || !strings.Contains(err.Error(), truncate(clean, 160)) {
			t.Fatalf("第 %d 例：无机密正文应原样带出：%v", i, err)
		}
	}
}

// TestWithholdSecretsCatchesDoubleEncodedEcho 修复前失败。
//
// 性质：withholdSecrets 的注释承诺「只要出现了机密（不论长短、不论哪种编码），整段都不给出」。
// 劫持页 / 透明代理最常见的写法是把原始请求地址再编码一次塞进跳转参数：
//
//	<a href="http://hijack/?url=http%3A%2F%2F172.30.255.42%2F...%3Fuser_password%3Da%2526b">
//
// 这里 user_password 的值 a&b 变成了 a%2526b（二次查询串编码）。secretForms 只列了原文、
// 一次查询串编码、路径编码和 HTML 转义，二次编码认不出，正文原样放行；看到 %2526 的人手动
// 解一次就是密码。密码只含 [A-Za-z0-9-_.~] 时二次编码等于原文、能被认出；只要密码里有空格、
// &、+、%、中文等任一字符就漏。
//
// 现状里 parseJSONP 的错误正文截到 160 字节、Dr.COM 的完整请求地址二次编码后超过 200 字节，
// 所以这条路暂时被截断挡住；但 Result.Raw 的窗口是 400 / 2000 字节，Message 不截断，
// 而且截断只是巧合，不是设计出来的防线。
func TestWithholdSecretsCatchesDoubleEncodedEcho(t *testing.T) {
	r := propertyRand(t)
	checked := 0
	for i := 0; i < propertyCases; i++ {
		secret := randomSecret(r, 1, 20)
		if url.QueryEscape(secret) == secret {
			continue // 一次编码等于原文，二次编码也等于原文，这类密码本来就能认出
		}
		checked++
		body := `<a href="http://hijack.example/?url=` + url.QueryEscape("/login?user_password="+url.QueryEscape(secret)) + `">继续</a>`
		if got := withholdSecrets(body, secret); got != withheldBody {
			t.Fatalf("第 %d 例：密码 %q 二次 URL 编码后出现在正文里，却没有整段隐去：%s", i, secret, got)
		}
	}
	if checked < propertyCases/2 {
		t.Fatalf("含特殊字符的密码太少（%d 例），性质没有充分检验", checked)
	}
}

// TestPropertyScrubSecretsHidesLongFormsAndKeepsChain 性质：机密 ≥ 6 字节时，错误文本里出现
// 它的任一形态都换成 ***，错误链不断（errors.As / errors.Is 仍成立）；机密 < 6 字节或文本里
// 没有机密时原样返回同一个 error 值（短密码做替换会把位置暴露出来，见 minScrubLen）。
func TestPropertyScrubSecretsHidesLongFormsAndKeepsChain(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		secret := randomSecret(r, 6, 24)
		forms := secretForms([]string{secret})
		form := forms[r.Intn(len(forms))]
		base := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New(randomCJK(r, 0, 20) + form + randomCJK(r, 0, 20))}
		wrapped := fmt.Errorf("发送登录请求失败: %w", base)
		got := scrubSecrets(wrapped, secret)
		if hit := containsAnyForm(got.Error(), secret); hit != "" {
			t.Fatalf("第 %d 例：抹掉机密后仍能看到 %q：%s", i, hit, got)
		}
		if !strings.Contains(got.Error(), "***") || !strings.Contains(got.Error(), "发送登录请求失败") {
			t.Fatalf("第 %d 例：替换结果不对：%s", i, got)
		}
		var opErr *net.OpError
		if !errors.As(got, &opErr) || !errors.Is(got, base) {
			t.Fatalf("第 %d 例：抹掉机密后错误链断了：%T", i, got)
		}

		// 没命中时必须返回原 error 值，调用方比较指针也能成立。
		harmless := fmt.Errorf("x: %w", base)
		if other := randomCJK(r, 6, 10); containsAnyForm(harmless.Error(), other) == "" && scrubSecrets(harmless, other) != harmless {
			t.Fatalf("第 %d 例：没有机密时应原样返回", i)
		}
		short := randomSecret(r, 1, 5)
		if len(short) < minScrubLen {
			e := errors.New("dial " + short + " refused")
			if scrubSecrets(e, short) != e {
				t.Fatalf("第 %d 例：短机密 %q 不该被替换", i, short)
			}
		}
	}
	if scrubSecrets(nil, "whatever") != nil {
		t.Fatal("nil 进 nil 出")
	}
}

// TestPropertyRedactURLKeepsOnlySchemeHostPath 性质：任意由 scheme/host/path/userinfo/query/
// fragment 拼出来的地址，去敏后只剩 scheme://host/path，且再去敏一次结果不变（幂等）。
func TestPropertyRedactURLKeepsOnlySchemeHostPath(t *testing.T) {
	r := propertyRand(t)
	hosts := []string{"172.30.255.42", "net.szu.edu.cn", "127.0.0.1:8080", "[::1]:443", "portal.example"}
	for i := 0; i < propertyCases; i++ {
		u := url.URL{Scheme: []string{"http", "https"}[r.Intn(2)], Host: hosts[r.Intn(len(hosts))]}
		if r.Intn(2) == 0 {
			u.Path = "/" + url.PathEscape(randomSecret(r, 0, 12)) + "/" + randomCJK(r, 0, 4)
		}
		if r.Intn(2) == 0 {
			u.User = url.UserPassword(randomSecret(r, 1, 8), randomSecret(r, 1, 8))
		}
		if r.Intn(3) != 0 {
			q := url.Values{}
			q.Set("user_password", randomSecret(r, 1, 16))
			q.Set("x", randomSecret(r, 0, 5))
			u.RawQuery = q.Encode()
		}
		if r.Intn(2) == 0 {
			u.Fragment = randomSecret(r, 0, 8)
		}
		want := (&url.URL{Scheme: u.Scheme, Host: u.Host, Path: u.Path}).String()
		got := redactURL(u.String())
		if got != want {
			t.Fatalf("第 %d 例：redactURL(%q) = %q，期望 %q", i, u.String(), got, want)
		}
		// 路径段里允许出现 "@"，所以用户信息要按解析结果判断，不能只查字符。
		if back, err := url.Parse(got); strings.ContainsAny(got, "?#") || err != nil || back.User != nil {
			t.Fatalf("第 %d 例：去敏后仍有查询串 / 片段 / 用户信息：%q", i, got)
		}
		if redactURL(got) != got {
			t.Fatalf("第 %d 例：redactURL 不幂等：%q → %q", i, got, redactURL(got))
		}
	}
}

// TestPropertyRedactRequestErrorKeepsChainDropsQuery 性质：对 http.Client 风格的 *url.Error，
// 去敏后仍是 *url.Error、Op 不变、URL 去掉查询串，底层 net 错误（超时 / 拒绝连接 / DNS）
// 原样保留，errors.Is / errors.As 都成立，错误文本里没有 "?"。不是 *url.Error 的原样返回。
func TestPropertyRedactRequestErrorKeepsChainDropsQuery(t *testing.T) {
	r := propertyRand(t)
	inners := func() error {
		switch r.Intn(5) {
		case 0:
			return &net.OpError{Op: "dial", Net: "tcp", Err: os.ErrDeadlineExceeded}
		case 1:
			return &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
		case 2:
			return &net.DNSError{Err: "no such host", Name: "net.szu.edu.cn", IsNotFound: true}
		case 3:
			return context.DeadlineExceeded
		default:
			return io.EOF
		}
	}
	for i := 0; i < propertyCases; i++ {
		inner := inners()
		full := DefaultDrcomHost + "/eportal/portal/login?user_password=" + url.QueryEscape(randomSecret(r, 1, 16)) + "&x=1"
		ue := &url.Error{Op: []string{"Get", "Post"}[r.Intn(2)], URL: full, Err: inner}
		got := redactRequestError(ue)
		var back *url.Error
		if !errors.As(got, &back) || back.Op != ue.Op || back.URL != redactURL(full) {
			t.Fatalf("第 %d 例：去敏后的 *url.Error 不对：%#v", i, got)
		}
		if !errors.Is(got, inner) {
			t.Fatalf("第 %d 例：底层错误 %v 从链上丢了", i, inner)
		}
		if strings.Contains(got.Error(), "?") || strings.Contains(got.Error(), "user_password") {
			t.Fatalf("第 %d 例：错误文本仍带查询串：%s", i, got)
		}
		var netErr net.Error
		if errors.As(inner, &netErr) && netErr.Timeout() {
			var after net.Error
			if !errors.As(got, &after) || !after.Timeout() {
				t.Fatalf("第 %d 例：超时类别丢了：%v", i, got)
			}
		}
		if plain := errors.New("plain " + randomCJK(r, 1, 5)); redactRequestError(plain) != plain {
			t.Fatalf("第 %d 例：非 *url.Error 应原样返回", i)
		}
	}
}

// TestMalformedLocationEchoDoesNotLeakQuery 修复前失败。
//
// 性质：门户请求失败时，错误文本里不能出现请求的查询串（账号、密码）。redactRequestError
// 只改写 *url.Error 的 URL 字段，但 net/http 跟随跳转时若 Location 头解析不了，会把 Location
// 原文写进 ue.Err：`failed to parse Location header "10.0.0.1:8080/portal?url=...user_password=..."`。
// 网关 / 劫持设备把原始请求地址回填进跳转地址是常见做法，而少写 scheme 只剩 host:port 的
// Location（url.Parse 报 first path segment cannot contain colon）也不少见。于是账号 %2C0%2C654321、
// 查询串结构、以及短于 minScrubLen 的明文密码都原样进了错误文本（命令行版会打到终端上）。
func TestMalformedLocationEchoDoesNotLeakQuery(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// 少了 scheme 的 host:port 跳转地址，还把原始查询串回填进去。
		w.Header().Set("Location", "10.0.0.1:8080/portal?url="+req.URL.Path+"?"+req.URL.RawQuery)
		w.WriteHeader(http.StatusFound)
	}))
	defer srv.Close()

	const username = "654321"
	// "abc" 连编码形态都短于 minScrubLen，兜底替换不会碰它，密码值本身也会漏；
	// "ab&c" 编码后 ab%26c 恰好 6 字节、能被抹成 ***，但账号和查询串结构照样漏；长密码同理。
	for i, password := range []string{"abc", "ab&c", "S3cr3t-Pass&中文"} {
		_, err := NewDrcomClient(srv.URL, username, password).Login()
		if err == nil {
			t.Fatalf("第 %d 例：跳转地址解析不了时应报错", i)
		}
		text := err.Error()
		var leaks []string
		if strings.Contains(text, "user_password") || strings.Contains(text, "user_account") {
			leaks = append(leaks, "查询串参数名")
		}
		if strings.Contains(text, username) {
			leaks = append(leaks, "账号 "+username)
		}
		if hit := containsAnyForm(text, password); hit != "" {
			leaks = append(leaks, fmt.Sprintf("密码形态 %q", hit))
		}
		if len(leaks) > 0 {
			t.Fatalf("第 %d 例（密码 %q）：错误文本漏出了 %s：%s", i, password, strings.Join(leaks, "、"), text)
		}
	}
}

// TestPropertyAcIDFromURLReturnsDigitsOrNothing 性质：任意字符串都不 panic，返回值要么是空串、
// 要么全是 ASCII 数字；对构造出的查询串，返回的是按 ac_id → acid → wlanacname → nasid 顺序
// 第一个「非空且全数字」的值，值不是数字的别名会被跳过而不是让整个解析失败。
func TestPropertyAcIDFromURLReturnsDigitsOrNothing(t *testing.T) {
	r := propertyRand(t)
	aliases := []string{"ac_id", "acid", "wlanacname", "nasid"}
	digits := func() string { return strconv.Itoa(r.Intn(100000)) }
	for i := 0; i < propertyCases; i++ {
		garbage := randomBinary(r, 0, 80)
		got := acIDFromURL(garbage)
		if got != "" && !isAllDigits(got) {
			t.Fatalf("第 %d 例：acIDFromURL(%q) = %q 不是纯数字", i, garbage, got)
		}

		q := url.Values{}
		want := ""
		for _, key := range aliases {
			switch r.Intn(4) {
			case 0: // 不给这个键
			case 1: // 数字
				v := digits()
				q.Set(key, v)
				if want == "" {
					want = v
				}
			case 2: // 非数字，应跳过
				q.Set(key, []string{"abc", "12a", "１２", "-1", "1.5", " 12", ""}[r.Intn(7)])
			case 3: // 混着别的参数
				q.Set("theme", "proyx")
			}
		}
		q.Set("wlanuserip", "10.0."+digits()+".1")
		raw := "https://net.szu.edu.cn/srun_portal_pc?" + q.Encode()
		if got := acIDFromURL(raw); got != want {
			t.Fatalf("第 %d 例：acIDFromURL(%q) = %q，期望 %q", i, raw, got, want)
		}
	}
}

// TestPropertyAcIDFromLocationAndInterceptPage 性质：相对 / 绝对 Location 补全后都能读出同一个
// ac_id；拦截页里 meta refresh 与几种 JS 跳转写法、单双引号，都能读出跳转地址里的 ac_id；
// 没有 ac_id 的跳转一律返回空串。
func TestPropertyAcIDFromLocationAndInterceptPage(t *testing.T) {
	r := propertyRand(t)
	c := newSrunClient("", "u", "p")
	for i := 0; i < propertyCases; i++ {
		id := strconv.Itoa(1 + r.Intn(9999))
		target := "/srun_portal_pc?ac_id=" + id + "&theme=proyx"
		probe := []string{"http://connect.rom.miui.com/generate_204", "http://www.msftconnecttest.com/redirect", "http://captive.apple.com/hotspot-detect.html"}[r.Intn(3)]
		absolute := "https://net.szu.edu.cn" + target
		for _, loc := range []string{absolute, "//net.szu.edu.cn" + target} {
			if got := c.acIDFromLocation(probe, loc); got != id {
				t.Fatalf("第 %d 例：Location %q 应读出 %s，实际 %q", i, loc, id, got)
			}
		}
		for _, loc := range []string{target, strings.TrimPrefix(target, "/")} {
			if got := c.acIDFromLocation(c.Host+"/x", loc); got != id {
				t.Fatalf("第 %d 例：门户相对跳转应读出 %s，实际 %q", i, id, got)
			}
			if got := c.acIDFromLocation(probe, loc); got != "" {
				t.Fatalf("第 %d 例：外网相对跳转不应作为可信接入点 %q", i, got)
			}
		}
		if got := c.acIDFromLocation(probe, ""); got != "" {
			t.Fatalf("第 %d 例：空 Location 应返回空串，实际 %q", i, got)
		}
		if got := c.acIDFromLocation(probe, "https://net.szu.edu.cn/login?theme=proyx"); got != "" {
			t.Fatalf("第 %d 例：没有 ac_id 的跳转应返回空串，实际 %q", i, got)
		}

		quote := []string{`"`, `'`}[r.Intn(2)]
		pages := []string{
			`<meta http-equiv=` + quote + `refresh` + quote + ` content=` + quote + `0;url=` + absolute + quote + `>`,
			`<META HTTP-EQUIV="Refresh" CONTENT="1; URL=` + absolute + `">`,
			`<script>window.location.href = ` + quote + absolute + quote + `;</script>`,
			`<script>location.replace(` + quote + absolute + quote + `)</script>`,
			`<script>top.location.assign( ` + quote + absolute + quote + ` )</script>`,
		}
		page := randomCJK(r, 0, 30) + pages[r.Intn(len(pages))] + randomCJK(r, 0, 30)
		if got := c.acIDFromInterceptPage(probe, page); got != id {
			t.Fatalf("第 %d 例：拦截页应读出 %s，实际 %q\n%s", i, id, got, page)
		}
		if got := c.acIDFromInterceptPage(probe, randomCJK(r, 0, 60)); got != "" {
			t.Fatalf("第 %d 例：普通页面不该读出 ac_id，实际 %q", i, got)
		}
	}
}

// srunVocabulary 是服务端几个文本字段里可能出现的词：既有各类失败标记，也有成功 / 在线提示。
// 校验和错误只放 srunRejectMarkers 认得的两种拼法，别的拼法见 TestSrunSignErrorSpellingsAreRejected。
var srunVocabulary = []string{
	"", "ok", "login_ok", "E0000: Login is successful.", "already_online", "ip_already_online_error", "not_online",
	"E2616: Unknow ac-type", "ac_id error", "auth_info_error", "auth_info mismatch", "sign_error", "Sign Error!",
	"ldap auth error", "Rad:userid error", "decrypt error", "challenge_expire", "bad_request_parameters",
	"login_error", "E2553: Password is error", "SIGN_ERROR",
}

// srunKnownFailure 判断 friendlySrunError 是否把响应认成了某一类失败：
// 不是成功、不是在线提示、也不是兜底的「认证失败：<error> <error_msg>」。
func srunKnownFailure(resp srunPortalResp) (string, bool) {
	msg := friendlySrunError(resp)
	fallback := fmt.Sprintf("认证失败：%s %s", resp.Error, resp.ErrorMsg)
	return msg, msg != fallback && !strings.Contains(msg, "在线")
}

// TestPropertySrunRejectionClassifiersAgree 性质：error=ok 的响应，只要 friendlySrunError 认定它是
// 某一类失败（不是成功、不是在线提示、不是兜底文案），srunLoginRejected 就必须判为「没登上」——
// 否则 Login 会把它报成「认证成功」。反过来，srunAcIDRejected 判为 ac_id 不对的，
// srunLoginRejected 也必须判为失败（不然 Login 连缓存重试都走不到）。
func TestPropertySrunRejectionClassifiersAgree(t *testing.T) {
	r := propertyRand(t)
	pick := func() string { return srunVocabulary[r.Intn(len(srunVocabulary))] }
	for i := 0; i < propertyCases; i++ {
		resp := srunPortalResp{Error: "ok", ErrorMsg: pick(), Res: pick(), SucMsg: pick()}
		if msg, knownFailure := srunKnownFailure(resp); knownFailure && !srunLoginRejected(resp) {
			t.Fatalf("第 %d 例：friendlySrunError 判为失败「%s」，srunLoginRejected 却放行，响应 %+v", i, msg, resp)
		}
		if srunAcIDRejected(resp) && !srunLoginRejected(resp) {
			t.Fatalf("第 %d 例：判为 ac_id 不对却没判为失败：%+v", i, resp)
		}
		// 干净的成功响应绝不能被判成失败。
		clean := srunPortalResp{Error: "ok", ErrorMsg: "", Res: "ok", SucMsg: []string{"login_ok", "already_online", ""}[r.Intn(3)]}
		if srunLoginRejected(clean) || srunAcIDRejected(clean) {
			t.Fatalf("第 %d 例：成功响应被判成失败：%+v", i, clean)
		}
	}
}

// TestSrunSignErrorSpellingsAreRejected 修复前失败。
//
// friendlySrunError 认 "sign" 这个词（"sign-error"、"signature mismatch" 都翻成「校验和不对」），
// srunRejectMarkers 却只认 "sign_error" / "sign error" 两种拼法；两处注释都说彼此一一对应。
// 服务端 error=ok、res 里写成别的拼法时，loginOnce 走到成功分支：界面显示「认证成功」、
// 命令行退出码 0，这次用的 ac_id 还会通过 OnAcIDResolved 写进缓存。
func TestSrunSignErrorSpellingsAreRejected(t *testing.T) {
	for _, spelling := range []string{"sign-error", "signature mismatch", "E2606: sign  error", "signerror"} {
		resp := srunPortalResp{Error: "ok", Res: spelling, SucMsg: "ok"}
		msg, knownFailure := srunKnownFailure(resp)
		if !knownFailure {
			t.Fatalf("%q：friendlySrunError 没有认成校验和错误：%s", spelling, msg)
		}
		if !srunLoginRejected(resp) {
			t.Fatalf("%q：friendlySrunError 判为「%s」，srunLoginRejected 却放行，Login 会报成功", spelling, msg)
		}
	}
}

// TestPropertyConcludeProbeConsistent 性质：对任意探测字段组合，concludeProbe 定出的区域与
// PredictDropZone 一致（未联网时），联网时恒为 online；AuthenticationZone 在探测过时只按指纹给
// 教学区 / 宿舍区，从不因为「能上外网」就认定已认证；DNS 不通时 Notes 里一定有提醒。
func TestPropertyConcludeProbeConsistent(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		in := DetectResult{
			InternetOK: r.Intn(2) == 0, SrunDNSOK: r.Intn(2) == 0, Probed: true,
			DormPortalOK: r.Intn(2) == 0, TeachPortalOK: r.Intn(2) == 0,
			SrunUsable: r.Intn(2) == 0, DormUsable: r.Intn(2) == 0,
		}
		res := in
		concludeProbe(&res)
		predicted, reason := PredictDropZone(&in)
		if reason == "" {
			t.Fatalf("第 %d 例：预判没有给出依据：%+v", i, in)
		}
		switch {
		case in.InternetOK && res.Zone != ZoneOnline:
			t.Fatalf("第 %d 例：能上外网却判成 %s", i, res.Zone)
		case !in.InternetOK && res.Zone != predicted:
			t.Fatalf("第 %d 例：classify 给 %s，PredictDropZone 给 %s：%+v", i, res.Zone, predicted, in)
		}
		if (predicted == ZoneTeaching) != (in.SrunUsable && !in.DormUsable) {
			t.Fatalf("第 %d 例：教学区判据不符合约定：%+v → %s", i, in, predicted)
		}
		if in.DormUsable && predicted != ZoneDorm {
			t.Fatalf("第 %d 例：有 ePortal 指纹就该按宿舍区：%+v → %s", i, in, predicted)
		}
		auth := res.AuthenticationZone()
		switch {
		case in.DormUsable && auth != ZoneDorm, !in.DormUsable && in.SrunUsable && auth != ZoneTeaching:
			t.Fatalf("第 %d 例：AuthenticationZone 与指纹不一致：%+v → %s", i, in, auth)
		case !in.DormUsable && !in.SrunUsable && auth != ZoneUnknown:
			t.Fatalf("第 %d 例：没有协议指纹，不能仅凭页面可达选择认证协议：%+v → %s", i, in, auth)
		}
		if hasDNS := strings.Contains(strings.Join(res.Notes, "\n"), dnsWarning); hasDNS == in.SrunDNSOK {
			t.Fatalf("第 %d 例：DNS 提醒与 SrunDNSOK=%v 不符：%v", i, in.SrunDNSOK, res.Notes)
		}
		if len(res.Notes) == 0 {
			t.Fatalf("第 %d 例：Notes 不该为空", i)
		}
	}
	if zone, _ := PredictDropZone(nil); zone != ZoneOutside {
		t.Fatal("nil 结果应判为校外")
	}
	if (*DetectResult)(nil).AuthenticationZone() != ZoneUnknown {
		t.Fatal("nil 结果的认证区域应为未知")
	}
}

// TestPropertyRawToStringUnifiesNumbersAndStrings 性质：ePortal 的 result 字段无论是 JSON 数字
// 还是 JSON 字符串（前后可带空白），rawToString 都给出同一个字符串。
func TestPropertyRawToStringUnifiesNumbersAndStrings(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(2000) - 1000
		want := strconv.Itoa(n)
		asNumber, _ := json.Marshal(n)
		asString, _ := json.Marshal(want)
		pad := strings.Repeat(" ", r.Intn(3))
		for _, raw := range [][]byte{asNumber, asString, []byte(pad + string(asNumber) + pad), []byte(pad + string(asString) + pad)} {
			if got := rawToString(json.RawMessage(raw)); got != want {
				t.Fatalf("第 %d 例：rawToString(%s) = %q，期望 %q", i, raw, got, want)
			}
		}
		word := randomCJK(r, 0, 6)
		asWord, _ := json.Marshal(word)
		if got := rawToString(json.RawMessage(asWord)); got != word {
			t.Fatalf("第 %d 例：rawToString(%s) = %q，期望 %q", i, asWord, got, word)
		}
	}
	if rawToString(nil) != "" || rawToString(json.RawMessage("null")) != "null" {
		t.Fatal("空 / null 的处理变了")
	}
}

// TestPropertyParseOnlineDevicesSortedAndComplete 性质：online_device_detail 里每台设备都出现
// 一次，顺序按 rad_online_id 字典序稳定；描述优先 os_name，其次 class_name，都没有写「未知设备」；
// 有 IP 的带 IP。解析不了的文本返回 nil，不影响在线判断。
func TestPropertyParseOnlineDevicesSortedAndComplete(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(6)
		raw := map[string]map[string]string{}
		ids := make([]string, 0, n)
		for len(raw) < n {
			id := strconv.Itoa(100000000 + r.Intn(900000000))
			if _, dup := raw[id]; dup {
				continue
			}
			d := map[string]string{}
			if r.Intn(2) == 0 {
				d["os_name"] = "系统" + randomCJK(r, 1, 3)
			}
			if r.Intn(2) == 0 {
				d["class_name"] = "Class" + strconv.Itoa(r.Intn(9))
			}
			if r.Intn(2) == 0 {
				d["ip"] = fmt.Sprintf("10.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256))
			}
			raw[id] = d
			ids = append(ids, id)
		}
		detail, _ := json.Marshal(raw)
		got := parseOnlineDevices(string(detail))
		if n == 0 {
			if len(got) != 0 {
				t.Fatalf("第 %d 例：空表应返回空，实际 %v", i, got)
			}
			continue
		}
		if len(got) != n {
			t.Fatalf("第 %d 例：%d 台设备解出 %d 条：%v", i, n, len(got), got)
		}
		sortedIDs := append([]string(nil), ids...)
		for a := range sortedIDs {
			for b := a + 1; b < len(sortedIDs); b++ {
				if sortedIDs[b] < sortedIDs[a] {
					sortedIDs[a], sortedIDs[b] = sortedIDs[b], sortedIDs[a]
				}
			}
		}
		for j, id := range sortedIDs {
			d := raw[id]
			want := d["os_name"]
			if want == "" {
				want = d["class_name"]
			}
			if want == "" {
				want = "未知设备"
			}
			if d["ip"] != "" {
				want += " · " + d["ip"]
			}
			if got[j] != want {
				t.Fatalf("第 %d 例：第 %d 台设备描述 %q，期望 %q", i, j, got[j], want)
			}
		}
		if parseOnlineDevices(randomCJK(r, 1, 10)) != nil {
			t.Fatalf("第 %d 例：解析不了的文本应返回 nil", i)
		}
		count := r.Intn(20) - 5
		if got := parseOnlineDeviceCount(" " + strconv.Itoa(count) + " "); (count < 0 && got != 0) || (count >= 0 && got != count) {
			t.Fatalf("第 %d 例：parseOnlineDeviceCount(%d) = %d", i, count, got)
		}
	}
}

// TestPropertyWithholdSecretsHTMLEscapedForms 性质：正文里的机密即便被 HTML 转义（&amp; &lt; &#34;
// 等，html.EscapeString 的输出形态）也要被认出并整段隐去。
func TestPropertyWithholdSecretsHTMLEscapedForms(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		secret := randomSecret(r, 1, 16)
		body := "<p>" + randomCJK(r, 0, 20) + html.EscapeString(secret) + "</p>"
		if withholdSecrets(body, secret) != withheldBody {
			t.Fatalf("第 %d 例：HTML 转义后的机密 %q 没被认出：%s", i, secret, body)
		}
		// 对照：正文里确实没有机密任何形态时不能误隐去（空格也是合法密码字符，所以要先查）。
		if clean := randomCJK(r, 1, 30); containsAnyForm(clean, secret) == "" && withholdSecrets(clean, secret) != clean {
			t.Fatalf("第 %d 例：没有机密的正文被误隐去", i)
		}
	}
}
