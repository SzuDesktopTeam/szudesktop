package portal

import (
	"context"
	"net"
	"strings"
	"time"
)

// ProxyTakeoverHint 是学校域名被本机代理接管时给人看的那句话，诊断、学校业务报错和命令行共用。
//
// 只写桌面和命令行都能照做的话，不带命令行参数。括号里那半句不能省：Fake-IP 模式下
// 只加直连规则，域名照样解析成假地址（流量仍先进代理），这条提示也就一直消不掉。
const ProxyTakeoverHint = "代理软件接管了学校域名，请把 szu.edu.cn 设为直连" +
	"（Fake-IP 模式还要把它加进 fake-ip-filter 这类「不分配假 IP」的名单）"

// fakeIPNet 是 Clash、Surge、sing-box 等代理软件 Fake-IP 模式用的假地址段 198.18.0.0/15。
//
// 这段是 RFC 2544 留给基准测试的，公网和校园网里都不会出现真实主机。学校域名解析进这里，
// 说明本机代理接管了 DNS：访问学校的流量先进代理，由代理按自己的规则转发，在校内常被
// 转出校园网，认证门户、学校系统于是连不上或者连上就被断开。认证请求里设的 Proxy:nil
// 只管得住 HTTP 代理，管不住 DNS 这一层的接管（O7）。
var fakeIPNet = &net.IPNet{IP: net.IPv4(198, 18, 0, 0).To4(), Mask: net.CIDRMask(15, 32)}

// isFakeIP 判断地址是否落在 Fake-IP 段里。
func isFakeIP(ip net.IP) bool {
	return ip != nil && fakeIPNet.Contains(ip)
}

// lookupIP 是域名解析入口，做成变量方便测试换成固定结果，不碰真实 DNS。
var lookupIP = func(ctx context.Context, host string) ([]net.IP, error) {
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

// hostLookupTimeout 是学校业务报错时附带检查的解析上限：请求已经失败了，不能再让人多等。
const hostLookupTimeout = 3 * time.Second

// resolveHost 解析一次域名，返回能不能解析出地址、以及是否解析进了 Fake-IP 段。
func resolveHost(ctx context.Context, host string) (ok, fakeIP bool) {
	ips, err := lookupIP(ctx, host)
	if err != nil || len(ips) == 0 {
		return false, false
	}
	for _, ip := range ips {
		if isFakeIP(ip) {
			return true, true
		}
	}
	return true, false
}

// IsSchoolHost 判断主机名是不是学校域名（szu.edu.cn 本身或它的子域）。
func IsSchoolHost(host string) bool {
	host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	return host == "szu.edu.cn" || strings.HasSuffix(host, ".szu.edu.cn")
}

// SchoolHostFakeIP 判断一个学校域名当前是否被代理的 Fake-IP 接管。
//
// 不是学校域名（包括 IP 字面量）一律返回 false：提示说的是「学校域名被接管」，
// 琴房这类直接用内网 IP 的服务、外部站点不归这条管。
// 会做一次 DNS 查询，调用方只在排查或请求已经失败时调用。
func SchoolHostFakeIP(host string) bool {
	return SchoolHostFakeIPContext(context.Background(), host)
}

// SchoolHostFakeIPContext lets an in-progress operation cancel its diagnostic DNS check.
func SchoolHostFakeIPContext(parent context.Context, host string) bool {
	if !IsSchoolHost(host) {
		return false
	}
	ctx, cancel := context.WithTimeout(parent, hostLookupTimeout)
	defer cancel()
	_, fake := resolveHost(ctx, host)
	return fake
}
