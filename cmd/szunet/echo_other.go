//go:build !windows && !linux && !darwin && !freebsd && !netbsd && !openbsd && !dragonfly

package main

import "os"

// disableEcho 在没做适配的平台上不关回显，按行读（和管道输入一样）。
func disableEcho(*os.File) (func(), error) {
	return nil, errNotTerminal
}
