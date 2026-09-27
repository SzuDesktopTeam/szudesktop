package portal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/crypto"
)

// DefaultSrunHost 是深大教学区的深澜认证门户。
// 其他用深澜系统的学校换成自己的门户地址即可。
const DefaultSrunHost = "https://net.szu.edu.cn"

// 深澜协议里两个固定参数，照门户页面的默认值抄。
const (
	srunN    = "200"
	srunType = "1"
)

// SrunClient 是深澜（SRun）认证客户端，用于教学区 / 办公区 / 图书馆。
type SrunClient struct {
	Host     string // 认证门户地址
	Username string // 6 位校园卡号
	Password string // 统一身份认证密码
	ServerIP string // 可选：直接指定服务器 IP，绕过域名解析
	AcID     string // 可选：手动指定接入点编号；留空则自动发现

	// lastAcID 是上一次成功认证用过的接入点编号。
	// 同一张网里不用每次重探；服务端说这个编号不对时，Login 会把它作废、
	// 跳过缓存重新发现一次（见 Login）。
	lastAcID string

	// OnAcIDResolved 在自动发现出 ac_id 后回调，方便调用方持久化。
	// 可以为 nil。
	OnAcIDResolved func(acID string)

	// OnAcIDRejected 在缓存下来的 ac_id 被服务端拒绝（ac-type / auth_info 一类报错）
	// 时回调，调用方应该把这张网的缓存删掉。可以为 nil。
	OnAcIDRejected func(acID string)

	// redirectProbes 是网关跳转发现用的外网探针，测试可以换成假网关。
	redirectProbes []string

	http *http.Client
}

// NewSrunClient 创建一个深澜认证客户端。
func NewSrunClient(host, username, password string) *SrunClient {
	c := newSrunClient(host, username, password)
	c.http = newHTTPClient(c.Host, "", 10*time.Second)
	return c
}

// newSrunClient 只填字段，HTTP 客户端由调用方配（在线查询用不保活的那个）。
func newSrunClient(host, username, password string) *SrunClient {
	if host == "" {
		host = DefaultSrunHost
	}
	return &SrunClient{
		Host:           strings.TrimRight(host, "/"),
		Username:       username,
		Password:       password,
		redirectProbes: append([]string(nil), defaultRedirectProbes...),
	}
}

// SetServerIP 指定认证服务器的 IP，用于域名解析不通的情况。
func (c *SrunClient) SetServerIP(ip string) {
	c.ServerIP = ip
	c.http = newHTTPClient(c.Host, ip, 10*time.Second)
}

// SetLastAcID 告诉客户端上次成功用过的接入点编号，可省一次探测。
func (c *SrunClient) SetLastAcID(id string) {
	c.lastAcID = id
}

// ResolveAcIDWithSource 对外暴露一次接入点发现，并把来源一起带出来。
//
// 调用方需要知道这个编号可不可信：猜出来的值不该当成定论给用户看，
// 更不该缓存。
func (c *SrunClient) ResolveAcIDWithSource() (string, AcIDSource) {
	return c.resolveAcIDWithSource()
}

// rememberAcID 记下这次用对的接入点编号，并通知调用方持久化。
func (c *SrunClient) rememberAcID(id string) {
	if id == "" {
		return
	}
	c.lastAcID = id
	if c.OnAcIDResolved != nil {
		c.OnAcIDResolved(id)
	}
}

type srunChallengeResp struct {
	Challenge string `json:"challenge"`
	ClientIP  string `json:"client_ip"`
	Error     string `json:"error"`
	ErrorMsg  string `json:"error_msg"`
	Res       string `json:"res"`
}

type srunPortalResp struct {
	Error    string `json:"error"`
	ErrorMsg string `json:"error_msg"`
	SucMsg   string `json:"suc_msg"`
	OnlineIP string `json:"online_ip"`
	ClientIP string `json:"client_ip"`
	Res      string `json:"res"`
}

type srunUserInfo struct {
	Username string `json:"username"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	AcID     string `json:"acid"`
	EncVer   string `json:"enc_ver"`
}

// Status 查询账号当前是否在线。
//
// 顺带把"这个出口上有几台设备在线"读出来。深澜新版（学生区城市热点）
// 是按设备登记会话的，一个账号可以挂多台，但一个出口 IP 仍然只认一个账号。
// 撞上 ip_already_online 时，这是唯一能把情况说清楚的信息。
func (c *SrunClient) Status() (*OnlineStatus, error) {
	u := fmt.Sprintf("%s/cgi-bin/rad_user_info?callback=_&_=%d", c.Host, time.Now().Unix())
	body, err := c.get(u)
	if err != nil {
		return nil, fmt.Errorf("查询在线状态失败: %w", err)
	}

	var resp struct {
		Error    string `json:"error"`
		UserName string `json:"user_name"`
		OnlineIP string `json:"online_ip"`

		// 这两个字段实测都存在，但注意：返回里**没有 user_name**，
		// 所以 Username 通常是空的，别指望靠它认出"在线的是谁"。
		OnlineDeviceTotal  string `json:"online_device_total"`
		OnlineDeviceDetail string `json:"online_device_detail"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析在线状态失败: %w", err)
	}
	if strings.TrimSpace(resp.Error) == "" {
		return nil, fmt.Errorf("在线状态响应缺少有效的 error 字段")
	}

	return &OnlineStatus{
		Online:      resp.Error == "ok",
		Username:    resp.UserName,
		IP:          resp.OnlineIP,
		DeviceTotal: parseOnlineDeviceCount(resp.OnlineDeviceTotal),
		Devices:     parseOnlineDevices(resp.OnlineDeviceDetail),
		Raw:         truncate(string(body), 300),
	}, nil
}

// parseOnlineDeviceCount 把 online_device_total 这个字符串数字读成 int。
// 读不出来就返回 0——它只是提示用的补充信息，不值得让整次查询失败。
func parseOnlineDeviceCount(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// parseOnlineDevices 把 online_device_detail 里的设备列表读成一句句人话。
//
// 这个字段是「JSON 字符串里再套一层 JSON」：
//
//	{"344898392":{"class_name":"Macintosh","ip":"10.20.30.40","os_name":"Mac OS"}}
//
// 外层键是 rad_online_id。读不出来就返回 nil，不影响 Online 的判断。
func parseOnlineDevices(detail string) []string {
	if strings.TrimSpace(detail) == "" {
		return nil
	}

	var raw map[string]struct {
		Class string `json:"class_name"`
		OS    string `json:"os_name"`
		IP    string `json:"ip"`
	}
	if err := json.Unmarshal([]byte(detail), &raw); err != nil {
		return nil
	}

	// 按 rad_online_id 排序，保证同样的输入总给出同样的顺序。
	ids := make([]string, 0, len(raw))
	for id := range raw {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	out := make([]string, 0, len(ids))
	for _, id := range ids {
		d := raw[id]
		desc := d.OS
		if desc == "" {
			desc = d.Class
		}
		if desc == "" {
			desc = "未知设备"
		}
		if d.IP != "" {
			desc += " · " + d.IP
		}
		out = append(out, desc)
	}
	return out
}

// Login 执行一次完整的深澜认证。
//
// 流程：要 challenge → 定 acid → 算 HMAC-MD5 密码 → 算加密用户信息
// → 算 SHA1 校验和 → 发登录请求。
//
// 缓存下来的 ac_id 被服务端拒了（换了墙口 / AP，或者撞上了别的网络的缓存键），
// 就把缓存作废（通知 OnAcIDRejected），跳过缓存重新发现一次再试。
// 只重试这一种来源：手填的值用户说了算，网关跳转来的值本身就是权威，
// 重试也换不出别的答案。
func (c *SrunClient) Login() (*Result, error) {
	res, acIDRejected, err := c.loginOnce()
	if err != nil || res.OK || !acIDRejected || res.AcIDSource != string(AcIDSourceCache) {
		return res, err
	}
	stale := c.lastAcID
	c.lastAcID = ""
	if c.OnAcIDRejected != nil {
		c.OnAcIDRejected(stale)
	}
	// lastAcID 已清空，这次只会走跳转发现或兜底猜测，不会再回到缓存。
	res, _, err = c.loginOnce()
	return res, err
}

// loginOnce 发一次登录请求。acIDRejected 表示服务端明确说 ac_id 不对。
func (c *SrunClient) loginOnce() (res *Result, acIDRejected bool, err error) {
	token, ip, err := c.challenge()
	if err != nil {
		return nil, false, err
	}

	acID, acIDSource := c.resolveAcIDWithSource()

	pwd := crypto.HMACMD5Hex(c.Password, token)

	info, err := c.encodeUserInfo(token, ip, acID)
	if err != nil {
		return nil, false, err
	}

	// 校验和：按固定顺序把「token+字段」拼起来算 SHA1。
	// 顺序错了服务端会报 sign error，所以这里不要动。
	chksum := crypto.SHA1Hex(
		token + c.Username +
			token + pwd +
			token + acID +
			token + ip +
			token + srunN +
			token + srunType +
			token + info,
	)

	q := url.Values{}
	q.Set("callback", "_")
	q.Set("action", "login")
	q.Set("username", c.Username)
	q.Set("password", "{MD5}"+pwd)
	q.Set("os", "Mac OS")
	q.Set("name", "Macintosh")
	q.Set("double_stack", "0")
	q.Set("info", info)
	q.Set("chksum", chksum)
	q.Set("ac_id", acID)
	q.Set("ip", ip)
	q.Set("n", srunN)
	q.Set("type", srunType)

	// 查询串里有学号、{MD5} 摘要和加密后的用户信息：get 已经把错误里的地址
	// 截掉了查询串，响应正文里出现这几样时也整段不给出；这里再兜一次底。
	body, err := c.get(c.Host+"/cgi-bin/srun_portal?"+q.Encode(), c.Password, pwd, info)
	if err != nil {
		return nil, false, scrubSecrets(fmt.Errorf("发送登录请求失败: %w", err), c.Password, pwd, info)
	}

	var resp srunPortalResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, false, scrubSecrets(fmt.Errorf("解析登录响应失败: %w", err), c.Password, pwd, info)
	}

	// 先对完整正文查机密，再截断，见 withholdSecrets。
	raw := truncate(withholdSecrets(string(body), c.Password, pwd, info), 2000)
	fail := func() (*Result, bool, error) {
		return &Result{
			OK:         false,
			Message:    friendlySrunError(resp),
			Raw:        raw,
			AcID:       acID,
			AcIDSource: string(acIDSource),
		}, srunAcIDRejected(resp), nil
	}

	// 深澜这里有两种"已在线"，含义完全不同，以前混着都当成功，是错的：
	//
	//   already_online    —— 当前这个账号本来就在线，会话有效、能上网 → 算成功
	//
	//   ip_already_online —— 这个出口上已经挂着会话，服务端在**校验账号密码和
	//                        ac_id 之前**就短路返回了（实测确认过）。
	//                        也就是说：它既没验证过这组账号密码，也没验证过这个
	//                        ac_id，本次登录确实没生效。
	//
	// 所以后者既不能报成功，更不能把没验证过的 ac_id 写进缓存——那会让你
	// 下次在别的网络里拿着错值去认证，反而更难查。
	if resp.Error == "ok" {
		if strings.Contains(resp.SucMsg, "ip_already_online") {
			return &Result{
				OK:         false,
				Message:    c.explainIPAlreadyOnline(),
				Raw:        raw,
				AcID:       acID,
				AcIDSource: string(acIDSource),
			}, false, nil
		}

		// error=ok 也不等于成功：ac_id 用错时服务端同样回 error=ok，
		// 真正的结论只在 error_msg / res 里（friendlySrunError 的注释和测试夹具
		// 记的就是这种形态）。当成功报出去，用户上不了网却看到「认证成功」，
		// 错的 ac_id 还会被写进缓存固化下来。
		if srunLoginRejected(resp) {
			return fail()
		}

		// 走到这里才算认证被服务端接受，说明这个 ac_id 是对的，记下来给下次用。
		//
		// 但"猜出来的"值不写进缓存：guess 只证明编号存在，不证明
		// 你就挂在这个接入点上。把猜的当定论存下来，会让你下次
		// 在另一个网络里也拿着错值去认证，反而更难查。
		if acIDSource != AcIDSourceGuess {
			c.rememberAcID(acID)
		}

		msg := "认证成功"
		if strings.Contains(resp.SucMsg, "already_online") {
			msg = "该账号本来就在线，无需重复认证"
		}
		return &Result{OK: true, Message: msg, Raw: raw, AcID: acID, AcIDSource: string(acIDSource)}, false, nil
	}

	return fail()
}

// srunRejectMarkers 是 error=ok 时仍说明「这次没登上」的关键词，
// 和 friendlySrunError 认的那几类失败一一对应。
var srunRejectMarkers = []string{
	"ac-type", "ac_id", "auth_info", "sign_error", "sign error", "ldap", "userid",
	"decrypt", "challenge_expire", "bad_request", "login_error",
}

// srunLoginRejected 判断 error=ok 的响应里是不是其实藏着失败。
// error 字段本身是 ok，所以只看另外三个字段。
func srunLoginRejected(resp srunPortalResp) bool {
	text := strings.ToLower(strings.Join([]string{resp.ErrorMsg, resp.Res, resp.SucMsg}, " "))
	for _, m := range srunRejectMarkers {
		if strings.Contains(text, m) {
			return true
		}
	}
	return false
}

// srunAcIDRejected 判断服务端是不是在说「ac_id 不对」。
// auth_info_error 也算：它最常见的原因就是 ac_id 对不上。
func srunAcIDRejected(resp srunPortalResp) bool {
	text := strings.ToLower(strings.Join([]string{resp.Error, resp.ErrorMsg, resp.SucMsg, resp.Res}, " "))
	for _, m := range []string{"ac-type", "ac_id", "auth_info"} {
		if strings.Contains(text, m) {
			return true
		}
	}
	return false
}

// explainIPAlreadyOnline 给"出口已被占用"这个结果配一句能照着做的话。
//
// 光说"已经有账号在线"没用。用户真正想知道的是两件事：这算不算失败、
// 我现在到底能不能上网。所以顺手查一次在线信息，把设备数和 IP 带上；
// 查得到活跃会话，就明确告诉他"能上网就别折腾了"。
//
// 这次多出来的查询是只读的，而且只在登录失败这条路径上跑，值得。
func (c *SrunClient) explainIPAlreadyOnline() string {
	const lead = "这个网络出口已经有会话在线了，本次登录没有生效"

	st, err := c.Status()
	if err != nil || !st.Online {
		return lead + "。如果你现在能上网，说明那个会话是有效的，不用再登录"
	}

	var detail strings.Builder
	if st.DeviceTotal > 0 {
		fmt.Fprintf(&detail, "这个出口上现在有 %d 台设备在线", st.DeviceTotal)
		if st.IP != "" {
			fmt.Fprintf(&detail, "（IP %s）", st.IP)
		}
		detail.WriteString("。")
	}
	if len(st.Devices) > 0 {
		detail.WriteString("在线设备：" + strings.Join(st.Devices, "、") + "。")
	}

	return lead + "。" + detail.String() +
		"能上网就说明那个会话是有效的，不用再登录；想换账号，得先让原来那个会话下线"
}

// Logout 注销当前会话（相当于把自己踢下线）。
func (c *SrunClient) Logout() (*Result, error) {
	_, ip, err := c.challenge()
	if err != nil {
		return nil, err
	}

	acID := c.resolveAcID()

	q := url.Values{}
	q.Set("callback", "_")
	q.Set("action", "logout")
	q.Set("username", c.Username)
	q.Set("ac_id", acID)
	q.Set("ip", ip)

	body, err := c.get(c.Host + "/cgi-bin/srun_portal?" + q.Encode())
	if err != nil {
		return nil, fmt.Errorf("发送注销请求失败: %w", err)
	}

	var resp srunPortalResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析注销响应失败: %w", err)
	}

	raw := truncate(string(body), 400)
	if resp.Error == "ok" {
		return &Result{OK: true, Message: "已注销下线", Raw: raw}, nil
	}
	return &Result{OK: false, Message: "注销失败：" + resp.Error + " " + resp.ErrorMsg, Raw: raw}, nil
}

// challenge 向服务端要一个一次性随机串。
// 这个串是后面所有加密的密钥，每次请求都不同，所以认证请求无法重放。
// 顺带把服务端认定的本机 IP 拿回来。
func (c *SrunClient) challenge() (token, ip string, err error) {
	u := fmt.Sprintf("%s/cgi-bin/get_challenge?callback=_&username=%s&ip=",
		c.Host, url.QueryEscape(c.Username))

	body, err := c.get(u)
	if err != nil {
		return "", "", fmt.Errorf("获取 challenge 失败: %w", err)
	}

	var resp srunChallengeResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", "", fmt.Errorf("解析 challenge 响应失败: %w", err)
	}
	if resp.Challenge == "" {
		return "", "", fmt.Errorf("服务端没有返回 challenge（error=%s）", resp.Error)
	}
	return resp.Challenge, resp.ClientIP, nil
}

// acIDPattern 从门户页面内嵌的 JS 配置里抓 acid。
// 页面里是 `acid   : "12",` 这种形式。
var acIDPattern = regexp.MustCompile(`acid\s*[:=]\s*['"]?(\d+)`)

// acIDFromURL 从一串 URL 里取出 ac_id。
//
// 两个来源都会用到：
//   - 未认证时访问外网，网关会 302 到认证页，跳转地址里带 ac_id；
//   - 门户自己的登录页入口，形如 /srun_portal_pc?ac_id=12&theme=proyx。
//
// 顺带兼容几种常见别名：不同设备的网关改写 URL 时用的名字不完全一样，
// 名字对不上就会漏掉唯一可靠的线索，代价太大。
func acIDFromURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	q := u.Query()
	for _, key := range []string{"ac_id", "acid", "wlanacname", "nasid"} {
		id := q.Get(key)
		if id == "" {
			continue
		}
		// 只认纯数字：抓错了还不如走兜底逻辑。
		if isAllDigits(id) {
			return id
		}
	}
	return ""
}

// isAllDigits 判断字符串是不是纯数字且非空。
func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// defaultRedirectProbes 是网关跳转发现用的外网探针。
//
// ⚠️ 探针必须是**真正的外网站点**，见 discoverAcIDFromRedirect。
var defaultRedirectProbes = []string{
	connectivityProbe,                                   // 未认证时必定被拦
	"http://www.msftconnecttest.com/redirect",           // Windows 自带探测
	"http://connectivitycheck.gstatic.com/generate_204", // 安卓/Chrome
	"http://captive.apple.com/hotspot-detect.html",      // 苹果
}

// redirectProbeTimeout 是单个探针的超时。网关拦截是就近回的 302，
// 真被拦时很快就有结果；等不到说明根本没人拦，没必要干等 10 秒。
const redirectProbeTimeout = 4 * time.Second

// discoverAcIDFromRedirect 让网关自己告诉我们 ac_id。
//
// 这是**唯一可靠**的一招：未认证时请求任意外网地址，校园网网关会把
// 请求拦下来，302 到认证页，而认证页地址里就带着「你当前挂在哪个接入点」。
// 同一台设备换个墙口、换张网卡，这里拿到的值就会跟着变——正因为它
// 是问出来的，才不需要写死，也不需要用户去填。
//
// ⚠️ 探针必须是**真正的外网站点**。
//
// 踩过的坑：一开始把「认证门户自己」也放进了探针列表，结果门户必然
// 302 到它自己的登录页，而那个地址里带着默认的 ac_id=1。于是已经在线、
// 网关根本没拦的时候，这里也会"成功"读出一个 1，还被当成可信值。
// 那是个假信号 —— 门户的默认入口不反映你实际挂在哪个接入点。
//
// ⚠️ 探测用的客户端**不能跟随跳转**。默认的 http.Client 会自动跟到认证页，
// 拿回来的是 200、Location 为空，下面的 3xx 判断永远不成立——这一步曾经
// 因此整个是死代码。也不能用 c.http：指定了服务器 IP 时它会把外网探针
// 也拨到认证服务器上，问出来的又是门户默认的那个 1。
//
// 已经在线时访问外网不会被拦，拿不到跳转，这里返回空串 —— 这是
// 正常情况，交给后续兜底（并且兜底结果不会被标记为可信）。
//
// 几个探针并发发出，谁先读出编号就用谁的：都没被拦时总耗时是最慢的那一个，
// 而不是几个超时加起来。
func (c *SrunClient) discoverAcIDFromRedirect() string {
	probes := c.redirectProbes
	if len(probes) == 0 {
		return ""
	}
	client := noProxyClient(redirectProbeTimeout)

	// 带缓冲：提前返回后，剩下的探针照样能把结果放下，不会卡住协程。
	found := make(chan string, len(probes))
	for _, p := range probes {
		go func(p string) { found <- c.acIDFromProbe(client, p) }(p)
	}
	for range probes {
		if id := <-found; id != "" {
			return id
		}
	}
	return ""
}

// acIDFromProbe 请求一个探针，被网关拦下时从跳转里读 ac_id。
func (c *SrunClient) acIDFromProbe(client *http.Client, probe string) string {
	resp, err := client.Get(probe)
	if err != nil {
		return ""
	}
	loc := resp.Header.Get("Location")
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	_ = resp.Body.Close()

	// 只认 3xx 跳转。200 说明没被拦，那就是正常上网，不是校园网闸门。
	if resp.StatusCode/100 != 3 {
		return ""
	}

	if id := c.acIDFromLocation(probe, loc); id != "" {
		return id
	}
	// 有些网关不返回 Location 头，而是塞一个带 meta refresh /
	// JS 跳转的拦截页。这种也一起捞，否则在那些设备上就彻底瞎了。
	return acIDFromInterceptPage(string(body))
}

// acIDFromLocation 把可能是相对路径的 Location 补全后取 ac_id。
func (c *SrunClient) acIDFromLocation(requestURL, loc string) string {
	if loc == "" {
		return ""
	}
	if !strings.HasPrefix(loc, "http") {
		if base, err := url.Parse(requestURL); err == nil {
			if u, err := base.Parse(loc); err == nil {
				loc = u.String()
			}
		}
	}
	return acIDFromURL(loc)
}

// acIDFromInterceptPage 从被网关劫持后返回的拦截页里找跳转地址。
//
// 支持两种写法：
//   - <meta http-equiv="refresh" content="0;url=...">
//   - JS 里的 location.href = "..." / location.replace("...") / location.assign("...")
var (
	metaRefreshPattern = regexp.MustCompile(`(?i)http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=([^"'>\s]+)`)
	jsRedirectPattern  = regexp.MustCompile(`(?i)location(?:\.\s*(?:href|replace|assign)\s*=\s*|\s*\.\s*(?:replace|assign)\s*\(\s*)["']([^"']+)["']`)
)

func acIDFromInterceptPage(body string) string {
	if body == "" {
		return ""
	}
	for _, re := range []*regexp.Regexp{metaRefreshPattern, jsRedirectPattern} {
		for _, m := range re.FindAllStringSubmatch(body, -1) {
			if len(m) > 1 {
				if id := acIDFromURL(m[1]); id != "" {
					return id
				}
			}
		}
	}
	return ""
}

// discoverAcIDFromPortal 挨个问门户入口，挑一个"服务端认识"的编号。
//
// ⚠️ 这只是兜底，不要指望它准。
//
// 实测教训：深大门户对 1/2/3/4/5/10/12 这些编号全都返回完整登录页
// （8333 或 8334 字节，差 1 个字节），页面里也没有任何字段能说明
// "你现在挂在哪个接入点"。也就是说从页面这里**根本区分不出来**，
// 只能确定"这个编号是存在的"。
//
// 所以返回的只是一个"能用但未必对"的值。能拿到网关跳转时，
// 一定要走 discoverAcIDFromRedirect —— 那才是权威答案。
//
// 门户连不上时（校外、代理把域名解析抢走），第一个请求就会失败，
// 后面几个也一样，没必要每个都干等超时——直接放弃，交给最后的兜底。
func (c *SrunClient) discoverAcIDFromPortal() string {
	candidates := []string{}
	if c.lastAcID != "" {
		candidates = append(candidates, c.lastAcID)
	}
	candidates = append(candidates, defaultAcIDCandidates...)

	seen := map[string]bool{}
	for _, id := range candidates {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true

		ctx, cancel := context.WithTimeout(context.Background(), portalGuessTimeout)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet,
			c.Host+"/srun_portal_pc?ac_id="+url.QueryEscape(id)+"&theme=proyx", nil)
		if err != nil {
			cancel()
			return ""
		}
		resp, err := c.http.Do(req)
		if err != nil {
			cancel()
			return ""
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		_ = resp.Body.Close()
		cancel()
		if err != nil {
			continue
		}
		// 页面把我们传的编号原样回填，才算这个编号存在。
		if m := acIDPattern.FindSubmatch(body); m != nil && string(m[1]) == id {
			return id
		}
	}
	return ""
}

// defaultAcIDCandidates 是兜底试的接入点编号。
//
// ⚠️ 这些不是"正确答案"，只是常见值，而且大概率猜不到你真正在的那个。
// 真正该用的是网关跳转里那个。这里只保证"有个值能跑"，
// 结果带 AcIDSourceGuess 标记，调用方不该把它当定论缓存起来。
var defaultAcIDCandidates = []string{"1", "2", "3", "4", "5", "10", "12"}

// portalGuessTimeout 是兜底猜测时每个门户页的超时。门户页只有 8KB，
// 门户正常时远用不了这么久。
const portalGuessTimeout = 3 * time.Second

// AcIDSource 说明一个 ac_id 是怎么来的，决定它能被信任到什么程度。
type AcIDSource string

const (
	// AcIDSourceManual 用户显式指定。最高优先级，也是唯一"绝对可信"的。
	AcIDSourceManual AcIDSource = "manual"

	// AcIDSourceCache 这张网上次认证成功用过的，跟着成功结果来的。
	AcIDSourceCache AcIDSource = "cache"

	// AcIDSourceRedirect 未认证时被校园网网关拦下，从跳转地址里读出来的。
	// 这是自动发现里唯一可靠的来源。
	AcIDSourceRedirect AcIDSource = "redirect"

	// AcIDSourceGuess 只从门户页面试探出来的，只能说明"这个编号存在"，
	// **不能说明你就在这个接入点上**。不该缓存。
	AcIDSourceGuess AcIDSource = "guess"
)

// resolveAcIDWithSource 定出 ac_id，并说明它的可靠性来源。
//
// 可靠性从高到低：
//  1. 用户显式指定（--ac-id / 界面上手填）—— 说了算；
//  2. 这张网的上次成功值 —— 成功过一次，可信；
//  3. 网关跳转里的 —— 权威，能自动跟上换墙口/换线路；
//  4. 挨个试门户入口 —— 只证明编号存在，属于猜，不缓存；
//  5. "1" —— 最后兜底，同样不缓存。
func (c *SrunClient) resolveAcIDWithSource() (string, AcIDSource) {
	if c.AcID != "" {
		return c.AcID, AcIDSourceManual
	}
	if c.lastAcID != "" {
		return c.lastAcID, AcIDSourceCache
	}
	if id := c.discoverAcIDFromRedirect(); id != "" {
		return id, AcIDSourceRedirect
	}
	if id := c.discoverAcIDFromPortal(); id != "" {
		return id, AcIDSourceGuess
	}
	return "1", AcIDSourceGuess
}

// resolveAcID 只要值，不关心来源。
func (c *SrunClient) resolveAcID() string {
	id, _ := c.resolveAcIDWithSource()
	return id
}

// encodeUserInfo 构造登录请求里的 info 字段。
//
// 三步：用户信息转 JSON → 用 challenge 加密（XXTEA 变体）
// → 用深澜那副打乱的 Base64 字母表编码，最后加上 {SRBX1} 前缀。
func (c *SrunClient) encodeUserInfo(token, ip, acID string) (string, error) {
	info := srunUserInfo{
		Username: c.Username,
		Password: c.Password,
		IP:       ip,
		AcID:     acID,
		EncVer:   "srun_bx1",
	}

	// 字段顺序必须固定，所以用 struct 而不是 map。
	//
	// 另外这里必须关掉 HTML 转义：Go 的 json 默认会把 & < > 转成 \u0026 之类，
	// 而浏览器里的 JSON.stringify 不会。密码里含这几个字符时，
	// 两边算出来的密文不一致，服务端就会报解密失败。
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(info); err != nil {
		return "", fmt.Errorf("编码用户信息失败: %w", err)
	}
	raw := bytes.TrimRight(buf.Bytes(), "\n")

	encoded := crypto.Encode(string(raw), token)
	return "{SRBX1}" + crypto.Base64WithAlphaSet([]byte(encoded), crypto.SrunAlphaSet), nil
}

// get 发一个 GET 请求，并返回 JSONP 里的 JSON 部分。
// 请求出错时，错误里的地址只保留到路径，见 redactRequestError；
// secrets 是请求里带的机密，响应不是 JSONP 时不让它们随正文进错误，见 parseJSONP。
func (c *SrunClient) get(rawURL string, secrets ...string) ([]byte, error) {
	resp, err := c.http.Get(rawURL)
	if err != nil {
		return nil, redactRequestError(err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	return parseJSONP(body, secrets...)
}

// friendlySrunError 把服务端返回的错误码翻成能看懂的话，并给出常见原因。
// 这份对照关系来自官方 FAQ 和实际报错记录。
//
// 注意：服务端可能把关键信息放在 error / error_msg / suc_msg / res 任何一个
// 字段里。比如"IP 已在线""ac_id 不对"这两种情况，error 都是 ok，
// 只有 suc_msg 里才看得出区别，所以这里四个字段一起匹配。
func friendlySrunError(resp srunPortalResp) string {
	code := strings.ToLower(strings.Join([]string{
		resp.Error, resp.ErrorMsg, resp.SucMsg, resp.Res,
	}, " "))

	switch {
	case strings.Contains(code, "ip_already_online"):
		return "这个 IP 已经在线上，不用重复登录（同一个网络出口只能挂一个账号）"
	case strings.Contains(code, "already_online"):
		return "该账号已在线"
	case strings.Contains(code, "challenge_expire"):
		return "认证超时（challenge 过期）。网络太慢或者中途卡住了，重试一次即可"
	case strings.Contains(code, "bad_request_parameters"):
		return "学校服务器不认这组登录参数。如果反复出现，请把原始返回发给作者排查"
	case strings.Contains(code, "auth_info_error"):
		return "学校服务器没看懂这次认证请求（auth_info_error）。通常是 ac_id 或参数格式对不上"
	case strings.Contains(code, "ldap"):
		return "认证失败：密码不对（ldap auth error）。另外注意密码不要超过 16 位"
	case strings.Contains(code, "userid"):
		return "认证失败：账号不对（Rad:userid error）。账号是 6 位数的校园卡号"
	case strings.Contains(code, "ac-type"):
		return "认证失败：ac_id 用错了（Unknow ac-type）。可以在登录页「高级设置」里填接入点编号（命令行版用 --ac-id）"
	case strings.Contains(code, "ac_id"):
		return "认证失败：ac_id 用错了。可以在登录页「高级设置」里填接入点编号（教学区常见值：1；命令行版用 --ac-id）"
	case strings.Contains(code, "sign"):
		return "认证失败：校验和不对（sign error）。加密环节出错，请把原始返回发给作者排查"
	case strings.Contains(code, "decrypt"):
		return "认证失败：服务端解不开用户信息（decrypt error）。通常是加密实现有出入"
	case strings.Contains(code, "not_online"):
		return "账号当前不在线"
	case strings.Contains(code, "login_error"):
		return "认证失败：账号或密码不对（教学区用的是统一身份认证密码）"
	default:
		return fmt.Sprintf("认证失败：%s %s", resp.Error, resp.ErrorMsg)
	}
}
