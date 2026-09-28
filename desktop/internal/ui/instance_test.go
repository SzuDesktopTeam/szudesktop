package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

// 发现文件里的地址和凭据都不可信：不是回环 IP 字面量、或凭据不是 64 位小写十六进制，
// 都要在发出任何请求之前就拒绝——错误必须是校验错误，而不是连不上/超时这类网络错误，
// 否则“拒绝”只是碰巧没连上。
func TestInstanceValidatesRecordBeforeContactingIt(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	good := strings.Repeat("a", 64)
	isValidationError := func(err error) bool {
		return err != nil && (err.Error() == "无效的本机地址" || err.Error() == "无效的本机实例")
	}
	// 回环之外的 IP 字面量（局域网、公网、IPv6 文档地址、0.0.0.0）一律不认。
	for _, address := range []string{"http://10.0.0.1:80", "http://192.168.1.1:8080", "http://0.0.0.0:80", "http://[2001:db8::1]:80", "http://8.8.8.8:80"} {
		if err := activateInstance(instanceRecord{URL: address, Token: good}, false, time.Second); !isValidationError(err) {
			t.Fatalf("%s: 应在校验阶段拒绝，实际 %v", address, err)
		}
	}
	// 地址是本机、凭据格式不对：不能带着它去敲本机端口。
	for name, token := range map[string]string{
		"63 位": good[:63], "65 位": good + "a", "大写": strings.ToUpper(good), "非十六进制": strings.Repeat("g", 64),
		"NUL 字节": string(make([]byte, 64)), "带空白": good[:63] + " ",
	} {
		if err := activateInstance(instanceRecord{URL: server.URL, Token: token}, false, time.Second); !isValidationError(err) {
			t.Fatalf("凭据%s: 应在校验阶段拒绝，实际 %v", name, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("校验不通过的记录仍然发出了 %d 次请求", calls.Load())
	}
	// 对照：合格的记录才会真的去请求。
	if err := activateInstance(instanceRecord{URL: server.URL, Token: good}, false, time.Second); err != nil || calls.Load() != 1 {
		t.Fatalf("合格记录应被请求一次：%v %d", err, calls.Load())
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

// 预算跨过多次应答请求时，最后一次请求的超时必须按剩余时间收紧，而不是每次都给满 1 秒：
// 预算 1.2 秒 → 第一次请求 1 秒、间隔 0.1 秒、最后一次只剩约 0.1 秒，总耗时约 1.2 秒；
// 若每次都按整份预算（上限 1 秒）等，会拖到约 2.1 秒。
func TestInstanceWaitTightensLastRequestToRemainingBudget(t *testing.T) {
	dir := t.TempDir()
	first, existing, err := acquireInstance(dir, false)
	if err != nil || existing {
		t.Fatalf("first instance: %v %v", existing, err)
	}
	defer first.close()
	stuck := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-stuck }))
	defer server.Close()
	defer close(stuck)
	if err := first.publish(server.URL); err != nil {
		t.Fatal(err)
	}
	old := instanceWaitBudget
	instanceWaitBudget = 1200 * time.Millisecond
	defer func() { instanceWaitBudget = old }()

	start := time.Now()
	_, existing, err = acquireInstance(dir, false)
	elapsed := time.Since(start)
	if existing || err == nil {
		t.Fatalf("对方不应答时不该算复用成功：%v %v", existing, err)
	}
	if elapsed > instanceWaitBudget+500*time.Millisecond {
		t.Fatalf("等了 %v，预算 %v：最后一次应答请求没有按剩余时间收紧", elapsed, instanceWaitBudget)
	}
}
