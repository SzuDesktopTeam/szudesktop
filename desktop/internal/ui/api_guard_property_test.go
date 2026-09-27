package ui

import (
	"encoding/hex"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// randomLoopbackHost 生成各种写法的回环 Host：127.x.y.z、IPv6 ::1 的几种写法、大小写混合的
// localhost，带或不带端口。
func randomLoopbackHost(r *rand.Rand) string {
	port := ":" + fmt.Sprint(1+r.Intn(65535))
	v4 := fmt.Sprintf("127.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256))
	v6 := []string{"::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "0000:0000:0000:0000:0000:0000:0000:0001"}[r.Intn(4)]
	name := ""
	for _, c := range "localhost" {
		if r.Intn(2) == 0 {
			name += strings.ToUpper(string(c))
		} else {
			name += string(c)
		}
	}
	switch r.Intn(7) {
	case 0:
		return v4
	case 1:
		return v4 + port
	case 2:
		return "[" + v6 + "]" + port
	case 3:
		return "[" + v6 + "]"
	case 4:
		return v6
	case 5:
		return name
	default:
		return name + port
	}
}

// randomForeignHost 生成不是回环的 Host：内网 / 公网 IP、域名、把回环地址藏在子域里的 DNS 重绑定写法。
func randomForeignHost(r *rand.Rand) string {
	port := ":" + fmt.Sprint(1+r.Intn(65535))
	choices := []string{
		fmt.Sprintf("10.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256)),
		fmt.Sprintf("192.168.%d.%d", r.Intn(256), r.Intn(256)),
		fmt.Sprintf("128.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256)),
		"example.com", "127.0.0.1.evil.example", "localhost.evil.example", "evil-localhost", "[fe80::1]", "0.0.0.0", "",
		"127.0.0.1" + port + ":1", "localhost" + port + port,
	}
	host := choices[r.Intn(len(choices))]
	if r.Intn(2) == 0 && !strings.Contains(host, ":") && host != "" {
		host += port
	}
	return host
}

// TestPropertyLoopbackHostAcceptsExactlyLoopback 性质：任意 Host 字符串都不 panic；所有写法的回环
// 地址（带不带端口、带不带方括号、localhost 任意大小写）都接受；非回环 IP、域名、
// 把 127.0.0.1 / localhost 藏在子域里的重绑定写法、畸形的多端口写法一律拒绝。
func TestPropertyLoopbackHostAcceptsExactlyLoopback(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		garbage := randomBinary(r, 0, 40)
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					t.Fatalf("第 %d 例：loopbackHost(%q) panic: %v", i, garbage, rec)
				}
			}()
			if loopbackHost(garbage) {
				// 接受了就必须真是回环：去掉端口和方括号后是 localhost 或回环 IP。
				core := garbage
				if h, _, err := net.SplitHostPort(core); err == nil {
					core = h
				}
				core = strings.Trim(core, "[]")
				if ip := net.ParseIP(core); !strings.EqualFold(core, "localhost") && (ip == nil || !ip.IsLoopback()) {
					t.Fatalf("第 %d 例：接受了非回环 Host %q", i, garbage)
				}
			}
		}()
		if host := randomLoopbackHost(r); !loopbackHost(host) {
			t.Fatalf("第 %d 例：回环 Host %q 被拒", i, host)
		}
		if host := randomForeignHost(r); loopbackHost(host) {
			t.Fatalf("第 %d 例：非回环 Host %q 被接受", i, host)
		}
	}
}

// TestPropertyGuardAPIOriginMustMatchHost 性质：guardAPI 只放行「没有 Origin」或「Origin 恰为
// http://<Host>（大小写不敏感）」的请求；换 scheme、换端口、带路径、带用户信息、opaque 的
// "null"、别的站点一律 403；Sec-Fetch-Site 只认 same-origin / none / 空；Host 不是回环一律 403。
func TestPropertyGuardAPIOriginMustMatchHost(t *testing.T) {
	r := propertyRand(t)
	handler := guardAPI(nil, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }, http.MethodGet)
	for i := 0; i < propertyCases; i++ {
		// 真实请求的 Host 总是「地址:端口」，IPv6 一定带方括号（裸 IPv6 拼不进请求地址）。
		host := []string{"127.0.0.1", fmt.Sprintf("127.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256)), "[::1]", "localhost", "LocalHost"}[r.Intn(5)] + ":" + fmt.Sprint(1+r.Intn(65535))
		mixed := ""
		for _, c := range host {
			if r.Intn(2) == 0 {
				mixed += strings.ToUpper(string(c))
			} else {
				mixed += strings.ToLower(string(c))
			}
		}
		otherPort := host[:strings.LastIndex(host, ":")] + ":" + fmt.Sprint(1+r.Intn(65535))
		origins := []struct {
			origin string
			accept bool
		}{
			{"", true}, {"http://" + host, true}, {"http://" + mixed, true},
			{"https://" + host, false}, {"http://" + otherPort, otherPort == host}, {"http://" + host + "/", false},
			{"http://" + host + "/api", false}, {"http://u@" + host, false}, {"null", false}, {"http://evil.example", false},
			{"http:" + host, false}, {" http://" + host, false}, {"http://" + randomForeignHost(r), false},
		}
		o := origins[r.Intn(len(origins))]
		site := []string{"", "same-origin", "none", "cross-site", "same-site"}[r.Intn(5)]
		siteOK := site == "" || site == "same-origin" || site == "none"
		foreign := r.Intn(6) == 0

		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/api/status", nil)
		if foreign {
			req.Host = randomForeignHost(r)
		}
		if o.origin != "" {
			req.Header.Set("Origin", o.origin)
		}
		if site != "" {
			req.Header.Set("Sec-Fetch-Site", site)
		}
		w := httptest.NewRecorder()
		handler(w, req)
		want := http.StatusOK
		if foreign || !siteOK || !o.accept {
			want = http.StatusForbidden
		}
		if w.Code != want {
			t.Fatalf("第 %d 例：Host=%q Origin=%q Sec-Fetch-Site=%q 得到 %d，期望 %d：%s", i, req.Host, o.origin, site, w.Code, want, w.Body.String())
		}
		if w.Code != http.StatusOK {
			assertAPIError(t, w)
		}
	}
}

// TestPropertyAPITokenValidityAndMatching 性质：validAPIToken 恰好接受 64 位小写十六进制；
// tokenMatches 只在 want 合法且 got 与之逐字节相同时为真；newAPIToken 每次都合法且两两不同。
func TestPropertyAPITokenValidityAndMatching(t *testing.T) {
	r := propertyRand(t)
	seen := map[string]bool{}
	for i := 0; i < propertyCases; i++ {
		token := newAPIToken()
		if !validAPIToken(token) || seen[token] {
			t.Fatalf("第 %d 例：newAPIToken 给出非法或重复凭据 %q", i, token)
		}
		seen[token] = true
		if !tokenMatches(token, token) {
			t.Fatalf("第 %d 例：合法凭据与自己不匹配", i)
		}

		// 从合法凭据出发做一处改动：大写、换非十六进制字符、增删一位，都必须失效。
		b := []byte(token)
		switch r.Intn(4) {
		case 0:
			b[r.Intn(len(b))] = "ABCDEF"[r.Intn(6)]
		case 1:
			b[r.Intn(len(b))] = "ghijklmnopqrstuvwxyzGZ!-_ /"[r.Intn(27)]
		case 2:
			b = b[:len(b)-1]
		default:
			b = append(b, '0')
		}
		mutated := string(b)
		if validAPIToken(mutated) {
			t.Fatalf("第 %d 例：改动后的凭据 %q 仍被认为合法", i, mutated)
		}
		if tokenMatches(mutated, token) || tokenMatches(token, mutated) || tokenMatches(mutated, mutated) {
			t.Fatalf("第 %d 例：非法或不同的凭据被判为匹配：%q vs %q", i, mutated, token)
		}
		// 任意 32 字节的小写十六进制都合法。
		raw := make([]byte, apiTokenBytes)
		r.Read(raw)
		if !validAPIToken(hex.EncodeToString(raw)) {
			t.Fatalf("第 %d 例：随机 32 字节的十六进制应合法", i)
		}
		if garbage := randomBinary(r, 0, 80); validAPIToken(garbage) && (len(garbage) != 64 || strings.Trim(garbage, "0123456789abcdef") != "") {
			t.Fatalf("第 %d 例：接受了非法凭据 %q", i, garbage)
		}
	}
}

// bareLoopbackOrigin 判断一个地址是不是「http://<回环 IP>:<端口>」且不带任何多余部分：
// 这是 activateInstance 注释里要求的形状——之后要在它后面直接拼 /api/instance。
// scheme 按 RFC 3986 大小写不敏感，HTTP:// 也算。
func bareLoopbackOrigin(raw string) bool {
	if len(raw) < len("http://") || !strings.EqualFold(raw[:len("http://")], "http://") {
		return false
	}
	rest := raw[len("http://"):]
	host, port, err := net.SplitHostPort(rest)
	if err != nil || port == "" || strings.Trim(port, "0123456789") != "" {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// TestPropertyActivateInstanceAcceptsOnlyBareLoopbackOrigin 性质：发现文件里的地址只有形如
// http://<回环 IP>:<端口>（没有路径、查询、片段、用户信息）且凭据合法时才会被拿去请求；
// 其余一律在发请求前拒绝。timeout 传 0 时通过校验的分支只会返回「等待本机实例应答超时」，
// 所以能不发网络请求就区分「校验通过」和「校验拒绝」。
//
// 这里不生成以 "?" 或 "#" 结尾的地址，那两种见 TestActivateInstanceRejectsBareQueryOrFragmentMarker。
func TestPropertyActivateInstanceAcceptsOnlyBareLoopbackOrigin(t *testing.T) {
	r := propertyRand(t)
	const passed = "等待本机实例应答超时"
	for i := 0; i < propertyCases; i++ {
		scheme := []string{"http://", "http://", "https://", "", "HTTP://"}[r.Intn(5)]
		host := []string{"127.0.0.1", "127.0.0.1", fmt.Sprintf("127.%d.%d.%d", r.Intn(256), r.Intn(256), r.Intn(256)), "[::1]", "localhost", "10.0.0.1", "example.com", "[fe80::1]"}[r.Intn(8)]
		port := []string{"", ":" + fmt.Sprint(1+r.Intn(65535)), ":" + fmt.Sprint(1+r.Intn(65535))}[r.Intn(3)]
		suffix := []string{"", "", "", "/", "/x", "?q=1", "#f", "//"}[r.Intn(8)]
		user := []string{"", "", "u@", "u:p@"}[r.Intn(4)]
		token := newAPIToken()
		if r.Intn(5) == 0 {
			token = strings.ToUpper(token)
		}
		address := scheme + user + host + port + suffix
		err := activateInstance(instanceRecord{URL: address, Token: token}, r.Intn(2) == 0, 0)
		if err == nil {
			t.Fatalf("第 %d 例：timeout=0 时不可能成功：%q", i, address)
		}
		want := bareLoopbackOrigin(address) && validAPIToken(token)
		if got := err.Error() == passed; got != want {
			t.Fatalf("第 %d 例：地址 %q 凭据合法=%v：校验通过=%v，期望 %v（%v）", i, address, validAPIToken(token), got, want, err)
		}
	}
}

// TestActivateInstanceRejectsBareQueryOrFragmentMarker 修复前失败。
//
// activateInstance 用 u.RawQuery == "" 和 u.Fragment == "" 判「没有查询串、没有片段」，
// 但 "http://127.0.0.1:8080?" 解析后 RawQuery 为空（ForceQuery 为真）、"http://127.0.0.1:8080#"
// 解析后 Fragment 为空，两者都过了校验。之后 record.URL+"/api/instance" 拼出的是
// "http://127.0.0.1:8080?/api/instance" 或 "http://127.0.0.1:8080#/api/instance"：请求打到 "/"
// 而不是 /api/instance，唤起前台窗口的调用被静默送错地方。guardAPI 判 Origin 用的是同一组条件。
func TestActivateInstanceRejectsBareQueryOrFragmentMarker(t *testing.T) {
	for _, address := range []string{"http://127.0.0.1:8080?", "http://127.0.0.1:8080#", "http://[::1]:8080?", "http://[::1]:8080#"} {
		// timeout 传 0：通过校验的分支只会返回「等待本机实例应答超时」，不会真的去拨 8080 端口。
		err := activateInstance(instanceRecord{URL: address, Token: newAPIToken()}, false, 0)
		if err == nil || !strings.HasPrefix(err.Error(), "无效的本机") {
			target, _ := url.Parse(address + "/api/instance")
			t.Fatalf("地址 %q 通过了校验（%v），拼出的请求路径是 %q 而不是 /api/instance", address, err, target.Path)
		}
	}
}
