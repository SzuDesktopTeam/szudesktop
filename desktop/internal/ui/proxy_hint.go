package ui

import (
	"context"
	"errors"
	"net/url"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// schoolFakeIP 判断学校域名是否被本机代理的 Fake-IP 接管，测试替换它，不碰真实 DNS。
var schoolFakeIP = portal.SchoolHostFakeIP

// schoolConnectionError 是学校业务请求连不上时的报错：学校域名解析进了 198.18.0.0/15，
// 就把「请检查网络」换成能照做的那句（O7）。
//
// 很多同学开着 Clash 这类代理的 TUN / Fake-IP 模式，请求里设的 Proxy:nil 管不住 DNS
// 这一层：学校域名先被解析成代理发的假地址，流量进了代理再被转出校园网，学校系统
// 连不上或者连上就被断开，而笼统的「请检查网络」只会让人去重连校园网。
// 只在连接已经失败时才查一次 DNS，正常请求不多花时间。
// requestURL 是这次请求的地址；err 里有跳转后的地址时以它为准（真正连不上的是那一跳）。
// 地址只取主机名来判断，不进报错文本。
func schoolConnectionError(lead, fallback string, requestURL *url.URL, err error) error {
	// 页面自己取消的请求不是连不上，不用再去查 DNS。
	if errors.Is(err, context.Canceled) {
		return errors.New(fallback)
	}
	host := ""
	if requestURL != nil {
		host = requestURL.Hostname()
	}
	var ue *url.Error
	if errors.As(err, &ue) {
		if u, perr := url.Parse(ue.URL); perr == nil && u.Hostname() != "" {
			host = u.Hostname()
		}
	}
	if host != "" && schoolFakeIP(host) {
		return errors.New(lead + "：" + portal.ProxyTakeoverHint + "，然后重试")
	}
	return errors.New(fallback)
}
