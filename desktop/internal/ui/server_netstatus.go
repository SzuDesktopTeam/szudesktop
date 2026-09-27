package ui

import (
	"sync"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// statusCacheTTL 内重复的 /api/status 直接复用上一次的网络探测。
//
// 一次探测要连外网和两个门户，校外或网络异常时要十几秒。页面轮询、
// 手动刷新、多个窗口和启动时的自动登录撞在一起时没必要各探一遍：
// 同一时刻只跑一次，并发到达的请求等它的结果，结果再保留几秒。
// 登录、注销之后立即作废，页面紧接着的刷新看到的一定是新状态。
const statusCacheTTL = 5 * time.Second

// networkState 是一次网络探测加在线查询的结果，只读共享，不要修改。
type networkState struct {
	det       *portal.DetectResult
	zone      portal.Zone
	online    *portal.OnlineStatus
	onlineErr error
	at        time.Time
}

type networkStateCache struct {
	mu       sync.Mutex
	last     *networkState
	gen      uint64    // 作废时自增：作废之前开始的探测，结果不再写回缓存
	inflight *netProbe // 当前这一代正在跑的探测，并发请求共用它
}

// netProbe 是一次进行中的探测。done 关闭后 st 可读。
type netProbe struct {
	gen  uint64
	done chan struct{}
	st   *networkState
}

// networkState 返回不超过 statusCacheTTL 的网络状态，必要时现场探测一次。
//
// 登录、注销会作废缓存并丢下进行中的探测：之后到达的请求另起一次，
// 不用先陪着一次已经过时的探测等完（校外时要十几秒）再自己探一遍。
func (s *Server) networkState() *networkState {
	c := &s.netState
	for {
		c.mu.Lock()
		if c.last != nil && time.Since(c.last.at) < statusCacheTTL {
			st := c.last
			c.mu.Unlock()
			return st
		}
		p := c.inflight
		if p == nil {
			p = &netProbe{gen: c.gen, done: make(chan struct{})}
			c.inflight = p
			c.mu.Unlock()
			return s.runNetworkProbe(p)
		}
		c.mu.Unlock()
		<-p.done
		if p.st != nil {
			return p.st
		}
		// 那次探测中途崩了（st 为 nil），自己再来一次。
	}
}

func (s *Server) runNetworkProbe(p *netProbe) *networkState {
	c := &s.netState
	defer func() {
		c.mu.Lock()
		if c.gen == p.gen && p.st != nil {
			c.last = p.st
		}
		if c.inflight == p {
			c.inflight = nil
		}
		c.mu.Unlock()
		close(p.done)
	}()
	det := s.detect()
	zone := s.selectedZone(det.Zone)
	online, err := portal.QueryOnline(zone, s.opts.SrunHost, s.opts.DrcomHost, "", "")
	p.st = &networkState{det: det, zone: zone, online: online, onlineErr: err, at: time.Now()}
	return p.st
}

// invalidateNetworkState 在认证状态可能变化后调用（登录、注销）。
func (s *Server) invalidateNetworkState() {
	c := &s.netState
	c.mu.Lock()
	c.gen++
	c.last = nil
	c.inflight = nil // 还在跑的旧探测照常结束，只是不再有新请求去等它
	c.mu.Unlock()
}
