package diagnose

import "strings"

// SystemProxy 是系统代理的几个开关，诊断报告用它回答「代理到底关没关」。
//
// 只读开关、不读地址：诊断报告会被复制出去发给别人，代理地址和端口不能跟着走。
// 学校域名被代理的 Fake-IP 接管另有 DNS 那一侧的判断；这里看的是浏览器和大多数软件
// 会不会把流量先交给代理——现场复测要求先关代理，靠这一项核对。
type SystemProxy struct {
	Manual bool `json:"manual"` // 手动代理开着：Windows 的「使用代理服务器」，macOS 的网页、安全网页或 SOCKS 代理任一项
	PAC    bool `json:"pac"`    // 自动代理配置脚本（PAC）开着
}

// parseScutilProxy 从 macOS `scutil --proxy` 的输出里取开关，不是这种格式就当读不到。
//
// 输出是系统当前生效的那份代理字典：
//
//	<dictionary> {
//	  ExceptionsList : <array> {
//	    0 : *.local
//	  }
//	  HTTPEnable : 1
//	  ProxyAutoConfigEnable : 0
//	  __SCOPED__ : <dictionary> { … }
//	}
//
// 只看最外层的键：嵌套的 __SCOPED__ 是按网卡分的设置，没在用的网卡上开着代理
// 不等于现在生效。放在不带构建标签的文件里，各平台的测试都能跑到。
func parseScutilProxy(out string) *SystemProxy {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if !strings.HasPrefix(lines[0], "<dictionary> {") {
		return nil
	}
	p, depth := &SystemProxy{}, 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasSuffix(line, "{"):
			depth++
			continue
		case line == "}":
			depth--
			continue
		case depth != 1:
			continue
		}
		key, value, _ := strings.Cut(line, " : ")
		on := value == "1"
		switch key {
		case "HTTPEnable", "HTTPSEnable", "SOCKSEnable":
			p.Manual = p.Manual || on
		case "ProxyAutoConfigEnable":
			p.PAC = on
		}
	}
	return p
}
