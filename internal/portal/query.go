package portal

import (
	"errors"
	"time"
)

// statusQueryTimeout 是在线查询的超时。rad_user_info 是个几百字节的只读接口，
// 门户正常时一眨眼就回；等不到基本就是门户不通，没必要按登录的 10 秒干等。
const statusQueryTimeout = 5 * time.Second

// QueryOnline 按区域查询当前设备的在线状态。
//
// 返回 (nil, nil) 表示当前区域未查询（比如人在校外、或无法判区），
// 返回错误表示查询失败。两者都不能当作已确认离线。
//
// 外网可达与校园网认证是独立状态，所以能上外网时仍查询门户。
// 联网时 Detect() 会提前返回、没跑协议指纹，所以不知道当初是哪套协议
// 认证的，那就两套都问一次，谁在线采信谁，结果的 Zone 记下是哪一套。
// 两个都是只读查询，代价很小，而且并发着问：总耗时是慢的那一个，而不是两个超时加起来。
func QueryOnline(zone Zone, srunHost, drcomHost, username, password string) (*OnlineStatus, error) {
	// 两边共用一个不保活的连接层（statusTransport），查完连接就关。
	srunStatus := func() (*OnlineStatus, error) {
		c := newSrunClient(srunHost, username, password)
		c.http = statusHTTPClient()
		return c.Status()
	}
	drcomStatus := func() (*OnlineStatus, error) {
		c := newDrcomClient(drcomHost, username, password)
		c.http = statusHTTPClient()
		return c.Status()
	}

	switch zone {
	case ZoneTeaching:
		return srunStatus()
	case ZoneDorm:
		return drcomStatus()
	case ZoneOnline:
		var st, dst *OnlineStatus
		var err, derr error
		parallel(
			func() { st, err = srunStatus() },
			func() { dst, derr = drcomStatus() },
		)
		if err == nil && st != nil && st.Online {
			return st, nil
		}
		if derr == nil && dst != nil && dst.Online {
			return dst, nil
		}
		// 只有两套查询都成功且都离线，才能确认出口未认证。
		// 其中一套失败时，另一套的离线结果不能代表失败的那套。
		if err != nil || derr != nil {
			return nil, errors.Join(err, derr)
		}
		// 两套都说不在线：这是两边合起来的结论，不能挂在深澜名下（见 OnlineStatus.Zone）。
		st.Zone = ""
		return st, nil
	default:
		return nil, nil
	}
}

// NoCampusPortal 判断「外网正常、没判到教学区或宿舍区、门户又查不到」。
//
// 人在校外（家里、手机热点）时本来就是这样，不是故障。桌面端 /api/status 以前把它
// 写成「暂时无法确认」并常驻一条琥珀色警告（O7），命令行 status 写的是「没查到」；
// 两边改用同一条判据和同一句说明（NoCampusPortalNote），免得又各说各的。
func NoCampusPortal(zone Zone, det *DetectResult, queryErr error) bool {
	return queryErr != nil && zone == ZoneOnline && det != nil && det.InternetOK
}

// NoCampusPortalNote 是上面那种情况给人看的说明，桌面端原样显示，命令行原样打印。
//
// 同一次探测看到学校域名解析进了 198.18.0.0/15：人在校内开着 Clash 这类代理时，门户正是
// 因此查不到。仍是中性说明（在家开着代理的同学更多，不能把他们引去排查），但要带上代理提示。
func NoCampusPortalNote(det *DetectResult) string {
	note := "外网正常；没有检测到校园网认证页面（不在校园网内时属正常）"
	if det != nil && det.SrunDNSFakeIP {
		note += "。人在校内的话：" + ProxyTakeoverHint
	}
	return note
}
