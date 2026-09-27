package ui

import (
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/netpref"
	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// 缓存的 ac_id 被服务端拒掉后，桌面端要把这张网的缓存从磁盘上删掉。
//
// portal.Login 自己会跳过缓存重试一次，但以前桌面端没接 OnAcIDRejected，
// 错值一直留在 netpref.json 里：下次登录照样先拿它撞一次 Unknow ac-type。
// 别的网络的缓存不能跟着丢。
func TestAttachAcIDCacheDropsRejectedCacheFromDisk(t *testing.T) {
	t.Setenv("SZUNET_CONFIG_DIR", t.TempDir())
	key := netpref.Egress()
	if key == "" {
		t.Skip("这台机器取不到网关或本机地址，没法按网缓存 ac_id")
	}
	const otherNet = "另一张网"
	prefs := netpref.Load()
	prefs.SetAcID(key, "5")
	prefs.SetAcID(otherNet, "7")
	if err := prefs.Save(); err != nil {
		t.Fatal(err)
	}

	// 地址用不上：缓存命中时定 ac_id 不发任何请求。
	c := portal.NewSrunClient("http://127.0.0.1:1", "123456", "not-real")
	attachAcIDCache(c, true)
	if id, source := c.ResolveAcIDWithSource(); id != "5" || source != portal.AcIDSourceCache {
		t.Fatalf("应该先用这张网缓存的 5，实际 %q（%s）", id, source)
	}
	if c.OnAcIDRejected == nil {
		t.Fatal("没接 OnAcIDRejected：被拒的缓存会一直留在磁盘上")
	}
	c.OnAcIDRejected("5")

	got := netpref.Load()
	if id := got.AcIDFor(key); id != "" {
		t.Fatalf("被拒的缓存应该从磁盘上删掉，实际还留着 %q", id)
	}
	if id := got.AcIDFor(otherNet); id != "7" {
		t.Fatalf("别的网络的缓存不能跟着丢，实际 %q", id)
	}

	// 手动指定时不读缓存，但被拒的通知照样接上，删的也只是这张网的记录。
	manual := portal.NewSrunClient("http://127.0.0.1:1", "123456", "not-real")
	manual.AcID = "9"
	attachAcIDCache(manual, false)
	if id, source := manual.ResolveAcIDWithSource(); id != "9" || source != portal.AcIDSourceManual {
		t.Fatalf("手动指定的编号说了算，实际 %q（%s）", id, source)
	}
	if manual.OnAcIDRejected == nil || manual.OnAcIDResolved == nil {
		t.Fatal("手动指定时也要接上缓存回调")
	}
}
