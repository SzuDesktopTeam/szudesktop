//go:build campusvpn

package ui

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/sysproxy"
)

func TestNormalizeVPNServer(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
		bad  bool
	}{
		{name: "default", in: "", want: defaultVPNServer},
		{name: "hostname", in: "ssl.szu.edu.cn", want: "ssl.szu.edu.cn:443"},
		{name: "host and port", in: "svpn.szu.edu.cn:8443", want: "svpn.szu.edu.cn:8443"},
		{name: "https URL", in: "https://ssl.szu.edu.cn/", want: "ssl.szu.edu.cn:443"},
		{name: "page path rejected", in: "https://ssl.szu.edu.cn/portal", bad: true},
		{name: "bad port rejected", in: "ssl.szu.edu.cn:99999", bad: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeVPNServer(tt.in)
			if tt.bad {
				if err == nil {
					t.Fatalf("normalizeVPNServer(%q) unexpectedly succeeded: %q", tt.in, got)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("normalizeVPNServer(%q) = %q, %v; want %q", tt.in, got, err, tt.want)
			}
		})
	}
}

func TestSocksAddressAlwaysUsesLoopback(t *testing.T) {
	got, err := socksAddress(7891)
	if err != nil {
		t.Fatal(err)
	}
	if got != "127.0.0.1:7891" {
		t.Fatalf("socksAddress(7891) = %q", got)
	}
	for _, port := range []int{-1, 80, 65536} {
		if _, err := socksAddress(port); err == nil {
			t.Fatalf("socksAddress(%d) unexpectedly succeeded", port)
		}
	}
}

func TestVPNLogRingKeepsNewestEntries(t *testing.T) {
	m := &vpnManager{}
	for i := 0; i < maxVPNLogs+7; i++ {
		m.appendLog("info", "entry")
	}
	if len(m.logs) != maxVPNLogs {
		t.Fatalf("got %d logs, want %d", len(m.logs), maxVPNLogs)
	}
}

func TestVPNStatusDoesNotExposePassword(t *testing.T) {
	s := &Server{vpn: newVPNManager()}
	rec := httptest.NewRecorder()
	s.handleVPNStatus(rec, httptest.NewRequest(http.MethodGet, "/api/vpn/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for key := range body {
		switch strings.ToLower(key) {
		case "password", "passwd", "pwd", "token", "twfid":
			t.Fatalf("sensitive field leaked: %s", key)
		}
	}
	if body["socks_addr"] != "127.0.0.1:7891" {
		t.Fatalf("unexpected socks_addr: %v", body["socks_addr"])
	}
}

func TestVPNProxyRejectsEnableBeforeConnection(t *testing.T) {
	s := &Server{vpn: newVPNManager()}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/vpn/proxy", strings.NewReader(`{"enabled":true}`))
	s.handleVPNProxy(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != false || body["message"] == "" {
		t.Fatalf("unexpected body: %#v", body)
	}
}

func TestVPNConnectRejectsBadInputWithoutNetwork(t *testing.T) {
	s := &Server{vpn: newVPNManager()}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/vpn/connect", strings.NewReader(`{
		"server":"https://ssl.szu.edu.cn/not-a-server",
		"socks_port":7891,
		"username":"123456",
		"password":"not-real"
	}`))
	s.handleVPNConnect(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "服务器") {
		t.Fatalf("unclear error: %s", rec.Body.String())
	}
}

// fakeProxy 记录对系统代理的操作，替代真实的注册表读写。
//
// state.Managed 模拟 sysproxy 的所有权判断（有备份、且当前设置就是我们写的）；
// recoverStale 按 sysproxy.RecoverStale 的口径：是我们的才还原，否则只丢掉过期备份。
type fakeProxy struct {
	backup    bool
	state     sysproxy.State
	listening bool
	disabled  int // Disable 被调的次数
	restored  int // RecoverStale 真的改了系统设置的次数
	dropped   int // RecoverStale 只丢掉过期备份的次数
}

func (f *fakeProxy) ops() proxyOps {
	return proxyOps{
		query: func() sysproxy.State { return f.state },
		recoverStale: func() (bool, error) {
			if !f.backup {
				return false, nil
			}
			f.backup = false
			if f.state.Managed {
				f.restored++
				return true, nil
			}
			f.dropped++
			return false, nil
		},
		disable:   func() error { f.disabled++; return nil },
		listening: func(string) bool { return f.listening },
	}
}

// quietVPN 给要跑真实 Run() 的测试用：不读也不写开发机的系统代理。
func quietVPN() *vpnManager {
	m := newVPNManager()
	m.proxy = (&fakeProxy{}).ops()
	return m
}

func TestVPNShutdownWithoutConnectionTouchesNothing(t *testing.T) {
	// 本进程没建立过连接时，退出不能去动系统代理（可能是用户自己的设置）。
	proxy := &fakeProxy{backup: true, state: sysproxy.State{Enabled: true, Server: "socks=127.0.0.1:7891"}}
	m := &vpnManager{proxy: proxy.ops()}
	m.shutdown()
	(*vpnManager)(nil).shutdown()
	if proxy.disabled != 0 {
		t.Fatalf("shutdown without a connection restored the proxy %d times", proxy.disabled)
	}
}

// 残留代理的自动还原只在“备份在、代理还是我们写的那份、端口没人监听”时发生；
// 用户在这期间改过代理时只丢掉过期备份，不碰他的新设置。所有权判断全在
// sysproxy（见 TestShouldRestore），这里只守桌面端多出来的那道“端口还有人用”检查。
// 构造管理器本身（ui.New() 在拿单实例锁之前就会调用）一律不碰系统代理。
func TestVPNRecoverLeftoverOnlyRestoresDeadLoopbackProxy(t *testing.T) {
	ours := sysproxy.State{Supported: true, Enabled: true, Server: "socks=127.0.0.1:7891", Managed: true}
	userProxy := sysproxy.State{Supported: true, Enabled: true, Server: "proxy.example.com:8080"}
	for _, tc := range []struct {
		name         string
		proxy        fakeProxy
		wantRestored int
		wantDropped  int
		wantBackup   bool
		wantLog      string
	}{
		{name: "no backup", proxy: fakeProxy{state: sysproxy.State{Supported: true, Enabled: true, Server: "socks=127.0.0.1:7891"}}},
		{name: "stale proxy", proxy: fakeProxy{backup: true, state: ours}, wantRestored: 1, wantLog: "已自动恢复原设置"},
		{name: "port still served", proxy: fakeProxy{backup: true, state: ours, listening: true}, wantBackup: true, wantLog: "仍有程序在监听"},
		{name: "user changed proxy", proxy: fakeProxy{backup: true, state: userProxy}, wantDropped: 1},
		{name: "user proxy on a live loopback port", proxy: fakeProxy{backup: true, state: userProxy, listening: true}, wantDropped: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			proxy := tc.proxy
			m := &vpnManager{proxy: proxy.ops()}
			m.recoverLeftover()
			if proxy.restored != tc.wantRestored || proxy.dropped != tc.wantDropped || proxy.backup != tc.wantBackup {
				t.Fatalf("restored=%d dropped=%d backup=%v, want %d %d %v", proxy.restored, proxy.dropped, proxy.backup, tc.wantRestored, tc.wantDropped, tc.wantBackup)
			}
			if proxy.disabled != 0 {
				t.Fatalf("启动善后应走 RecoverStale，不该直接调 Disable（%d 次）", proxy.disabled)
			}
			var logs []string
			for _, l := range m.logs {
				logs = append(logs, l.Message)
			}
			joined := strings.Join(logs, " | ")
			if tc.wantLog == "" && joined != "" || !strings.Contains(joined, tc.wantLog) {
				t.Fatalf("日志 %q，期望含 %q", joined, tc.wantLog)
			}
		})
	}
	// 零值管理器（没配 proxyOps）和 nil 都不能炸。
	(&vpnManager{}).recoverLeftover()
	(*vpnManager)(nil).recoverLeftover()
}

// 登录失败后 busy 必须放下（go-core-12）：否则之后每次连接都报“已在连接或运行”，
// 只能手动断开才能恢复。busy 由 defer 放下，panic 时同样生效。
func TestVPNConnectFailureReleasesBusy(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close() // 端口关掉：连接会被立刻拒绝，不走外网
	m := quietVPN()
	for i := 0; i < 2; i++ {
		_, err := m.connect(vpnConnectReq{Server: addr, SocksPort: 7891, Username: "123456", Password: "not-real"})
		if err == nil {
			t.Fatal("连不上的服务器不该报成功")
		}
		if strings.Contains(err.Error(), "已在连接或运行") {
			t.Fatalf("第 %d 次连接被上一次没放下的 busy 挡住了：%v", i+1, err)
		}
		m.mu.Lock()
		busy, running := m.busy, m.running
		m.mu.Unlock()
		if busy || running {
			t.Fatalf("登录失败后 busy=%v running=%v，应该都放下", busy, running)
		}
	}
	// 被新的连接或断开取代的旧操作不能去动新一代的状态。
	m.mu.Lock()
	m.generation++
	m.busy = true
	gen := m.generation
	m.mu.Unlock()
	m.releaseBusy(gen - 1)
	if !m.busy {
		t.Fatal("过期的 releaseBusy 把新一代的 busy 放下了")
	}
	m.releaseBusy(gen)
	if m.busy {
		t.Fatal("本代的 releaseBusy 应该放下 busy")
	}
}
