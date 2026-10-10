package portal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultDrcomHost 是深大宿舍区的 Dr.COM 网页认证门户。
// 这是个内网地址，只有在宿舍区（或教工区）的网络里才连得上。
const DefaultDrcomHost = "http://172.30.255.42"

// DrcomClient 是 Dr.COM（ePortal）认证客户端，用于宿舍区 / 教工区。
//
// 和教学区的深澜相比，这套协议简单得多：一个 GET 请求带上账号密码就完事，
// 不需要任何加密运算。
type DrcomClient struct {
	Host     string
	Username string
	Password string
	ServerIP string

	http *http.Client
}

// NewDrcomClient 创建一个 Dr.COM 认证客户端。
func NewDrcomClient(host, username, password string) *DrcomClient {
	c := newDrcomClient(host, username, password)
	c.http = newHTTPClient(c.Host, "", 10*time.Second)
	return c
}

// newDrcomClient 只填字段，HTTP 客户端由调用方配（在线查询用不保活的那个）。
func newDrcomClient(host, username, password string) *DrcomClient {
	if host == "" {
		host = DefaultDrcomHost
	}
	return &DrcomClient{
		Host:     strings.TrimRight(host, "/"),
		Username: username,
		Password: password,
	}
}

// SetServerIP 指定认证服务器的 IP。
func (c *DrcomClient) SetServerIP(ip string) {
	c.ServerIP = ip
	c.http = newHTTPClient(c.Host, ip, 10*time.Second)
}

type drcomResp struct {
	Result   json.RawMessage `json:"result"`
	Msg      string          `json:"msg"`
	RetCode  json.RawMessage `json:"ret_code"`
	UserName string          `json:"user_name"`
	OnlineIP string          `json:"online_ip"`
}

// Login 执行一次 Dr.COM 网页认证。
func (c *DrcomClient) Login() (*Result, error) {
	return c.LoginContext(context.Background())
}

// LoginContext 让登录请求遵守调用方的截止时间和取消信号。
func (c *DrcomClient) LoginContext(ctx context.Context) (*Result, error) {
	q := url.Values{}
	q.Set("callback", "dr1003")
	q.Set("login_method", "1")
	// 这个 ",0," 前缀是 ePortal 的固定格式，表示账号类型，去掉会认证失败。
	q.Set("user_account", ",0,"+c.Username)
	q.Set("user_password", c.Password)
	// 下面这些留空或填 0，服务端会按请求来源自己判断。
	q.Set("wlan_user_ip", "")
	q.Set("wlan_user_ipv6", "")
	q.Set("wlan_user_mac", "000000000000")
	q.Set("wlan_ac_ip", "")
	q.Set("wlan_ac_name", "")
	q.Set("jsVersion", "4.1.3")
	q.Set("terminal_type", "1")
	q.Set("lang", "zh-cn")
	q.Set("v", "3685")

	// 查询串里是明文密码：get 已经把错误里的地址截掉了查询串，响应正文里
	// 出现密码时也整段不给出；这里再按密码兜一次底。
	body, err := c.getContext(ctx, c.Host+"/eportal/portal/login?"+q.Encode(), c.Password)
	if err != nil {
		return nil, scrubSecrets(fmt.Errorf("发送登录请求失败: %w", err), c.Password)
	}

	var resp drcomResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, scrubSecrets(fmt.Errorf("解析登录响应失败: %w", err), c.Password)
	}

	// 先对完整正文查密码，再截断，见 withholdSecrets。
	raw := truncate(withholdSecrets(string(body), c.Password), 400)

	if rawToString(resp.Result) == "1" {
		return &Result{OK: true, Message: "认证成功", Raw: raw}, nil
	}
	// 认不出的提示会原样拼进 Message 显示在界面上，同样不能带出密码。
	return &Result{OK: false, Message: friendlyDrcomMessage(withholdSecrets(resp.Msg, c.Password)), Raw: raw}, nil
}

// Logout 注销当前会话。
func (c *DrcomClient) Logout() (*Result, error) {
	q := url.Values{}
	q.Set("callback", "dr1003")
	q.Set("login_method", "1")
	q.Set("user_account", ",0,"+c.Username)

	body, err := c.get(c.Host + "/eportal/portal/logout?" + q.Encode())
	if err != nil {
		return nil, fmt.Errorf("发送注销请求失败: %w", err)
	}

	var resp drcomResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析注销响应失败: %w", err)
	}

	raw := truncate(string(body), 400)
	if rawToString(resp.Result) == "1" {
		return &Result{OK: true, Message: "已注销下线", Raw: raw}, nil
	}
	return &Result{OK: false, Message: friendlyDrcomMessage(resp.Msg), Raw: raw}, nil
}

// Status 按请求出口查询宿舍区在线情况，不需要账号密码。
// 解析失败或缺少状态字段时返回错误，避免把未知误报为离线。
func (c *DrcomClient) Status() (*OnlineStatus, error) {
	u := fmt.Sprintf("%s/eportal/portal/rad_user_info?callback=dr1003&_=%d", c.Host, time.Now().Unix())
	body, err := c.get(u)
	if err != nil {
		return nil, fmt.Errorf("查询在线状态失败: %w", err)
	}

	var resp drcomResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析在线状态失败: %w", err)
	}
	result := rawToString(resp.Result)
	if result != "0" && result != "1" {
		return nil, fmt.Errorf("在线状态响应缺少有效的 result 字段")
	}

	return &OnlineStatus{
		Online:   result == "1",
		Username: resp.UserName,
		IP:       resp.OnlineIP,
		Zone:     ZoneDorm,
		Raw:      truncate(string(body), 300),
	}, nil
}

// get 发一个 GET 请求，并返回 JSONP 里的 JSON 部分。
// 请求出错时，错误里的地址只保留到路径，见 redactRequestError；
// secrets 是请求里带的机密，响应不是 JSONP 时不让它们随正文进错误，见 parseJSONP。
func (c *DrcomClient) get(rawURL string, secrets ...string) ([]byte, error) {
	return c.getContext(context.Background(), rawURL, secrets...)
}

func (c *DrcomClient) getContext(ctx context.Context, rawURL string, secrets ...string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, redactRequestError(err)
	}
	resp, err := c.http.Do(req)
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

// rawToString 把可能是字符串、也可能是数字的 JSON 字段统一成字符串。
// ePortal 的返回里 result 有时是 "1"，有时是 1，不统一。
func rawToString(r json.RawMessage) string {
	return strings.Trim(strings.TrimSpace(string(r)), `"`)
}

// friendlyDrcomMessage 把宿舍区服务端返回的提示翻成能看懂的话和下一步动作。
// 这些都是官方 FAQ 里记录过的原文提示。
func friendlyDrcomMessage(msg string) string {
	switch {
	case strings.Contains(msg, "尚未办理"):
		return "认证失败：还没办理校内上网套餐。去自助服务查一下套餐、以及校园卡「通用代扣费账户」余额"
	case strings.Contains(msg, "停机"):
		return "认证失败：账号已停机，套餐到期了。去自助服务续订（每月 1 日系统会自动断网）"
	case strings.Contains(msg, "不存在"):
		return "认证失败：账号不存在。账号必须是 6 位数的校园卡号，不是学号"
	case strings.Contains(msg, "密码"):
		return "认证失败：密码错误。这里要用统一身份认证密码"
	case strings.Contains(msg, "已在线"), strings.Contains(msg, "在线"):
		return "该账号已在线，无需重复认证"
	case msg == "":
		return "认证失败：服务端没有说明原因，稍后重试一次；命令行版可以加 --verbose 看原始返回"
	default:
		return "认证失败：" + msg
	}
}
