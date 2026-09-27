//go:build !windows

package ui

import "os/exec"

func hideFeishuCommand(cmd *exec.Cmd) {}
