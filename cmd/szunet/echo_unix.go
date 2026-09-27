//go:build linux || darwin || freebsd || netbsd || openbsd || dragonfly

package main

import (
	"os"

	"golang.org/x/sys/unix"
)

// disableEcho 关掉终端回显，保留规范模式（整行读取、退格可用）和 Ctrl+C。
// 标准输入不是终端时返回 errNotTerminal。
func disableEcho(f *os.File) (func(), error) {
	fd := int(f.Fd())
	old, err := unix.IoctlGetTermios(fd, ioctlReadTermios)
	if err != nil {
		return nil, errNotTerminal
	}
	quiet := *old
	quiet.Lflag &^= unix.ECHO
	quiet.Lflag |= unix.ICANON | unix.ISIG
	quiet.Iflag |= unix.ICRNL
	if err := unix.IoctlSetTermios(fd, ioctlWriteTermios, &quiet); err != nil {
		return nil, err
	}
	return func() { _ = unix.IoctlSetTermios(fd, ioctlWriteTermios, old) }, nil
}
