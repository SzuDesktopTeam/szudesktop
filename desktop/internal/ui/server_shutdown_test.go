package ui

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/credential"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// net/http 的 Serve 在 Shutdown 一开始就返回。Run 以前随即返回、进程退出，
// 还在执行的请求（写存档、登录）会被直接掐断。现在 Run 要等排空结束。
func TestRunWaitsForInFlightRequestsOnShutdown(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SZUNET_CONFIG_DIR", dir)
	s := New(Options{NoOpen: true})
	s.store = &statusTestStore{err: credential.ErrNotFound}
	s.vpn = quietVPN() // campusvpn 构建下 Run 会检查残留代理，测试不能碰真实设置
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	s.detect = func() *portal.DetectResult {
		once.Do(func() { close(entered) })
		<-release
		return &portal.DetectResult{Zone: portal.ZoneOutside}
	}
	runErr := make(chan error, 1)
	go func() { runErr <- s.Run() }()

	var base, token string
	for deadline := time.Now().Add(5 * time.Second); base == ""; time.Sleep(20 * time.Millisecond) {
		var record instanceRecord
		if data, err := os.ReadFile(filepath.Join(dir, "desktop-instance.json")); err == nil && json.Unmarshal(data, &record) == nil {
			base, token = record.URL, record.Token
		}
		if base == "" && time.Now().After(deadline) {
			t.Fatal("server did not publish its address")
		}
	}
	statusCode := make(chan int, 1)
	go func() {
		req, _ := http.NewRequest(http.MethodGet, base+"/api/status", nil)
		req.Header.Set(apiTokenHeader, token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			statusCode <- -1
			return
		}
		resp.Body.Close()
		statusCode <- resp.StatusCode
	}()
	<-entered
	req, _ := http.NewRequest(http.MethodPost, base+"/api/shutdown", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(apiTokenHeader, token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	select {
	case err := <-runErr:
		t.Fatalf("Run returned while a request was still running: %v", err)
	case <-time.After(500 * time.Millisecond):
	}
	close(release)
	if code := <-statusCode; code != http.StatusOK {
		t.Fatalf("in-flight request was cut off: %d", code)
	}
	select {
	case err := <-runErr:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Run did not return after draining")
	}
	if _, err := os.Stat(filepath.Join(dir, "desktop-instance.json")); !os.IsNotExist(err) {
		t.Fatalf("discovery file must be removed on exit: %v", err)
	}
}
