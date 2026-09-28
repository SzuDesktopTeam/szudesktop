//go:build !darwin

package ui

import "os/exec"

// Windows 与 Linux 只认 PATH（见 findFeishuCLI），查找顺序和子进程环境都与以前一致。
func platformFeishuCLI(string) string { return "" }

func prepareFeishuEnv(*exec.Cmd) {}
