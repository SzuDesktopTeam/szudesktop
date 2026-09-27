package portal

import (
	"strings"
	"testing"
)

// TestLoginMessagesLeadWithDesktopAction 登录失败的提示会经 /api/login 原样显示在
// 桌面版的登录页上。桌面版没有命令行参数，填接入点编号的地方在登录页「高级设置」里，
// 所以提示要先说桌面版怎么做，命令行参数只能放在括号里补充。
func TestLoginMessagesLeadWithDesktopAction(t *testing.T) {
	msgs := []string{
		friendlySrunError(srunPortalResp{Error: "ok", ErrorMsg: "Unknow ac-type"}),
		friendlySrunError(srunPortalResp{Error: "login_error", ErrorMsg: "ac_id error"}),
		friendlyDrcomMessage(""),
	}
	for _, m := range msgs {
		i := strings.Index(m, "--")
		if i < 0 {
			continue
		}
		if !strings.Contains(m[:i], "命令行版") {
			t.Errorf("命令行参数要标明是命令行版用的：%q", m)
		}
	}
	for _, m := range msgs[:2] {
		if !strings.Contains(m, "高级设置") {
			t.Errorf("ac_id 报错要告诉桌面版用户去哪里填：%q", m)
		}
	}
}
