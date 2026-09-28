//go:build !windows

package main

import (
	"bufio"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// SZU_TEST_RUN_MAIN=1 时，测试二进制本身就当作引擎运行：main 用自己的 FlagSet 解析
// os.Args[1:]，不碰 testing 的标志，所以子进程可以直接带引擎的命令行参数启动。
func TestMain(m *testing.M) {
	if os.Getenv("SZU_TEST_RUN_MAIN") == "1" {
		main()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// 外壳（或 launchd、终端）发 SIGTERM 结束引擎时，要走排空路径：以 0 退出，并删掉
// desktop-instance.json。以前默认处理让进程当场退出，发现文件留在原地。
func TestSIGTERMShutsDownCleanly(t *testing.T) {
	if _, err := os.Stat(filepath.Join("..", "..", "internal", "ui", "assets", "index.html")); err != nil {
		t.Fatal("缺少 desktop/internal/ui/assets/index.html：请先运行 python3 desktop/sync-assets.py 再测试")
	}
	dir := t.TempDir()
	cmd := exec.Command(os.Args[0], "--no-open", "--no-auto-login")
	cmd.Env = append(os.Environ(), "SZU_TEST_RUN_MAIN=1", "SZUNET_CONFIG_DIR="+dir)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan error, 1)
	ready := make(chan bool, 1)
	go func() {
		// 读到「已启动」协议行才算就绪；之后继续把输出读完，免得子进程写满管道卡住。
		scanner := bufio.NewScanner(stdout)
		found := false
		for scanner.Scan() {
			if !found && strings.HasPrefix(scanner.Text(), "szuDesktop 已启动: http://127.0.0.1:") {
				found = true
				ready <- true
			}
		}
		if !found {
			ready <- false
		}
		exited <- cmd.Wait()
	}()
	select {
	case ok := <-ready:
		if !ok {
			t.Fatalf("引擎没有写出协议行就退出了：%s", stderr.String())
		}
	case <-time.After(15 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatalf("15 秒内没有读到协议行：%s", stderr.String())
	}
	instance := filepath.Join(dir, "desktop-instance.json")
	if _, err := os.Stat(instance); err != nil {
		t.Fatalf("就绪后应已发布 desktop-instance.json：%v", err)
	}
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-exited:
		if err != nil {
			t.Fatalf("收到 SIGTERM 后应以 0 退出：%v %s", err, stderr.String())
		}
	case <-time.After(2 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatal("收到 SIGTERM 后 2 秒内没有退出")
	}
	if _, err := os.Stat(instance); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("退出后 desktop-instance.json 应已删除：%v", err)
	}
}
