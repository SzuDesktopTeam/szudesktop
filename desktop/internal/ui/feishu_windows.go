//go:build windows

package ui

import (
	"os/exec"
	"syscall"
)

func hideFeishuCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
