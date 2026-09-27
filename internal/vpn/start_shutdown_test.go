package vpn

import (
	"context"
	"net"
	"runtime"
	"strings"
	"testing"
	"time"
)

// hangUpGateway 起一个「连上就挂断」的假 VPN 网关：收发两条流的 TLS 握手立刻失败，
// 各自进入重连等待，正好模拟 Start 刚把两条流拉起来的那一刻。
func hangUpGateway(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	t.Cleanup(func() { _ = ln.Close() })
	return ln.Addr().String()
}

// TestStartListenFailureShutsDownEverything 守住 Start 在 SOCKS 端口被占用时的收尾。
//
// 以前这条路径只取消了 ctx、关了两条流，既不等协程退出，也不关 gVisor 协议栈：
// 每次失败都在进程里留下一整个栈和它的 TCP 处理协程，反复点连接内存一直涨。
// 现在三条退出路径共用同一段收尾，这里用端口冲突把它触发出来。
func TestStartListenFailureShutsDownEverything(t *testing.T) {
	gateway := hangUpGateway(t)
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()

	ip := net.IPv4(10, 0, 0, 2).To4()
	// 先建一个栈再关掉，让 gVisor 包级的一次性初始化先跑完，不算进下面的基线。
	warm := setupStack(ip, &Endpoint{})
	warm.Close()
	warm.Wait()
	baseline := runtime.NumGoroutine()

	c := New(gateway, busy.Addr().String())
	c.token = new([48]byte)
	c.ip = ip

	done := make(chan error, 1)
	go func() { done <- c.Start(context.Background()) }()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("SOCKS 端口被占用时 Start 应该报错")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("SOCKS 端口被占用时 Start 应该尽快返回，而不是一直挂着")
	}

	if state, _, lastErr := c.Status(); state != StateBroken || !strings.Contains(lastErr, "SOCKS5") {
		t.Fatalf("状态应为 broken 并说明是 SOCKS 端口的问题，实际 %v / %q", state, lastErr)
	}

	// 两条流、gVisor 协议栈的处理协程都应该已经退出。
	deadline := time.Now().Add(3 * time.Second)
	for runtime.NumGoroutine() > baseline && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := runtime.NumGoroutine(); n > baseline {
		buf := make([]byte, 1<<16)
		buf = buf[:runtime.Stack(buf, true)]
		t.Fatalf("Start 返回后还剩 %d 个协程没退出（基线 %d）：\n%s", n-baseline, baseline, buf)
	}
}
