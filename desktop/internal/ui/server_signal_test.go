//go:build !windows

package ui

import (
	"os"
	"slices"
	"syscall"
	"testing"
	"time"
)

// 真实注册后给自己发 SIGHUP：回调在 1 秒内被调用，进程不退出。
// stop 之后信号恢复默认处理（SIGHUP 会结束进程），所以 stop 之后不再发任何信号。
func TestShutdownSignalRunsShutdown(t *testing.T) {
	called := make(chan struct{}, 1)
	stop := notifyShutdownSignals(func() { called <- struct{}{} })
	defer stop()
	if err := syscall.Kill(os.Getpid(), syscall.SIGHUP); err != nil {
		t.Fatal(err)
	}
	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("收到 SIGHUP 后 1 秒内没有走 shutdown")
	}
	stop()
	stop() // 重复调用无害（Run 的 defer 与测试的 defer 都可能调到）
}

// 注册的信号集合与注销的通道：SIGTERM、SIGINT、SIGHUP 触发排空，SIGPIPE 单独接住丢弃，
// stop 对注册过的每个通道都调用 signal.Stop。
func TestShutdownSignalRegistration(t *testing.T) {
	oldNotify, oldStop := signalNotify, signalStop
	t.Cleanup(func() { signalNotify, signalStop = oldNotify, oldStop })
	registered := map[chan<- os.Signal][]os.Signal{}
	var stopped []chan<- os.Signal
	signalNotify = func(c chan<- os.Signal, sig ...os.Signal) { registered[c] = append(registered[c], sig...) }
	signalStop = func(c chan<- os.Signal) { stopped = append(stopped, c) }

	calls := make(chan struct{}, 4)
	stop := notifyShutdownSignals(func() { calls <- struct{}{} })
	var all []os.Signal
	var quit, pipe chan<- os.Signal
	for c, sigs := range registered {
		all = append(all, sigs...)
		if slices.Contains(sigs, os.Signal(syscall.SIGPIPE)) {
			pipe = c
		} else {
			quit = c
		}
	}
	for _, sig := range []os.Signal{syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP, syscall.SIGPIPE} {
		if !slices.Contains(all, sig) {
			t.Fatalf("没有注册 %v：%v", sig, all)
		}
	}
	if len(registered) != 2 || quit == nil || pipe == nil || len(registered[pipe]) != 1 {
		t.Fatalf("SIGPIPE 应单独一个通道：%v", registered)
	}

	// SIGPIPE 只被丢弃，不触发排空；SIGTERM 触发。
	pipe <- syscall.SIGPIPE
	select {
	case <-calls:
		t.Fatal("SIGPIPE 不应触发 shutdown")
	case <-time.After(100 * time.Millisecond):
	}
	quit <- syscall.SIGTERM
	select {
	case <-calls:
	case <-time.After(time.Second):
		t.Fatal("SIGTERM 没有触发 shutdown")
	}

	stop()
	stop()
	if len(stopped) != 2 || !slices.Contains(stopped, quit) || !slices.Contains(stopped, pipe) {
		t.Fatalf("stop 应对两个通道各注销一次：%v", stopped)
	}
}
