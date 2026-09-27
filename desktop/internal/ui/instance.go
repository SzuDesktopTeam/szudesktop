package ui

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

type instanceRecord struct {
	URL   string `json:"url"`
	Token string `json:"token"`
}
type desktopInstance struct {
	instanceRecord
	path    string
	release func()
}

// instanceWaitBudget 是锁被别的进程占着时，等它发布地址并应答的总时长。
//
// 以前按 40 次 ×（1 秒 HTTP 超时 + 100 毫秒）计数，最坏要 44 秒；而 Electron
// 外壳 15 秒（sidecar.mjs 的 readyTimeoutMs）没等到地址就判启动超时并杀掉进程，
// 「启动失败: <原因>」这一行根本来不及写出来。改成总截止时间，
// 必须明显短于那 15 秒；测试会把它调短。
var instanceWaitBudget = 8 * time.Second

// instanceRetryDelay 是两次读发现文件之间的间隔。
const instanceRetryDelay = 100 * time.Millisecond

// errInstanceBusy 是锁被占着、对方却迟迟不应答时给用户的原因（多半是刚退出又立刻重开，
// 或上一份还没启动完）。main 会把它写成单行「启动失败: <原因>」交给外壳；
// 这不是装坏了，外壳据此提示稍后再开，而不是劝人重装。
var errInstanceBusy = errors.New("应用正在启动或退出，请稍后再打开")

// The OS lock survives stale discovery files, but is released after a crash.
func acquireInstance(dir string, open bool) (*desktopInstance, bool, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, false, err
	}
	release, owned, err := tryInstanceLock(filepath.Join(dir, "desktop-instance.lock"))
	if err != nil {
		return nil, false, err
	}
	path := filepath.Join(dir, "desktop-instance.json")
	if owned {
		// 这份 token 同时是本次运行的 API 凭据（Run 会把它交给 Server），见 api_guard.go。
		return &desktopInstance{instanceRecord: instanceRecord{Token: newAPIToken()}, path: path, release: release}, false, nil
	}
	// The first process may still be starting and publishing its endpoint.
	// 整个等待有总截止时间，每次应答请求的超时也不超过剩下的时间。
	deadline := time.Now().Add(instanceWaitBudget)
	for {
		if data, err := os.ReadFile(path); err == nil {
			var record instanceRecord
			if json.Unmarshal(data, &record) == nil && activateInstance(record, open, time.Until(deadline)) == nil {
				// Return the authenticated endpoint for an enclosing desktop shell.
				// This borrowed record owns neither the lock nor the running service.
				return &desktopInstance{instanceRecord: record}, true, nil
			}
		}
		if time.Until(deadline) < instanceRetryDelay {
			// 不会另外启动一份后台服务：锁还在对方手里。
			return nil, false, errInstanceBusy
		}
		time.Sleep(instanceRetryDelay)
	}
}
func (i *desktopInstance) publish(address string) error {
	i.URL = address
	data, err := json.Marshal(i.instanceRecord)
	if err != nil {
		return err
	}
	return os.WriteFile(i.path, data, 0600)
}
func (i *desktopInstance) close() { _ = os.Remove(i.path); i.release() }

// activateInstance 请已在运行的实例把窗口带到前面。timeout 是这次请求最多能用的时间，
// 单次不超过 1 秒；已经没有剩余时间就直接放弃。
func activateInstance(record instanceRecord, open bool, timeout time.Duration) error {
	u, err := url.Parse(record.URL)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Port() == "" {
		return errors.New("无效的本机地址")
	}
	ip := net.ParseIP(u.Hostname())
	if ip == nil || !ip.IsLoopback() || !validAPIToken(record.Token) {
		return errors.New("无效的本机实例")
	}
	timeout = min(timeout, time.Second)
	if timeout <= 0 {
		return errors.New("等待本机实例应答超时")
	}
	body, _ := json.Marshal(map[string]any{"token": record.Token, "open": open})
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Post(record.URL+"/api/instance", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("实例响应 %d", response.StatusCode)
	}
	return nil
}
func (s *Server) handleInstance(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
		Open  bool   `json:"open"`
	}
	if s.instance == nil || json.NewDecoder(r.Body).Decode(&in) != nil || subtle.ConstantTimeCompare([]byte(in.Token), []byte(s.instance.Token)) != 1 {
		writeAPIError(w, http.StatusForbidden, errors.New("实例校验失败"))
		return
	}
	s.windows.reopen(time.Now())
	if in.Open {
		// 再次双击便携版：同样带一次性的 launch 参数，新开的页面才拿得到会话 Cookie。
		if err := openBrowser(s.launchURL(s.instance.URL)); err != nil {
			writeAPIError(w, 500, err)
			return
		}
	}
	writeJSON(w, map[string]bool{"ok": true})
}
