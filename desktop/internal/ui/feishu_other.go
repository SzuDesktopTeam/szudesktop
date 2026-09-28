//go:build !windows && !darwin

package ui

import "os/exec"

func hideFeishuCommand(cmd *exec.Cmd) {}
