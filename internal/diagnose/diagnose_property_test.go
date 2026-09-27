package diagnose

import (
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

// 性质测试：把探测结果换成随机组合，检查诊断建议始终和 portal 的判区规则说的是同一件事。
// 随机源用固定种子，失败时日志里有种子可复现；设置 SZU_PROPERTY_SEED 可换种子。

const propertyCases = 400

func propertyRand(t *testing.T) *rand.Rand {
	t.Helper()
	seed := int64(20260928)
	if s := os.Getenv("SZU_PROPERTY_SEED"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			seed = v
		}
	}
	t.Logf("随机种子 seed=%d（可用 SZU_PROPERTY_SEED 覆盖）", seed)
	return rand.New(rand.NewSource(seed))
}

// randomDetect 造一份跑完探测的结果，区域按 portal 自己的规则定。
func randomDetect(r *rand.Rand) *portal.DetectResult {
	d := &portal.DetectResult{
		Probed: true, InternetOK: r.Intn(2) == 0, SrunDNSOK: r.Intn(2) == 0,
		DormPortalOK: r.Intn(2) == 0, TeachPortalOK: r.Intn(2) == 0,
		SrunUsable: r.Intn(2) == 0, DormUsable: r.Intn(2) == 0,
	}
	if d.InternetOK {
		d.Zone = portal.ZoneOnline
	} else {
		d.Zone, _ = portal.PredictDropZone(d)
	}
	return d
}

// TestPropertyAdvicesFollowProbeResult 性质：不带凭据时不查在线状态；建议里的区域结论与
// PredictDropZone 一致；联网时先说「不用做任何事」再给指纹预判；DNS 不通时（且未联网）一定
// 提醒；命令行参数（--zone / --ip）只在 CLIHints 打开时出现，桌面版一条都不能有。
func TestPropertyAdvicesFollowProbeResult(t *testing.T) {
	r := propertyRand(t)
	old := probe
	t.Cleanup(func() { probe = old })
	for i := 0; i < propertyCases; i++ {
		d := randomDetect(r)
		probe = func() *portal.DetectResult { return d }
		for _, cli := range []bool{false, true} {
			rep := RunWithOptions("", "", "", "", Options{CLIHints: cli})
			if rep.Detect != d || rep.Online != nil || rep.OnlineErr != nil {
				t.Fatalf("第 %d 例：没有凭据时不该查在线状态：%+v", i, rep)
			}
			if len(rep.Advices) == 0 {
				t.Fatalf("第 %d 例：建议不该为空：%+v", i, d)
			}
			text := strings.Join(rep.Advices, "\n")
			zone, reason := portal.PredictDropZone(d)
			if d.InternetOK {
				if !strings.Contains(rep.Advices[0], "当前能正常上外网") || !strings.Contains(text, "协议指纹") || !strings.Contains(text, reason) {
					t.Fatalf("第 %d 例：联网时的建议不对：%q", i, rep.Advices)
				}
				if zone == portal.ZoneTeaching || zone == portal.ZoneDorm {
					if !strings.Contains(text, "按「"+zone.Label()+"」") {
						t.Fatalf("第 %d 例：预判区域 %s 没出现在建议里：%q", i, zone, rep.Advices)
					}
				} else if !strings.Contains(text, "判不出区") {
					t.Fatalf("第 %d 例：两个门户都探不到时应说判不出区：%q", i, rep.Advices)
				}
				if both := d.SrunUsable && d.DormUsable; both != strings.Contains(text, manualTeachingHint(Options{CLIHints: cli})) {
					t.Fatalf("第 %d 例：两套指纹都有时才提示改按教学区（both=%v）：%q", i, both, rep.Advices)
				}
			} else {
				want := map[portal.Zone]string{portal.ZoneTeaching: "你在教学区", portal.ZoneDorm: "你在宿舍区", portal.ZoneOutside: "两个认证门户都连不上"}[zone]
				if want == "" || !strings.Contains(text, want) {
					t.Fatalf("第 %d 例：区域 %s 的建议缺少「%s」：%q", i, zone, want, rep.Advices)
				}
				if hasDNS := strings.Contains(text, "解析不出来"); hasDNS == d.SrunDNSOK {
					t.Fatalf("第 %d 例：DNS 提醒与 SrunDNSOK=%v 不符：%q", i, d.SrunDNSOK, rep.Advices)
				}
			}
			hasCLI := strings.Contains(text, "--zone") || strings.Contains(text, "--ip")
			if !cli && hasCLI {
				t.Fatalf("第 %d 例：桌面版建议里出现了命令行参数：%q", i, rep.Advices)
			}
			wantIP := cli && !d.InternetOK && !d.SrunDNSOK
			if strings.Contains(text, "--ip") != wantIP {
				t.Fatalf("第 %d 例：--ip 提示与预期（%v）不符：%q", i, wantIP, rep.Advices)
			}
		}
	}
	if fingerprintAdvice(nil, Options{}) != "" {
		t.Fatal("nil 探测结果不该产出指纹建议")
	}
}
