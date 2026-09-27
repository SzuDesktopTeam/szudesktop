package main

import (
	"errors"
	"strings"
	"testing"
)

// Electron 外壳只取 stderr 最后一行非空内容当失败原因，所以原因必须是单行，
// 而且不能把 -p 传入的密码带出去。
func TestStartupReasonIsOneLineWithoutPassword(t *testing.T) {
	err := errors.New("端口被占用或没有权限:\r\nlisten tcp 127.0.0.1:0: bind:\tpass=Secret-Pass-9")
	got := startupReason(err, "Secret-Pass-9")
	if strings.ContainsAny(got, "\r\n\t") || strings.Contains(got, "Secret-Pass-9") || !strings.HasPrefix(got, "端口被占用或没有权限: listen tcp") {
		t.Fatalf("startupReason = %q", got)
	}
	if got := startupReason(errors.New(" \n "), ""); got != "未知原因" {
		t.Fatalf("empty reason = %q", got)
	}
}
