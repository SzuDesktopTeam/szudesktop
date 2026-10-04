//go:build darwin

package diagnose

import (
	"context"
	"os/exec"
	"time"
)

// scutilBin 写死系统自带的路径，不按 PATH 找：和 credential 找 security 一样，
// 免得 PATH 里排在前面的同名程序顶替。
const scutilBin = "/usr/sbin/scutil"

// ReadSystemProxy 读当前生效的系统代理开关；读不到时返回 nil，调用方省略这一项。
func ReadSystemProxy() *SystemProxy {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, scutilBin, "--proxy").Output()
	if err != nil {
		return nil
	}
	return parseScutilProxy(string(out))
}
