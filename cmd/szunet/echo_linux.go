//go:build linux

package main

import "golang.org/x/sys/unix"

// Linux 读写终端属性用 TCGETS / TCSETS。
const (
	ioctlReadTermios  = unix.TCGETS
	ioctlWriteTermios = unix.TCSETS
)
