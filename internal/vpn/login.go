package vpn

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	utls "github.com/refraction-networking/utls"
)

// webLogin 走 Web 登录流程，返回 TWFID。
// 深大同款深信服网关的响应是 XML 片段，字段名来自对网关响应的直接观察。
func webLogin(server, username, password string) (string, error) {
	base := "https://" + server
	c := httpClient()

	logf("info", "连接 %s ……", server)
	resp, err := c.Get(base + "/por/login_auth.csp?apiversion=1")
	if err != nil {
		return "", err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	page := string(body)

	sub := func(re *regexp.Regexp) string {
		m := re.FindStringSubmatch(page)
		if m == nil {
			return ""
		}
		return m[1]
	}
	twfId := sub(reTwfID)
	if twfId == "" {
		return "", errors.New("登录页没有返回 TwfID，可能不是深信服网关：" + firstLine(body))
	}
	logf("info", "已获取登录会话")

	rsaKey := sub(reRSAKey)
	rsaExp := sub(reRSAExp)
	if rsaExp == "" {
		rsaExp = "65537"
	}
	csrfCode := sub(reCSRF)
	if csrfCode != "" {
		password += "_" + csrfCode
	} else {
		logf("warn", "登录页没有 CSRF 码，可能是老版本网关")
	}

	pub := rsa.PublicKey{}
	pub.E, _ = strconv.Atoi(rsaExp)
	n := big.Int{}
	if _, ok := n.SetString(rsaKey, 16); !ok {
		return "", errors.New("RSA 模数解析失败")
	}
	pub.N = &n
	enc, err := rsa.EncryptPKCS1v15(rand.Reader, &pub, []byte(password))
	if err != nil {
		return "", err
	}

	logf("info", "提交账号凭据 ……")
	form := url.Values{
		"svpn_rand_code":    {""},
		"mitm":              {""},
		"svpn_req_randcode": {csrfCode},
		"svpn_name":         {username},
		"svpn_password":     {hex.EncodeToString(enc)},
	}
	req, _ := http.NewRequest("POST", base+"/por/login_psw.csp?anti_replay=1&encrypt=1&type=cs",
		strings.NewReader(form.Encode()))
	req.Header.Set("Cookie", "TWFID="+twfId)
	resp, err = c.Do(req)
	if err != nil {
		return "", err
	}
	body, _ = io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	page = string(body)

	// 二步验证：短信
	if strings.Contains(page, "<NextService>auth/sms</NextService>") || strings.Contains(page, "<NextAuth>2</NextAuth>") {
		logf("info", "服务器要求短信验证码，正在触发下发 ……")
		req, _ = http.NewRequest("POST", base+"/por/login_sms.csp?apiversion=1", nil)
		req.Header.Set("Cookie", "TWFID="+twfId)
		resp, err = c.Do(req)
		if err != nil {
			return "", err
		}
		body, _ = io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		p := string(body)
		if !strings.Contains(p, "验证码已发送到您的手机") && !strings.Contains(p, "<USER_PHONE>") {
			return "", errors.New("短信触发响应异常：" + firstLine(body))
		}
		return twfId, ErrNextAuthSMS
	}

	// 二步验证：TOTP
	if strings.Contains(page, "<NextService>auth/token</NextService>") || strings.Contains(page, "<NextServiceSubType>totp</NextServiceSubType>") {
		return twfId, ErrNextAuthTOTP
	}

	if strings.Contains(page, "<NextAuth>-1</NextAuth>") || !strings.Contains(page, "<NextAuth>") {
		// 无需附加验证
	} else {
		return "", errors.New("暂不支持的附加验证：" + firstLine(body))
	}

	if !strings.Contains(page, "<Result>1</Result>") {
		return "", errors.New("登录失败：" + firstLine(body))
	}
	if m := reTwfID.FindStringSubmatch(page); m != nil {
		twfId = m[1]
	}
	logf("ok", "Web 登录成功")
	return twfId, nil
}

// authSms 提交短信验证码，成功后返回新的 TWFID。
func authSms(server, twfId, code string) (string, error) {
	c := httpClient()
	form := url.Values{"svpn_inputsms": {code}}
	req, _ := http.NewRequest("POST", "https://"+server+"/por/login_sms1.csp?apiversion=1",
		strings.NewReader(form.Encode()))
	req.Header.Set("Cookie", "TWFID="+twfId)
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	page := string(body)
	if !strings.Contains(page, "Auth sms suc") {
		return "", errors.New("短信验证码校验失败：" + firstLine(body))
	}
	m := reTwfID.FindStringSubmatch(page)
	if m == nil {
		return "", errors.New("短信验证通过但响应里没有 TwfID")
	}
	logf("ok", "短信验证通过")
	return m[1], nil
}

// authTOTP 提交动态口令，成功后返回新的 TWFID。
func authTOTP(server, twfId, code string) (string, error) {
	c := httpClient()
	form := url.Values{"svpn_inputtoken": {code}}
	req, _ := http.NewRequest("POST", "https://"+server+"/por/login_token.csp",
		strings.NewReader(form.Encode()))
	req.Header.Set("Cookie", "TWFID="+twfId)
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	page := string(body)
	if !strings.Contains(page, "suc") {
		return "", errors.New("动态口令校验失败：" + firstLine(body))
	}
	m := reTwfID.FindStringSubmatch(page)
	if m == nil {
		return "", errors.New("口令验证通过但响应里没有 TwfID")
	}
	logf("ok", "动态口令验证通过")
	return m[1], nil
}

// ecAgentToken 用 TWFID 明文 HTTP 探针换 ECAgent token。
// 关键点：TLS ServerHello 的 SessionId 就是 token 前半段（深信服的暗号），
// 必须用 uTLS 才能读到握手层原始数据。
func ecAgentToken(server, twfId string) (string, error) {
	logf("info", "获取 ECAgent token ……")
	dialConn, err := net.Dial("tcp", server)
	if err != nil {
		return "", err
	}
	defer dialConn.Close()
	conn := utls.UClient(dialConn, &utls.Config{InsecureSkipVerify: true}, utls.HelloGolang)
	defer conn.Close()

	req := "GET /por/conf.csp HTTP/1.1\r\nHost: " + server + "\r\nCookie: TWFID=" + twfId + "\r\n\r\n" +
		"GET /por/rclist.csp HTTP/1.1\r\nHost: " + server + "\r\nCookie: TWFID=" + twfId + "\r\n\r\n"
	if _, err := io.WriteString(conn, req); err != nil {
		return "", err
	}
	buf, err := readAll(conn, 1<<20)
	if err != nil && len(buf) == 0 {
		return "", err
	}
	if len(buf) == 0 {
		return "", errors.New("ECAgent 探针没有任何响应")
	}
	return agentTokenFromSessionID(conn.HandshakeState.ServerHello.SessionId, len(buf))
}

// agentTokenFromSessionID 把 ServerHello 的 SessionId 换成 token 前半段：
// 十六进制的前 31 个字符再补一个 \x00，正好 32 字节。
//
// SessionId 不足 16 字节时十六进制不够 31 个字符，直接切片会 panic。
// 网关升级后返回长度一变，panic 发生在连接请求的处理协程里，界面那边的
// 「连接中」标记就再也没人复位了。所以这里先查长度，给明确的错误。
func agentTokenFromSessionID(sessionID []byte, respLen int) (string, error) {
	if len(sessionID) < 16 {
		return "", fmt.Errorf("ECAgent 握手的 SessionId 只有 %d 字节（应至少 16 字节），网关协议可能变了", len(sessionID))
	}
	logf("ok", "ECAgent token 获取成功（响应 %d 字节）", respLen)
	return hex.EncodeToString(sessionID)[:31] + "\x00", nil
}

// httpClient 带自签证书放行。
func httpClient() *http.Client {
	return &http.Client{Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}}
}

var (
	reTwfID  = regexp.MustCompile(`<TwfID>(.*)</TwfID>`)
	reRSAKey = regexp.MustCompile(`<RSA_ENCRYPT_KEY>(.*)</RSA_ENCRYPT_KEY>`)
	reRSAExp = regexp.MustCompile(`<RSA_ENCRYPT_EXP>(.*)</RSA_ENCRYPT_EXP>`)
	reCSRF   = regexp.MustCompile(`<CSRF_RAND_CODE>(.*)</CSRF_RAND_CODE>`)
)
