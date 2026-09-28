package credential

// macOS 的 security 命令如果把密码写在命令行参数里，同一台机器上的其他进程
// 用 ps 就能看到它（F21）。这里统一改成把密码从标准输入喂进去，
// 命令行参数里绝不出现机密内容。
//
// Apple 的 man page 对这种写法的说明是：-w 放在命令最后时不带值，
// 程序会提示输入（"Put at end of command to be prompted (recommended)"）。
// 提示走的是 readpassphrase(3)，它在打不开 /dev/tty 时会退回读标准输入——
// 所以子进程要脱离控制终端（见 noControllingTTY），管道才喂得进去。
//
// 这段逻辑放在没有构建标签的文件里，是为了让 Linux CI 能用假命令验证
// 「密码不进 argv、只走标准输入」这条性质；真正操作钥匙串的只有 darwin 的文件。

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// securityBin 是 security 命令的位置，测试可以替换成假命令。
// 默认值按平台放在 security_bin_*.go：darwin 用绝对路径，其他平台沿用命令名。
var securityBin = defaultSecurityBin

// maxKeychainSecret 是经标准输入交给 security 时能完整存下的最大字节数。
//
// security 的 -w 提示走 getpass，一行最多收 128 字节，多出来的静默丢掉；
// 两行都截成一样的前缀，确认照样通过，-U 随即把截断值写进条目——等读回校验
// 发现不一致时，原来存着的密码或会话已经被覆盖了。所以必须在写之前拦下。
// macOS 26 真机实测：128 字节原样存下，129 字节起截成 128 字节，退出码仍是 0。
const maxKeychainSecret = 128

// errKeychainSecretRejected 表示这段内容写进钥匙串会被截断或拆行，所以根本没去写。
var errKeychainSecretRejected = errors.New("这段内容无法完整写入 macOS 钥匙串，已取消保存，钥匙串里原有的条目没有改动")

// checkKeychainSecret 拦下 security 的提示输入存不完整的内容。
//
// 换行同样要拦：secretInput 用换行分隔「密码」与「确认」，内容里带换行会被拆成
// 几行，碰巧两行相同时 security 会把残缺的一截当成完整密码存下来。
func checkKeychainSecret(secret []byte) error {
	if len(secret) > maxKeychainSecret {
		return fmt.Errorf("%w（内容有 %d 字节，security 最多只能完整写入 %d 字节）", errKeychainSecretRejected, len(secret), maxKeychainSecret)
	}
	if bytes.ContainsAny(secret, "\r\n") {
		return fmt.Errorf("%w（内容里含有换行）", errKeychainSecretRejected)
	}
	return nil
}

// runSecurity 执行 security 子命令。
//
// args 里不允许出现机密：调用方只能把机密放进 stdin。
// stdin 为 nil 表示这条命令不需要输入。
var runSecurity = func(args []string, stdin []byte) ([]byte, error) {
	cmd := exec.Command(securityBin, args...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	cmd.SysProcAttr = noControllingTTY()
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		// %w 不能省：securityItemNotFound 要顺着错误链找退出码 44（条目不存在）；
		// stderr 拼进消息里，退出码被包装掉时还能靠 -25300 认出来。
		return nil, fmt.Errorf("security %s 失败: %w%s", args[0], err, briefStderr(errBuf.String()))
	}
	return out.Bytes(), nil
}

// briefStderr 把命令报错压成一行短句，避免把整段用法说明塞进界面。
func briefStderr(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return "（" + s + "）"
}

// secretInput 把机密拼成 security 的提示输入所需要的形式：密码一行、确认一行。
//
// 真实的 `security add-generic-password -w` 会问两遍（password data for new item /
// retype password for new item）。只喂一行会得到 "passwords don't match"、退出码 44，
// 条目根本建不起来——这是 CI 的 macOS 探针在真机上实测到的行为，beta0.7.1 与
// beta0.7.2 都因此存不了凭据（F26）。多喂的那一行在只问一遍的旧版本上只是
// 没人读的剩余输入，不影响结果。
//
// 必须复制一份：直接 append 到调用方的切片上，容量够时会改掉它身后的数组。
func secretInput(secret []byte) []byte {
	buf := make([]byte, 0, 2*len(secret)+2)
	buf = append(buf, secret...)
	buf = append(buf, '\n')
	buf = append(buf, secret...)
	buf = append(buf, '\n')
	return buf
}

func promptWrite(service, account string, secret []byte) error {
	// -w 必须放最后且不带值：这样 security 才会来要输入，而不是把它当参数收下。
	_, err := runSecurity([]string{"add-generic-password", "-a", account, "-s", service, "-U", "-w"}, secretInput(secret))
	return err
}

func promptRead(service, account string) ([]byte, error) {
	out, err := runSecurity([]string{"find-generic-password", "-a", account, "-s", service, "-w"}, nil)
	if err != nil {
		return nil, err
	}
	return bytes.TrimRight(out, "\r\n"), nil
}

// 自检结果只缓存成功：失败不缓存，用户解锁钥匙串后重试还能成功。
var (
	promptMu       sync.Mutex
	promptVerified bool
)

// ensurePromptWriteWorks 先用一次性条目确认这条路真的能用，再写真实凭据。
//
// 为什么不直接写真实条目试：万一密码没喂进去，钥匙串里留下的就是空值或错值，
// 用户下次登录会莫名其妙失败，而且原来存着的密码已经被覆盖掉了。
// 探测条目独立命名，失败也不会碰到用户的凭据。
func ensurePromptWriteWorks() error {
	promptMu.Lock()
	defer promptMu.Unlock()
	if promptVerified {
		return nil
	}

	stamp := strconv.FormatInt(time.Now().UnixNano(), 36)
	service, account := "szunet-selftest-"+stamp, "szunet-selftest"
	probe := []byte("probe-" + stamp)

	if err := promptWrite(service, account, probe); err != nil {
		return fmt.Errorf("这台机器上「密码经标准输入写入钥匙串」不可用，已取消保存: %w", err)
	}
	defer func() {
		_, _ = runSecurity([]string{"delete-generic-password", "-a", account, "-s", service}, nil)
	}()

	got, err := promptRead(service, account)
	if err != nil {
		return fmt.Errorf("自检条目写进去却读不回来，已取消保存: %w", err)
	}
	if !bytes.Equal(got, probe) {
		return errors.New("自检时写入的值与读回的不一致，已取消保存")
	}
	promptVerified = true
	return nil
}

// keychainSave 是 macOS 上凭据与会话共用的写入路径。
//
// 顺序是有意的：先检查内容存不存得完整、再自检机制、再写、最后读回校验。
// 任何一步失败都如实报错，不会退回「把密码放到命令行参数」那种会被 ps 看到的老做法。
// 长度检查排在最前：读回校验只能事后发现截断，那时旧条目已经被 -U 覆盖了。
func keychainSave(service, account string, secret []byte) error {
	if err := checkKeychainSecret(secret); err != nil {
		return err
	}
	if err := ensurePromptWriteWorks(); err != nil {
		return err
	}
	if err := promptWrite(service, account, secret); err != nil {
		return err
	}
	got, err := promptRead(service, account)
	if err != nil {
		return fmt.Errorf("保存后读回校验失败（写入可能没有生效）: %w", err)
	}
	if !bytes.Equal(got, secret) {
		return errors.New("保存后读回的内容与写入不一致，请重新保存一次；仍然失败请反馈")
	}
	return nil
}
