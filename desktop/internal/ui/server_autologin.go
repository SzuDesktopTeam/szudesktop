package ui

import (
	"fmt"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// autoLoginResult 是启动时自动连接校园网的结果，经 /api/status 的 auto_login 交给页面。
type autoLoginResult struct {
	Result  string `json:"result"`  // skipped / ok / failed
	Message string `json:"message"` // 已脱敏，可以直接显示
	At      int64  `json:"at"`      // unix 秒
}

const (
	autoLoginSkipped = "skipped"
	autoLoginOK      = "ok"
	autoLoginFailed  = "failed"
)

// runAutoLogin 在启动时按需自动连接一次校园网。
//
//   - 没保存账号（也没用 -u/-p 传入）就不算尝试，页面上也不提示；
//   - 本机已经在线就跳过：否则每次开机都重复认证，宿舍区一个账号只允许
//     一台设备在线，笔记本一开应用就可能把台式机挤下线；
//   - 认不出校园网认证门户（例如在校外）同样跳过，不算失败；
//   - 结果写进 /api/status，不再只打到没人看的标准输出。
func (s *Server) runAutoLogin() {
	result, attempted := s.autoLoginOnce()
	if !attempted {
		fmt.Println("[自动登录] 没有保存校园网账号，跳过")
		return
	}
	s.mu.Lock()
	s.autoLogin = &result
	s.mu.Unlock()
	if result.Result == autoLoginFailed {
		fmt.Printf("[自动登录失败] %s\n", result.Message)
	} else {
		fmt.Printf("[自动登录] %s\n", result.Message)
	}
}

// autoLoginOnce 做判断和认证；第二个返回值为 false 表示没有尝试。
func (s *Server) autoLoginOnce() (autoLoginResult, bool) {
	user, pass, err := s.creds()
	if err != nil {
		return autoLoginResult{}, false
	}
	result := autoLoginResult{Result: autoLoginSkipped}
	if st := s.networkState(); st.onlineErr == nil && st.online != nil && st.online.Online {
		result.Message = "本机已在校园网在线，启动时没有重复认证"
	} else if zone := s.loginZone(""); zone != portal.ZoneTeaching && zone != portal.ZoneDorm {
		result.Message = "没有检测到校园网认证门户，启动时没有尝试认证"
	} else {
		res := s.doLogin(user, pass, string(zone), "")
		result.Result = autoLoginOK
		if !res.OK {
			result.Result = autoLoginFailed
		}
		result.Message = scrubSecret(res.Message, pass)
	}
	result.At = time.Now().Unix()
	return result, true
}
