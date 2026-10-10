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

// NoCampusPortal 选择外网可用、校园认证查询未确认时的中性说明。
// 查询错误不能证明人在校外，也不能证明认证门户不存在。
func NoCampusPortal(zone Zone, det *DetectResult, queryErr error) bool {
	return queryErr != nil && zone == ZoneOnline && det != nil && det.InternetOK
}

// NoCampusPortalNote 是上面那种情况给人看的说明，桌面端原样显示，命令行原样打印。
//
// 同一次探测看到学校域名解析进了 198.18.0.0/15 时附加代理建议；
// 这只是已观察到的 DNS 接管线索，不断言它就是查询失败的原因。
func NoCampusPortalNote(det *DetectResult) string {
	note := "外网可用；校园网认证状态暂未确认"
	if det != nil && det.SrunDNSFakeIP {
		note += "。人在校内的话：" + ProxyTakeoverHint
	}
	return note
}
