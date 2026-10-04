package diagnose

import (
	"encoding/json"
	"runtime"
	"testing"
)

// 诊断报告要能看出系统代理关没关，但只能带开关、不能带地址：报告会被复制出去。
// 嵌套的 __SCOPED__（按网卡分的设置）和例外列表不能算成当前生效的开关。
func TestParseScutilProxySwitches(t *testing.T) {
	manual := `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  ProxyAutoConfigEnable : 0
  SOCKSEnable : 0
}`
	pac := `<dictionary> {
  HTTPEnable : 0
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://127.0.0.1:7890/proxy.pac
}`
	scopedOnly := `<dictionary> {
  HTTPEnable : 0
  __SCOPED__ : <dictionary> {
    en9 : <dictionary> {
      HTTPEnable : 1
      SOCKSEnable : 1
      ProxyAutoConfigEnable : 1
    }
  }
}`
	socksAfterScoped := scopedOnly[:len(scopedOnly)-1] + "  SOCKSEnable : 1\n}"
	for _, tc := range []struct {
		name string
		out  string
		want *SystemProxy
	}{
		{"手动代理开着", manual, &SystemProxy{Manual: true}},
		{"只开了 PAC", pac, &SystemProxy{PAC: true}},
		{"只有别的网卡开着", scopedOnly, &SystemProxy{}},
		{"嵌套字典之后的顶层键照算", socksAfterScoped, &SystemProxy{Manual: true}},
		{"空字典", "<dictionary> {\n}\n", &SystemProxy{}},
		{"读不懂", "scutil: command not found", nil},
		{"没有输出", "", nil},
	} {
		got := parseScutilProxy(tc.out)
		if (got == nil) != (tc.want == nil) || (got != nil && *got != *tc.want) {
			t.Errorf("%s：%+v，期望 %+v", tc.name, got, tc.want)
		}
	}
	raw, _ := json.Marshal(parseScutilProxy(manual))
	if string(raw) != `{"manual":true,"pac":false}` {
		t.Fatalf("只能带两个开关，不能带地址或端口：%s", raw)
	}
}

// macOS 上真去读一次：scutil 的输出格式要和上面的解析对得上，读不到就会被省略。
func TestReadSystemProxyOnMac(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("只有 macOS 用 scutil")
	}
	if ReadSystemProxy() == nil {
		t.Fatal("这台 Mac 上 scutil --proxy 的输出没解析出来，诊断报告会一直缺这一项")
	}
}
