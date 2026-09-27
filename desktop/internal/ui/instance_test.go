package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestInstanceLockAndStaleRecord(t *testing.T) {
	dir := t.TempDir()
	first, existing, err := acquireInstance(dir, false)
	if err != nil || existing {
		t.Fatalf("first instance: %v %v", existing, err)
	}
	release, owned, err := tryInstanceLock(filepath.Join(dir, "desktop-instance.lock"))
	if err != nil || owned {
		if release != nil {
			release()
		}
		t.Fatalf("second acquired lock: %v %v", owned, err)
	}
	first.close()
	if err := os.WriteFile(filepath.Join(dir, "desktop-instance.json"), []byte("stale"), 0600); err != nil {
		t.Fatal(err)
	}
	next, existing, err := acquireInstance(dir, false)
	if err != nil || existing {
		t.Fatalf("stale discovery blocks restart: %v %v", existing, err)
	}
	next.close()
}
func TestInstanceRejectsUntrustedEndpoints(t *testing.T) {
	for _, address := range []string{"https://127.0.0.1:80", "http://example.com:80", "http://127.0.0.1:80/path", "http://user@127.0.0.1:80", "http://127.0.0.1:80?q=x", "http://127.0.0.1:80#fragment"} {
		if activateInstance(instanceRecord{URL: address, Token: string(make([]byte, 64))}, false, time.Second) == nil {
			t.Fatal("accepted", address)
		}
	}
}

func TestInstanceReuseReturnsVerifiedEndpoint(t *testing.T) {
	dir := t.TempDir()
	first, existing, err := acquireInstance(dir, false)
	if err != nil || existing {
		t.Fatalf("first instance: %v %v", existing, err)
	}
	defer first.close()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Token string `json:"token"`
			Open  bool   `json:"open"`
		}
		if r.URL.Path != "/api/instance" || r.Method != http.MethodPost || json.NewDecoder(r.Body).Decode(&request) != nil || request.Token != first.Token || request.Open {
			http.Error(w, "unexpected activation", http.StatusForbidden)
			return
		}
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	if err := first.publish(server.URL); err != nil {
		t.Fatal(err)
	}
	reused, existing, err := acquireInstance(dir, false)
	if err != nil || !existing {
		t.Fatalf("reuse: %v %v", existing, err)
	}
	if reused == nil || reused.URL != server.URL {
		t.Fatal("verified reused endpoint was not returned")
	}
	if reused.release != nil {
		t.Fatal("reused endpoint must not own the first instance lock")
	}
	if calls.Load() != 1 {
		t.Fatalf("activation calls: %d", calls.Load())
	}
}

// 锁被占着、对方又不应答时，必须在总截止时间内放弃，并给出外壳认得的那句原因。
//
// 以前按 40 次 ×（1 秒超时 + 100 毫秒）计数，最坏 44 秒，远超 Electron 的 15 秒
// readyTimeout：外壳先判超时杀掉进程，用户只看到“请重新安装”。
func TestInstanceWaitHasTotalDeadline(t *testing.T) {
	if instanceWaitBudget <= 0 || instanceWaitBudget > 10*time.Second {
		t.Fatalf("instanceWaitBudget = %v，必须不超过 10 秒，明显短于 Electron 的 15 秒", instanceWaitBudget)
	}
	dir := t.TempDir()
	first, existing, err := acquireInstance(dir, false)
	if err != nil || existing {
		t.Fatalf("first instance: %v %v", existing, err)
	}
	defer first.close()

	// 对方拿着锁、发布了地址，却一直不应答（卡住或正在退出）。
	stuck := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-stuck
	}))
	defer server.Close()
	defer close(stuck) // 先放开卡住的请求，server.Close 才不会一直等
	if err := first.publish(server.URL); err != nil {
		t.Fatal(err)
	}

	old := instanceWaitBudget
	instanceWaitBudget = 600 * time.Millisecond
	defer func() { instanceWaitBudget = old }()

	start := time.Now()
	_, existing, err = acquireInstance(dir, false)
	elapsed := time.Since(start)
	if existing || err == nil {
		t.Fatalf("对方不应答时不该算复用成功：%v %v", existing, err)
	}
	if elapsed > instanceWaitBudget+700*time.Millisecond {
		t.Fatalf("等了 %v，超出总截止时间 %v 太多：单次请求的超时没有按剩余时间收紧", elapsed, instanceWaitBudget)
	}
	// main 会原样写成“启动失败: <原因>”；外壳 check-sidecar 认的就是这句。
	if err.Error() != "应用正在启动或退出，请稍后再打开" {
		t.Fatalf("原因 = %q", err.Error())
	}
}
