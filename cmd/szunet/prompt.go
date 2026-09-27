package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
)

// errNotTerminal 表示标准输入不是终端（管道、重定向，或者不认识的平台），
// 这时关不了回显，也用不着关。
var errNotTerminal = errors.New("标准输入不是终端")

// echoOff 关掉标准输入的回显，返回还原函数。做成变量方便测试。
var echoOff = func() (func(), error) { return disableEcho(os.Stdin) }

// readLine 读一行并去掉首尾空白。最后一行没有换行符也算数（管道常见）。
func readLine(in *bufio.Reader) (string, error) {
	line, err := in.ReadString('\n')
	if err != nil && !(errors.Is(err, io.EOF) && line != "") {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

// readSecret 打出提示 label，再读一行密码。
//
// 标准输入是终端时关掉回显，读完立刻还原；Ctrl+C 打断时也先还原再退出，
// 否则终端会一直不显示输入。不是终端（管道、重定向）时直接按行读。
//
// 提示要等关回显有了结果才打：mintty / Git Bash 这类仿终端里关不了回显，
// 这时不能再说「输入时不显示」，免得用户以为安全，身后的人却看得一清二楚。
//
// 用户名和密码必须从同一个 bufio.Reader 读：以前两次各建一个 reader，
// 第一个会把管道里的两行一起吞进缓冲，第二个只能读到 EOF，于是
// `printf '账号\n密码\n' | szunet config set` 永远报「账号和密码都不能为空」。
func readSecret(in *bufio.Reader, out io.Writer, label string) (string, error) {
	restore, err := echoOff()
	if err != nil {
		fmt.Fprint(out, label+"（此终端无法隐藏输入，可能会显示出来）: ")
		return readLine(in)
	}
	fmt.Fprint(out, label+"（输入时不显示）: ")

	interrupted := make(chan os.Signal, 1)
	done := make(chan struct{})
	signal.Notify(interrupted, os.Interrupt)
	go func() {
		select {
		case <-interrupted:
			restore()
			fmt.Fprintln(out)
			os.Exit(130)
		case <-done:
		}
	}()

	line, err := readLine(in)
	signal.Stop(interrupted)
	close(done)
	restore()
	// 回车没有回显，补一个换行，后面的输出才不会接在提示后面。
	fmt.Fprintln(out)
	return line, err
}

// promptCredentials 为 `config set` 补齐没在参数里给的账号或密码。
func promptCredentials(in *bufio.Reader, out io.Writer, user, pass string) (string, string, error) {
	if user == "" {
		fmt.Fprint(out, "校园卡号（6 位）: ")
		u, err := readLine(in)
		if err != nil {
			return "", "", fmt.Errorf("读取账号失败: %w", err)
		}
		user = u
	}
	if pass == "" {
		p, err := readSecret(in, out, "统一身份认证密码")
		if err != nil {
			return "", "", fmt.Errorf("读取密码失败: %w", err)
		}
		pass = p
	}
	return user, pass, nil
}

// warnPasswordFlag 在用 -p / --password 传了密码时提醒一句。
//
// 命令行参数会原样留在 shell 历史（PowerShell 的 ConsoleHost_history.txt、
// ~/.bash_history）里，同一台机器上的其他进程也能从进程列表看到——
// 这正是凭据存储费力避免的明文落盘。保留 -p 只为兼容旧脚本。
func warnPasswordFlag(o *options) {
	if o.password == "" {
		return
	}
	fmt.Fprintln(os.Stderr, "提示: 用 -p 传的密码会留在 shell 历史和进程列表里。"+
		"建议先用 `szunet config set` 保存（交互输入不显示，脚本可加 --password-stdin 从管道传入），之后就不用再带密码。")
}
