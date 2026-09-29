package portal

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// 外网连通性探测地址。正常联网时返回 204 No Content；
// 校园网没认证时，请求会被网关抢走，拿回来的不是 204。
const connectivityProbe = "http://connect.rom.miui.com/generate_204"

// DetectResult 是一次区域探测的完整结果。
// 除了结论，探测过程也一起带出来——排查时这些细节比结论更有用。
//
// ⚠️ 下面这几个 bool 有一个重要的区分：它们只表示"探到了 / 没探到"，
// 不表示"没探"。「没探」要用 Probed 判断。
// 曾经的坑：已经联网时 Detect() 会提前返回，这几个字段保持零值 false，
// 调用方却把它们当成"探测失败"，于是界面显示"两个门户都连不上"、
// 判区看着像校外，其实压根没跑过探测。
type DetectResult struct {
	Zone       Zone
	InternetOK bool // 能不能上外网

	// Probed 表示"门户连通性和协议指纹到底跑没跑过"。
	// 已经联网时走快路径直接返回，这里是 false，此时上面四个探测字段无意义。
	Probed bool

	DormPortalOK  bool // 宿舍区门户（172.30.255.42）通不通
	TeachPortalOK bool // 教学区门户（net.szu.edu.cn）通不通
	SrunDNSOK     bool // 教学区门户的域名能不能解析出来
	// SrunDNSFakeIP 表示 net.szu.edu.cn 解析进了 198.18.0.0/15，也就是本机代理的 Fake-IP
	// 模式接管了学校域名（见 fakeip.go）。这时解析「能成功」，SrunDNSOK 是 true，
	// 但地址是代理发的假地址，访问学校的流量都先进代理。
	SrunDNSFakeIP bool
	SrunUsable    bool // 深澜的 get_challenge 是不是真的能用（协议指纹）
	DormUsable    bool // 宿舍区 ePortal 的登录接口是不是真的在（协议指纹）
	Notes         []string
}

// Detect 判断设备当前在哪张网。
//
// 判断顺序是实测出来的，不是拍脑袋定的：
//   - 已经联网时，外网探测会直接通过
//   - 没认证的宿舍区，宿舍门户和教学门户**都能**连上，但上不了外网
//   - 没认证的教学区，只有教学门户能连上
//
// 所以先看外网通不通，通了就不用折腾了；不通再看哪个门户能连上。
//
// 各项探测互不依赖，同一阶段的并发跑：校外或网络异常时总耗时是最慢的那一项，
// 而不是各项超时加起来（桌面端每 30 秒刷新一次状态，走的就是这里）。
func Detect() *DetectResult {
	r := &DetectResult{}

	parallel(
		func() { r.SrunDNSOK, r.SrunDNSFakeIP = resolveSchoolDNS() },
		func() { r.InternetOK = internetReachable() },
	)
	if r.InternetOK {
		r.Zone = ZoneOnline
		r.Notes = append(r.Notes, "能正常访问外网，当前不需要认证")
		if r.SrunDNSFakeIP {
			r.Notes = append(r.Notes, fakeIPWarning)
		}
		// 已经联网时不需要认证，所以不再跑门户和指纹探测（能省两秒）。
		// 但要把 Probed 留成 false，让调用方知道"这几个字段没意义"，
		// 别把它们误读成"探测失败"。
		//
		// 想在联网状态下也知道"万一掉线会用哪套协议"，改用 Probe()。
		// 界面上的「断线诊断」走的就是 Probe()。
		return r
	}

	// 光看"连不连得上"会判错区：宿舍区门户 172.30.255.42 在教学区也能连上
	// （返回 200），但它的 /eportal/portal/login 是 404——也就是说教学区机器上
	// 「两个门户都通」照样成立。以前这条规则会把教学区误判成宿舍区，
	// 然后用 Dr.COM 协议去打 404。所以这里改用协议指纹：
	// 谁真的提供了自己的认证接口，才算谁的地盘。
	probePortals(r)
	concludeProbe(r)
	return r
}

// Probe 是无条件跑完整探测的版本，给「断线诊断」用。
//
// 和 Detect() 的区别只有一个：**哪怕现在能上外网，也照样把门户连通性和
// 协议指纹跑一遍**。因为诊断页要回答的问题是"万一下一秒掉线了，
// 程序会认为我在哪个区、会用哪套协议" —— 这个答案只有跑了才知道。
//
// Detect() 为了省时间会在联网时提前返回，那种场景下这几个字段没意义，
// 所以两者不能混用。
func Probe() *DetectResult {
	r := &DetectResult{}

	// 不提前返回，把探测做完。六项互不依赖，一起跑。
	parallel(
		func() { r.SrunDNSOK, r.SrunDNSFakeIP = resolveSchoolDNS() },
		func() { r.InternetOK = internetReachable() },
		func() { probePortals(r) },
	)
	concludeProbe(r)
	return r
}

// concludeProbe 按跑完的探测字段定区、写说明。Detect（未联网时）和 Probe 共用。
//
// Notes 会原样出现在桌面版的诊断里，所以这里只写两端都能照做的话，
// 不写 --ip / --zone 这类命令行参数；命令行版在打印时自己补一句怎么指定。
func concludeProbe(r *DetectResult) {
	if r.InternetOK {
		// 已经联网：不用认证，但把"掉线后会用哪套协议"讲清楚。
		r.Zone = ZoneOnline
		r.Notes = append(r.Notes, "能正常访问外网，当前不需要认证")
		r.Notes = append(r.Notes, "下面是为「万一掉线」做的预判："+zoneFingerprintNote(r))
	} else {
		r.Notes = append(r.Notes, "上不了外网，接下来判断你在哪个区")
		r.Zone = classify(r)
	}
	if !r.SrunDNSOK {
		r.Notes = append(r.Notes, dnsWarning)
	}
	if r.SrunDNSFakeIP {
		r.Notes = append(r.Notes, fakeIPWarning)
	}
}

// parallel 并发跑几项互不依赖的探测，全部跑完才返回。
// 每项只写自己那个字段，不会互相踩。
func parallel(fns ...func()) {
	var wg sync.WaitGroup
	for _, fn := range fns {
		wg.Add(1)
		go func(fn func()) {
			defer wg.Done()
			fn()
		}(fn)
	}
	wg.Wait()
}

// probePortals 跑门户连通性和两套协议指纹，四项并发。
func probePortals(r *DetectResult) {
	parallel(
		func() { r.DormPortalOK = reachable(DefaultDrcomHost + "/") },
		func() { r.TeachPortalOK = reachable(DefaultSrunHost + "/") },
		func() { r.SrunUsable = srunUsable() },
		func() { r.DormUsable = drcomUsable() },
	)
	r.Probed = true
}

// PredictDropZone 按门户连通性和协议指纹，给出「真要认证时走哪套协议」和依据。
//
// 这是判区规则的唯一出处：未联网时的 classify、联网时「万一掉线」的预判
// （zoneFingerprintNote），以及 diagnose 里的建议都从这里取结论。以前三处各写
// 一份，同一份诊断报告里一边说「按宿舍区处理」、一边说「判不出来」。
//
// 返回 ZoneOutside 表示两个门户都探不到，真掉线时判不出区。
// 只看探测字段，不看外网通不通；调用方要自己确认 r.Probed。
func PredictDropZone(r *DetectResult) (Zone, string) {
	if r == nil {
		return ZoneOutside, "没有探测结果"
	}
	switch {
	case r.SrunUsable && !r.DormUsable:
		return ZoneTeaching, "深澜握手成功、宿舍区没有 ePortal 接口"
	case r.DormUsable && !r.SrunUsable:
		return ZoneDorm, "ePortal 登录接口在、深澜握手失败"
	case r.SrunUsable && r.DormUsable:
		return ZoneDorm, "两套接口都有回应（宿舍区常见）"
	case r.DormPortalOK && r.TeachPortalOK:
		// 这是宿舍区未认证时最常见的情况，容易误判成教学区，所以排在门户规则第一个。
		return ZoneDorm, "两个门户都能连上、认证接口都没指纹（宿舍区未认证时两个门户都通）"
	case r.DormPortalOK:
		return ZoneDorm, "只有宿舍门户能连上"
	case r.TeachPortalOK:
		return ZoneTeaching, "只有教学门户能连上"
	default:
		return ZoneOutside, "两个门户都连不上"
	}
}

// classify 按探测结果定区。Detect 和 Probe 共用这一段，免得两边判据走偏。
func classify(r *DetectResult) Zone {
	zone, reason := PredictDropZone(r)
	switch {
	case zone == ZoneOutside:
		r.Notes = append(r.Notes, reason+" → 不在校园网内，或者校园网本身故障")
	case r.SrunUsable && r.DormUsable:
		r.Notes = append(r.Notes, reason+" → 按宿舍区处理；如果登录报 ac_id 或协议错误，改按教学区手动指定")
	default:
		r.Notes = append(r.Notes, reason+" → 判定"+zoneShortName(zone))
	}
	return zone
}

// zoneFingerprintNote 把指纹结论讲成人话，供联网状态下参考。
func zoneFingerprintNote(r *DetectResult) string {
	zone, reason := PredictDropZone(r)
	if zone == ZoneOutside {
		return reason + "，真掉线时判不出区"
	}
	return reason + "，掉线后按「" + zoneShortName(zone) + "」处理"
}

// zoneShortName 是判区说明里用的短名字。
func zoneShortName(z Zone) string {
	switch z {
	case ZoneTeaching:
		return "教学区"
	case ZoneDorm:
		return "宿舍区"
	default:
		return z.Label()
	}
}

// AuthenticationZone selects an authentication protocol from an existing probe.
// Internet connectivity alone never identifies an authenticated campus session.
func (r *DetectResult) AuthenticationZone() Zone {
	if r == nil {
		return ZoneUnknown
	}
	if r.Probed {
		// Match classify: when both fingerprints exist, use the dorm protocol.
		if r.DormUsable {
			return ZoneDorm
		}
		if r.SrunUsable {
			return ZoneTeaching
		}
	}
	if !r.InternetOK && (r.Zone == ZoneTeaching || r.Zone == ZoneDorm) {
		return r.Zone
	}
	return ZoneUnknown
}

const dnsWarning = "注意：net.szu.edu.cn 这个域名解析不出来。如果开着代理或 DoH，" +
	"它可能把域名解析抢走了，可以先关掉代理（或者在代理规则里让 net.szu.edu.cn 直连）再试"

// fakeIPWarning 是 net.szu.edu.cn 解析进 Fake-IP 段时的说明。上面的门户探测也经过了代理，
// 结论可能不准，所以把原因和做法一起写明。
const fakeIPWarning = "注意：net.szu.edu.cn 解析到了 198.18.0.0/15 里的假地址。" + ProxyTakeoverHint

// resolveSchoolDNS 解析教学区门户的域名：能不能解析出来、是不是被 Fake-IP 接管。
// 探测的其余各项都有自己的超时，这里和以前一样用系统解析器的默认超时。
func resolveSchoolDNS() (ok, fakeIP bool) {
	return resolveHost(context.Background(), "net.szu.edu.cn")
}

// internetReachable 检查是否真的能上外网。
func internetReachable() bool {
	client := &http.Client{
		Timeout:   5 * time.Second,
		Transport: probeTransport,
	}
	resp, err := client.Get(connectivityProbe)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))

	// 只有干净的 204 才算真的通。被网关劫持时状态码通常不是 204。
	return resp.StatusCode == http.StatusNoContent
}

// reachable 只关心"连不连得上"，不管对方返回什么。
//
// 不跟随跳转是故意的：认证门户对未登录的请求一律 302 到登录页，
// 跟随跳转反而会绕远路，甚至被系统代理截胡。
func reachable(rawURL string) bool {
	client := noProxyClient(4 * time.Second)

	resp, err := client.Get(rawURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	return true
}

// probeTransport 是所有探测共用的连接层：不走代理、不保活。
//
// 探测每个地址只发一个请求，保活没有收益；以前每次探测都新建 Transport、
// 又从不关空闲连接，桌面端每 30 秒刷新一次，连接只能等服务端来关。
// 共用一个不保活的 Transport，请求结束连接就关。
var probeTransport = &http.Transport{
	Proxy:             nil,
	TLSClientConfig:   &tls.Config{InsecureSkipVerify: true},
	DisableKeepAlives: true,
}

// noProxyClient 造一个明确不走系统代理、不跟随跳转的探测客户端。
//
// 开着代理时，net.szu.edu.cn 这类内网域名会被代理抢走解析，
// 探测结果就不可信了。所以探测一律绕开代理。
func noProxyClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: probeTransport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// fetch 取回响应体，只用于探测。
func fetch(client *http.Client, rawURL string, limit int64) (int, []byte) {
	resp, err := client.Get(rawURL)
	if err != nil {
		return 0, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, limit))
	return resp.StatusCode, body
}

// srunUsable 判断深澜的认证接口是不是真的在这张网上。
//
// 判据是 get_challenge 能不能握手成功：这是深澜登录的第一步，
// 返回 error=ok 且带 challenge，就说明这台机器确实归深澜管。
// 用 probe 这个假账号，只握手、不登录，不碰真实凭据。
func srunUsable() bool {
	client := noProxyClient(5 * time.Second)
	code, body := fetch(client,
		DefaultSrunHost+"/cgi-bin/get_challenge?callback=_&username=probe&ip=", 1<<16)
	if code == 0 {
		return false
	}

	// 返回是 JSONP：_({...})，要先把外壳剥掉才能解析。
	raw := strings.TrimSpace(string(body))
	if i := strings.Index(raw, "("); i >= 0 {
		if j := strings.LastIndex(raw, ")"); j > i {
			raw = raw[i+1 : j]
		}
	}

	var resp struct {
		Challenge string `json:"challenge"`
		Error     string `json:"error"`
	}
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		return false
	}
	return resp.Error == "ok" && resp.Challenge != ""
}

// drcomUsable 判断宿舍区的 ePortal 登录接口是不是真的在这张网上。
//
// 这里特意请求登录接口本身而不是门户首页：首页在教学区也能返回 200，
// 只有 /eportal/portal/login 在（哪怕账号为空会报错）才说明真有 ePortal。
// 账号密码留空，不会触发任何真实认证。
func drcomUsable() bool {
	client := noProxyClient(5 * time.Second)
	code, body := fetch(client,
		DefaultDrcomHost+"/eportal/portal/login?callback=dr1003&login_method=1&user_account=&user_password=", 1<<16)
	if code == 0 || code == http.StatusNotFound {
		return false
	}
	// ePortal 无论成功失败都返回 dr1003(...) 这种 JSONP，拿它当指纹。
	return strings.Contains(string(body), "dr1003")
}
