package portal

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// newHTTPClient 构造一个专门用于校园网认证的 HTTP 客户端。
//
// 这里有两个刻意的设定，都是踩过坑才加的：
//
//   - Proxy 显式设成 nil。Go 默认会读 HTTP_PROXY / HTTPS_PROXY 环境变量，
//     系统上开着代理或加速器时，认证请求会被抓走，结果就是一直转圈或者
//     报一堆莫名其妙的错。认证必须走直连。
//
//   - 支持直接指定服务器 IP。有些代理工具会把域名解析也接管掉，
//     导致认证门户的域名根本解析不出来；这时候只能绕开 DNS 直接连 IP。
func newHTTPClient(host, serverIP string, timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}

	transport := &http.Transport{
		Proxy: nil,
		// 客户端是按次新建的，用完就没人管了。不设空闲超时的话，保活连接要等
		// 服务端来关，Transport 和它的读写协程也跟着一直挂在进程里。
		IdleConnTimeout: 30 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if serverIP != "" {
				_, port, err := net.SplitHostPort(addr)
				if err != nil {
					port = "80"
				}
				addr = net.JoinHostPort(serverIP, port)
			}
			return dialer.DialContext(ctx, network, addr)
		},
	}

	// 直接连 IP 时，HTTPS 握手里的域名（SNI）还得是原来的域名，
	// 否则服务端返回的证书对不上，TLS 校验会失败。
	if serverIP != "" && strings.HasPrefix(host, "https://") {
		if u, err := url.Parse(host); err == nil && u.Hostname() != "" {
			transport.TLSClientConfig = &tls.Config{ServerName: u.Hostname()}
		}
	}

	return &http.Client{Transport: transport, Timeout: timeout}
}

// statusTransport 是在线查询共用的连接层：直连、不保活。
//
// 桌面端每 30 秒查一次在线状态，每次对每个门户只发一个请求，保活没有收益。
// 以前每次查询都新建两三个带保活的 Transport，空闲连接要等 IdleConnTimeout
// 才关，下一次查询又得重新握手。共用一个不保活的，请求结束连接就关。
var statusTransport = &http.Transport{
	Proxy:             nil,
	DialContext:       (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
	DisableKeepAlives: true,
}

// statusHTTPClient 是在线查询用的客户端，超时见 statusQueryTimeout。
func statusHTTPClient() *http.Client {
	return &http.Client{Transport: statusTransport, Timeout: statusQueryTimeout}
}

// parseJSONP 把 "callback({...})" 这种响应里的 JSON 部分取出来。
// 深澜和 Dr.COM 的接口都用这个格式。
//
// secrets 是这次请求带出去的机密。响应不是 JSONP 时错误里会带一截正文，
// 透明代理、运营商劫持页常把完整请求地址写进错误页，所以正文里出现机密时
// 整段不给出，见 withholdSecrets。
func parseJSONP(body []byte, secrets ...string) ([]byte, error) {
	s := strings.TrimSpace(string(body))
	start := strings.Index(s, "(")
	end := strings.LastIndex(s, ")")
	if start < 0 || end <= start {
		// 先对完整正文查机密，再截断。顺序反过来的话，截断线正好落在密码中间时，
		// 剩下的前半截已经认不出来了，会原样漏进错误里。
		return nil, fmt.Errorf("响应不是预期的 JSONP 格式: %s", truncate(withholdSecrets(s, secrets...), 160))
	}
	return []byte(s[start+1 : end]), nil
}

// truncate 把过长的文本截断，避免错误信息刷屏。
func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// redactRequestError 把 http.Client 返回的错误里的请求地址去掉查询串。
//
// *url.Error 的 Error() 会原样带上完整 URL（net/http 只抹掉 userinfo 里的密码，
// 查询串照留）。而 Dr.COM 登录把明文密码放在查询串里，深澜登录放的是学号、
// {MD5} 摘要和加密后的用户信息。门户超时、连接被拒这类错误在高峰期很常见，
// 这段文字会一路显示到界面、被 /api/status 缓存、被用户截图发群求助。
//
// 这里只换掉 URL，底层的 net 错误原样保留，调用方仍能用 errors.As
// 分辨超时、拒绝连接、DNS 失败等类别。
func redactRequestError(err error) error {
	var ue *url.Error
	if !errors.As(err, &ue) {
		return err
	}
	return &url.Error{Op: ue.Op, URL: redactURL(ue.URL), Err: ue.Err}
}

// redactURL 只留下 scheme://host/path，查询串、片段和 userinfo 一律去掉。
func redactURL(raw string) string {
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		raw = raw[:i]
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	u.User = nil
	return u.String()
}

// minScrubLen 是在错误文本里按原文替换机密的最短长度。
//
// 太短的机密会撞上无关的文字：密码是 "127" 时，把它换成 *** 得到
// "dial tcp ***.0.0.1"，替换的位置反倒把密码告诉了看截图的人。
// 错误里的请求地址已经由 redactRequestError 去掉了查询串，这一步只是兜底；
// 响应正文走的是 withholdSecrets，不受这个长度限制。
const minScrubLen = 6

// withheldBody 替代含有机密的响应正文。
const withheldBody = "（正文里出现了登录凭据，已整段隐去）"

// scrubbedError 是抹掉机密之后的错误：Error() 给出干净的文本，Unwrap 仍然
// 返回原错误，调用方照样能用 errors.As 分辨超时、拒绝连接、DNS 失败等类别。
// 链上的 *url.Error 已经由 redactRequestError 去掉了查询串。
type scrubbedError struct {
	msg string
	err error
}

func (e *scrubbedError) Error() string { return e.msg }
func (e *scrubbedError) Unwrap() error { return e.err }

// scrubSecrets 是错误文本的最后一道兜底：出现了足够长的机密（原文或编码后的
// 样子）就换成 ***。没有命中时原样返回。
//
// 带回显正文的错误在 parseJSONP 里就已经处理过了（先查机密、再截断），
// 这里防的是以后新加的路径把机密拼进错误文本。
func scrubSecrets(err error, secrets ...string) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	clean := scrubText(msg, secrets...)
	if clean == msg {
		return err
	}
	return &scrubbedError{msg: clean, err: err}
}

// scrubText 把文本里长度不小于 minScrubLen 的机密换成 ***。
func scrubText(s string, secrets ...string) string {
	for _, form := range secretForms(secrets) {
		if len(form) >= minScrubLen {
			s = strings.ReplaceAll(s, form, "***")
		}
	}
	return s
}

// withholdSecrets 用在服务端返回的正文上：只要出现了机密（不论长短、不论
// 哪种编码），整段都不给出，换成一句说明。
//
// 必须对完整正文调用，再截断。也不做 *** 局部替换：短密码会撞上无关文字，
// 替换的位置本身就会把密码暴露出来。代价只是这种情况下看不到原始正文。
func withholdSecrets(s string, secrets ...string) string {
	for _, form := range secretForms(secrets) {
		if strings.Contains(s, form) {
			return withheldBody
		}
	}
	return s
}

// secretForms 列出机密出现在文本里时可能的几种样子：原文、查询串编码、
// 路径编码，以及错误页常见的 HTML 转义。
func secretForms(secrets []string) []string {
	var out []string
	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		out = append(out, secret, url.QueryEscape(secret), url.PathEscape(secret), html.EscapeString(secret))
	}
	return out
}
