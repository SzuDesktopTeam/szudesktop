//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows"
)

// disableEcho 关掉控制台的输入回显，保留行编辑（退格照常可用、回车才返回）。
// 标准输入不是控制台（管道、重定向、部分仿终端）时返回 errNotTerminal。
func disableEcho(f *os.File) (func(), error) {
	h := windows.Handle(f.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(h, &mode); err != nil {
		return nil, errNotTerminal
	}
	quiet := mode&^windows.ENABLE_ECHO_INPUT | windows.ENABLE_LINE_INPUT | windows.ENABLE_PROCESSED_INPUT
	if err := windows.SetConsoleMode(h, quiet); err != nil {
		return nil, err
	}
	return func() { _ = windows.SetConsoleMode(h, mode) }, nil
}
