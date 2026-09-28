//go:build unix

package credential

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 这个测试用真的子进程跑一遍完整链路：把 securityBin 指向一个假脚本，
// 验证密码确实经标准输入送达、命令行参数里确实没有它，并且读回校验也在跑。
//
// macOS 上 security 的提示输入行为（readpassphrase 打不开 /dev/tty 时退回读标准输入）
// 无法在这里验证，只能靠这条链路 + 真机自检，见 docs/STATUS.md。
func TestKeychainSaveThroughRealCommandKeepsSecretOutOfArgv(t *testing.T) {
	dir := t.TempDir()
	store := filepath.Join(dir, "keychain")
	argvLog := filepath.Join(dir, "argv.log")
	script := filepath.Join(dir, "security")

	body := `#!/bin/sh
printf '%s\n' "$*" >> ` + argvLog + `
case "$1" in
  add-generic-password)
    # 真实 security 会问两遍：密码，然后是确认。两行不一致就报
    # "passwords don't match"、退出码 44，条目根本建不起来。
    IFS= read -r first || true
    IFS= read -r second || true
    if [ -z "$first" ] || [ "$first" != "$second" ]; then
      echo "passwords don't match" >&2
      exit 44
    fi
    printf '%s' "$first" > ` + store + `
    ;;
  find-generic-password)
    if [ -f ` + store + ` ]; then cat ` + store + `; echo; else echo "could not be found (-25300)" >&2; exit 44; fi
    ;;
  delete-generic-password)
    rm -f ` + store + `
    ;;
esac
exit 0
`
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		t.Fatalf("写假命令失败: %v", err)
	}

	savedBin := securityBin
	securityBin = script
	promptMu.Lock()
	promptVerified = false
	promptMu.Unlock()
	t.Cleanup(func() {
		securityBin = savedBin
		promptMu.Lock()
		promptVerified = false
		promptMu.Unlock()
	})

	secret := []byte(`{"username":"000000","password":"test-only-secret"}`)
	if err := keychainSave("szunet-unix-test", "szunet-unix-test", secret); err != nil {
		t.Fatalf("保存失败: %v", err)
	}

	logs, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("假命令没有被调用: %v", err)
	}
	if strings.Contains(string(logs), "test-only-secret") {
		t.Fatalf("密码出现在子进程命令行参数里，同机 ps 可见:\n%s", logs)
	}
	if !strings.Contains(string(logs), "find-generic-password") {
		t.Fatal("没有读回校验，写成功不代表写对了")
	}

	got, err := os.ReadFile(store)
	if err != nil {
		t.Fatalf("假钥匙串里没有内容: %v", err)
	}
	if string(got) != string(secret) {
		t.Fatalf("标准输入的内容没被完整收到，存下来的是 %q", got)
	}
}

// 真实 security 的 -w 提示走 getpass，一行最多收 128 字节，多出来的静默丢掉，
// 两行截成一样的前缀后确认照样通过，-U 就把截断值写了进去。这个假命令照此建模，
// 并按服务名分文件存，用来证明：超长内容在碰钥匙串之前就被拦下，原有条目一个字节都没变。
func TestKeychainSaveRejectsWhatGetpassWouldTruncate(t *testing.T) {
	dir := t.TempDir()
	argvLog := filepath.Join(dir, "argv.log")
	script := filepath.Join(dir, "security")

	body := `#!/bin/sh
export LC_ALL=C
printf '%s\n' "$*" >> ` + argvLog + `
svc=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-s" ]; then svc="$a"; fi
  prev="$a"
done
item=` + dir + `/item-"$svc"
case "$1" in
  add-generic-password)
    IFS= read -r first || true
    IFS= read -r second || true
    first=$(printf '%.128s' "$first")
    second=$(printf '%.128s' "$second")
    if [ -z "$first" ] || [ "$first" != "$second" ]; then
      echo "passwords don't match" >&2
      exit 44
    fi
    printf '%s' "$first" > "$item"
    ;;
  find-generic-password)
    if [ -f "$item" ]; then cat "$item"; echo; else echo "could not be found (-25300)" >&2; exit 44; fi
    ;;
  delete-generic-password)
    rm -f "$item"
    ;;
esac
exit 0
`
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		t.Fatalf("写假命令失败: %v", err)
	}
	savedBin := securityBin
	securityBin = script
	resetProbe := func() {
		promptMu.Lock()
		promptVerified = false
		promptMu.Unlock()
	}
	resetProbe()
	t.Cleanup(func() {
		securityBin = savedBin
		resetProbe()
	})

	const service, account = "szunet-trunc-test", "szunet-trunc-test"
	old := `{"username":"000000","password":"old-secret"}`
	if err := os.WriteFile(filepath.Join(dir, "item-"+service), []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, n := range []int{129, 500, 2000} {
		resetProbe() // 让自检也有机会跑：拦截必须排在自检之前，一次 add 都不能有
		_ = os.Remove(argvLog)
		err := keychainSave(service, account, []byte(strings.Repeat("x", n)))
		if err == nil {
			t.Fatalf("%d 字节会被 getpass 截断，必须报错", n)
		}
		if !strings.Contains(err.Error(), "原有的条目没有改动") {
			t.Fatalf("错误要说明旧条目没动过，得到: %v", err)
		}
		if logs, _ := os.ReadFile(argvLog); strings.Contains(string(logs), "add-generic-password") {
			t.Fatalf("%d 字节的内容被拒之前已经执行过 add-generic-password:\n%s", n, logs)
		}
		if got, _ := os.ReadFile(filepath.Join(dir, "item-"+service)); string(got) != old {
			t.Fatalf("%d 字节的写入被拒后，原有条目变成了 %q", n, got)
		}
	}

	for _, secret := range [][]byte{[]byte("a\nb"), []byte("a\r\na")} {
		if err := keychainSave(service, account, secret); err == nil {
			t.Fatalf("含换行的 %q 会被拆成两行，必须报错", secret)
		}
	}

	for _, n := range []int{1, 64, 127, 128} {
		secret := []byte(strings.Repeat("y", n))
		if err := keychainSave(service, account, secret); err != nil {
			t.Fatalf("%d 字节在上限以内，应当能保存: %v", n, err)
		}
		got, err := promptRead(service, account)
		if err != nil || string(got) != string(secret) {
			t.Fatalf("%d 字节保存后读回 %q（%v）", n, got, err)
		}
	}
}
