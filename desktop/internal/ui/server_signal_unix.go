//go:build !windows

package ui

import (
	"os"
	"os/signal"
	"sync"
	"syscall"
)

// 留成变量只为让测试核对注册了哪些信号、stop 是否对同样的通道注销。
var (
	signalNotify = signal.Notify
	signalStop   = signal.Stop
)

// notifyShutdownSignals 让 SIGTERM、SIGINT、SIGHUP 走和 /api/shutdown 相同的排空路径。
//
// 默认处理会让进程当场退出：实例锁虽随进程释放，desktop-instance.json 却留在原地，
// 进行中的存档写入也被掐断。macOS 外壳结束 sidecar、终端里按 Ctrl+C、关掉终端窗口
// 都是发这几个信号，所以统一接住，交给 shutdown 收尾后由 Run 正常返回。
//
// SIGPIPE 单独接住后丢弃：外壳先退出、标准输出的管道断了时，Go 往 fd 1/2 写会触发
// SIGPIPE 并直接杀掉进程；接住后写入只返回 EPIPE，排空照常进行。
func notifyShutdownSignals(shutdown func()) func() {
	quit := make(chan os.Signal, 1)
	signalNotify(quit, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
	pipe := make(chan os.Signal, 1)
	signalNotify(pipe, syscall.SIGPIPE)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-quit:
				// shutdown 自己保证只关一次；不在这里等它，免得连发的信号把通道堵住。
				go shutdown()
			case <-pipe:
			case <-done:
				return
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() {
			signalStop(quit)
			signalStop(pipe)
			close(done)
		})
	}
}
