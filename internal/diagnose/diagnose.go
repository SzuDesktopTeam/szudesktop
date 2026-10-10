// Package diagnose 把区域探测、在线状态和建议整合成一份诊断报告。
//
// 这个包存在的意义：大部分"连不上"的问题，答案不在登录脚本里，
// 而在"我在哪个区、账号什么状态、卡在哪一步"。
// 同类工具基本都只做登录，不回答这些问题。
package diagnose

import (
	"fmt"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// Report 是一次诊断的完整结果。
type Report struct {
	Detect    *portal.DetectResult
	Online    *portal.OnlineStatus // 没查或查不到时为 nil
	OnlineErr error
	Advices   []string
}

// Options 控制诊断建议的措辞。
type Options struct {
	// CLIHints 为真时，建议里可以出现 --ip / --zone 这类命令行参数。
	//
	// 默认不给：桌面版没有指定认证服务器 IP 的入口，选区在登录页的
	// 「所在区域」里。把一条执行不了的命令行建议摆在桌面诊断里，
	// 用户只能卡住或者另装命令行版。
	CLIHints bool
}

// probe 是网络探测入口，做成变量方便测试换成固定结果。
var probe = portal.Probe

// Run 执行一次诊断，给出桌面版也能照做的建议。
// username / password 为空时跳过在线状态查询，只做网络侧探测。
//
// 这里用 portal.Probe() 而不是 portal.Detect()：诊断要回答的是
// "万一下一秒掉线，程序会认为我在哪个区"，这个答案在已经联网时
// 只有把探测跑完才知道。用 Detect() 会因为提前返回而给出假的"探不到"。
func Run(username, password, srunHost, drcomHost string) *Report {
	return RunWithOptions(username, password, srunHost, drcomHost, Options{})
}

// RunWithOptions 同 Run，按 opts 调整建议的措辞。命令行版用它打开 CLIHints。
func RunWithOptions(username, password, srunHost, drcomHost string, opts Options) *Report {
	r := &Report{}
	r.Detect = probe()

	if r.Detect.Zone == portal.ZoneOnline {
		r.Advices = append(r.Advices, "当前能正常上外网。如果只是想上网，不用做任何事")
		// 外网正常时学校域名被代理接管最常见（开着 Clash 之类照常上网），
		// 学校系统打不开、掉线后认证失败都出在这里，排在指纹预判前面。
		if a := fakeIPAdvice(r.Detect); a != "" {
			r.Advices = append(r.Advices, a)
		}
		// 已经在线时不会去认证，但掉线重登走的正是这套判区，
		// 所以把预判结论单独报出来，让人现在就能确认。
		r.Advices = append(r.Advices, fingerprintAdvice(r.Detect, opts))
		return r
	}

	// 有凭据的话，顺便查一下账号在这个区是不是已经在线。
	if username != "" && password != "" {
		switch r.Detect.Zone {
		case portal.ZoneTeaching:
			st, err := portal.NewSrunClient(srunHost, username, password).Status()
			if err != nil {
				r.OnlineErr = err
			} else {
				r.Online = st
			}
		case portal.ZoneDorm:
			st, err := portal.NewDrcomClient(drcomHost, username, password).Status()
			if err != nil {
				r.OnlineErr = err
			} else {
				r.Online = st
			}
		}
	}

	r.Advices = advices(r, opts)
	return r
}

// fingerprintAdvice 把协议指纹的结论说成人话。
//
// 已经在线时区域探测会短路，判区结果看不见，而掉线重登恰恰要用它，
// 所以单独做一条说明，方便在线状态下也能验判区对不对。
//
// 结论取自 portal.PredictDropZone，和同一份报告里 Notes 的预判是同一条规则，
// 不会一边说「按宿舍区处理」、一边说「判不出来」。
func fingerprintAdvice(d *portal.DetectResult, opts Options) string {
	if d == nil {
		return ""
	}
	head := fmt.Sprintf("协议指纹：深澜握手=%s、ePortal 登录接口=%s",
		boolCN(d.SrunUsable), boolCN(d.DormUsable))

	zone, reason := portal.PredictDropZone(d)
	if zone != portal.ZoneTeaching && zone != portal.ZoneDorm {
		return head + " → " + reason + "，真掉线时判不出区"
	}
	out := head + " → 真掉线时按「" + zone.Label() + "」的协议登录（" + reason + "）"
	if d.SrunUsable && d.DormUsable {
		out += "；如果登录报 ac_id 或协议错误，" + manualTeachingHint(opts)
	}
	return out
}

// manualTeachingHint 告诉用户怎么改成按教学区登录，按调用端给出能照做的说法。
func manualTeachingHint(opts Options) string {
	if opts.CLIHints {
		return "用 --zone teaching 手动指定"
	}
	return "在登录页的「所在区域」里改选教学区"
}

// fakeIPAdvice 在 net.szu.edu.cn 解析进 198.18.0.0/15（代理的 Fake-IP 段）时给出能照做的说法，否则返回空串。
func fakeIPAdvice(d *portal.DetectResult) string {
	if d == nil || !d.SrunDNSFakeIP {
		return ""
	}
	return "学校域名 net.szu.edu.cn 解析到了 198.18.0.0/15 里的假地址，说明 DNS 被代理接管，不能单独证明断网。" +
		"学校访问正常时无需修改；实际访问失败时：" + portal.ProxyTakeoverHint +
		"。请先保存工作、检查命中规则，以原来失败的学校功能恢复为准"
}

func boolCN(v bool) string {
	if v {
		return "是"
	}
	return "否"
}

// advices 根据探测结果生成排查建议。
// 这些建议对应的是最常见的几种"连不上"，按出现频率排。
func advices(r *Report, opts Options) []string {
	var out []string

	// 学校域名被代理接管时，下面按门户连通性给的结论也可能是代理造成的，先说这一条。
	if a := fakeIPAdvice(r.Detect); a != "" {
		out = append(out, a)
	}
	if r.Online != nil && r.Online.Online {
		out = append(out, "账号在这个区域已经在线了。如果还是上不了网，"+
			"大概率是代理、域名解析或者系统网络设置的问题，和认证本身无关")
	}
	if r.OnlineErr != nil {
		out = append(out, "查在线状态时出错，多半是网络还没通，可以先忽略这一条")
	}

	switch r.Detect.Zone {
	case portal.ZoneTeaching:
		out = append(out, "你在教学区，走深澜（SRun）认证。账号是 6 位校园卡号，"+
			"密码是统一身份认证密码")
		out = append(out, "教学办公区的上网权限是宿舍区套餐免费附带的，不用另外买")
		out = append(out, "如果报 ldap auth error 是密码错；报 Rad:userid error 是账号错")

	case portal.ZoneDorm:
		out = append(out, "你在宿舍区，走 Dr.COM 网页认证。先去自助服务确认套餐没到期")
		out = append(out, "宿舍区一个账号只能同时登录 1 台电脑 + 2 台移动设备。"+
			"被自己的其他设备挤下线，是\"莫名断网\"最常见的原因")
		out = append(out, "如果提示「尚未办理校内上网套餐」，检查校园卡「通用代扣费账户」余额是否够扣")

	case portal.ZoneOutside:
		out = append(out, "两个认证门户都连不上。先确认是不是在校外；"+
			"如果人在校内，可能是墙上端口或交换机故障，直接报修比反复重试有用")
	case portal.ZoneUnknown:
		out = append(out, "门户页面有响应，但没有确认认证协议，可能是维护页或网络拦截页。"+
			"请核对校园网官方页面；确认所在区域后，可以在登录页手动选择")
	}

	if !r.Detect.SrunDNSOK {
		dns := "net.szu.edu.cn 这个域名解析不出来。请检查当前网络的 DNS 和学校域名分流规则，" +
			"先保存工作，保留当前连接；不需要默认关闭整个代理"
		if opts.CLIHints {
			dns += "，也可以用 --ip 直接指定服务器地址"
		}
		out = append(out, dns)
	}

	return out
}
