package ui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// writeAPIError 是所有 /api 错误的统一出口：{"ok":false,"message":"..."}。
//
// 默认构建和 campusvpn 构建共用这一份。以前两个 VPN 文件各写一份，
// 改了其中一份，另一份在 CI 里根本不参与编译，两边行为已经悄悄分叉过。
func writeAPIError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]any{"ok": false, "message": err.Error()})
}

// portalErrorMessage 把认证门户请求失败翻成给人看的文案，action 是“认证”或“注销”，
// secret 是本次用的密码。
//
// ⚠️ 网络层错误绝不能把 err.Error() 原样交给页面：net/http 的 *url.Error 会带出完整请求地址，
// 宿舍区 Dr.COM 的登录地址里有明文 user_password，教学区的地址里有账号和口令摘要。
// 这段文本会显示在网络页上、缓存进 /api/status 的 last_error，学生截图求助时就一起发出去了。
// 所以网络错误一律换成固定文案；门户自己回的错误（如“服务端没有返回 challenge（error=…）”）
// 不带地址、对排查有用，去掉密码后保留原文。
func portalErrorMessage(action string, err error, secret string) string {
	var dnsErr *net.DNSError
	var netErr net.Error
	var opErr *net.OpError
	var urlErr *url.Error
	switch {
	case errors.As(err, &dnsErr):
		return action + "失败：解析不到认证门户的地址。请确认已连接校园网；开着代理或加速器时先关掉再试"
	case errors.Is(err, context.DeadlineExceeded) || errors.Is(err, os.ErrDeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()):
		return action + "失败：认证门户响应超时，高峰期较常见。请稍后重试，或运行网络诊断"
	case errors.As(err, &opErr) && opErr.Op == "dial":
		return action + "失败：连不上认证门户。请确认已连接校园网，或手动选择教学区 / 宿舍区后重试"
	case errors.As(err, &urlErr) || errors.As(err, &opErr) || errors.Is(err, io.ErrUnexpectedEOF):
		return action + "失败：与认证门户的连接中断了。请稍后重试，或运行网络诊断"
	}
	detail := strings.TrimSpace(scrubSecret(err.Error(), secret))
	// 包装时没用 %w 的话，地址可能混在文本里；带地址的一律不透传。
	if detail == "" || strings.Contains(detail, "://") || strings.Contains(detail, "user_password") {
		return action + "失败：认证门户的响应无法识别，可能正在维护。请稍后重试，或运行网络诊断"
	}
	if runes := []rune(detail); len(runes) > 200 {
		detail = string(runes[:200]) + "…"
	}
	return action + "失败：" + detail
}

// scrubSecret 是最后一道保险：门户提示原样透传时，也不让本次用的密码
// 出现在页面、状态缓存或日志里。
func scrubSecret(msg, secret string) string {
	if secret == "" {
		return msg
	}
	msg = strings.ReplaceAll(msg, secret, "***")
	if escaped := url.QueryEscape(secret); escaped != secret {
		msg = strings.ReplaceAll(msg, escaped, "***")
	}
	return msg
}
