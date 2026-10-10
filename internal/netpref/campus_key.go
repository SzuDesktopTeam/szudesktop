package netpref

import (
	"net"
	"net/url"
	"strconv"
	"strings"
)

// CampusKey 按门户地址和门户返回的客户端 IP 标识校园出口。
// 只使用 HTTP(S) origin；无效地址或客户端 IP 不生成缓存键。
func CampusKey(portalHost, clientIP string) string {
	ip := net.ParseIP(strings.TrimSpace(clientIP))
	if ip == nil {
		return ""
	}
	u, err := url.Parse(strings.TrimSpace(portalHost))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return ""
		}
		if (u.Scheme == "http" && n == 80) || (u.Scheme == "https" && n == 443) {
			port = ""
		} else {
			port = strconv.Itoa(n)
		}
	}
	if port != "" {
		host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return u.Scheme + "://" + host + "|" + ip.String()
}
