package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// randomTag 生成一个发布标签，并给出它按契约应不应该被认出、认出后的版本值。
// 合法形状是 ^(beta|v)?数字.数字.数字$；其余（大写 V、少一段、多一段、后缀、字母）都不认。
func randomTag(r *rand.Rand) (tag string, valid bool, version [4]int) {
	nums := [3]int{r.Intn(20), r.Intn(20), r.Intn(20)}
	prefix := []string{"", "v", "beta"}[r.Intn(3)]
	parts := make([]string, 3)
	for i, n := range nums {
		parts[i] = strconv.Itoa(n)
		if r.Intn(8) == 0 {
			parts[i] = "0" + parts[i] // 前导零：仍是数字
		}
	}
	tag = prefix + strings.Join(parts, ".")
	valid = true
	version = [4]int{nums[0], nums[1], nums[2], 1}
	if prefix == "beta" {
		version[3] = 0
	}
	switch r.Intn(8) {
	case 0:
		tag, valid = "V"+strings.Join(parts, "."), false
	case 1:
		tag, valid = prefix+parts[0]+"."+parts[1], false
	case 2:
		tag, valid = tag+"."+parts[0], false
	case 3:
		tag, valid = tag+"-rc1", false
	case 4:
		tag, valid = prefix+"-"+strings.Join(parts, "."), false
	case 5:
		tag, valid = "", false
	}
	return tag, valid, version
}

// TestPropertyReleaseVersionParsesExactShape 性质：releaseVersion 恰好接受 (beta|v)?a.b.c；
// 数字按十进制读（前导零无关紧要）；第四位 beta 为 0、其余为 1；v 前缀与无前缀等价。
func TestPropertyReleaseVersionParsesExactShape(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		tag, valid, want := randomTag(r)
		got, ok := releaseVersion(tag)
		if ok != valid || (ok && got != want) {
			t.Fatalf("第 %d 例：releaseVersion(%q) = %v %v，期望 %v %v", i, tag, got, ok, want, valid)
		}
		if ok && !strings.HasPrefix(tag, "beta") {
			plain := strings.TrimPrefix(tag, "v")
			if alt, ok2 := releaseVersion(plain); !ok2 || alt != got {
				t.Fatalf("第 %d 例：%q 与 %q 应等价", i, tag, plain)
			}
			if alt, ok2 := releaseVersion("v" + plain); !ok2 || alt != got {
				t.Fatalf("第 %d 例：%q 与 %q 应等价", i, tag, "v"+plain)
			}
		}
	}
}

// TestPropertyNewerReleaseIsStrictTotalOrder 性质：newerRelease 是严格全序：自反为假、反对称、
// 传递；两个都不「更新」当且仅当版本值相等；同号的正式版比测试版新；主版本大的一定更新。
func TestPropertyNewerReleaseIsStrictTotalOrder(t *testing.T) {
	r := propertyRand(t)
	pick := func() [4]int {
		for {
			if _, ok, v := randomTag(r); ok {
				return v
			}
		}
	}
	for i := 0; i < propertyCases; i++ {
		a, b, c := pick(), pick(), pick()
		if newerRelease(a, a) {
			t.Fatalf("第 %d 例：%v 比自己新", i, a)
		}
		if newerRelease(a, b) && newerRelease(b, a) {
			t.Fatalf("第 %d 例：%v 与 %v 互相更新", i, a, b)
		}
		if !newerRelease(a, b) && !newerRelease(b, a) && a != b {
			t.Fatalf("第 %d 例：%v 与 %v 不可比却不相等", i, a, b)
		}
		if newerRelease(a, b) && newerRelease(b, c) && !newerRelease(a, c) {
			t.Fatalf("第 %d 例：传递性失效 %v > %v > %v", i, a, b, c)
		}
		stable, beta := a, a
		stable[3], beta[3] = 1, 0
		if !newerRelease(stable, beta) || newerRelease(beta, stable) {
			t.Fatalf("第 %d 例：同号正式版应比测试版新：%v", i, a)
		}
		if a[0] > b[0] && !newerRelease(a, b) {
			t.Fatalf("第 %d 例：主版本更大却不更新：%v vs %v", i, a, b)
		}
	}
}

// TestPropertyFetchReleasePicksNewestEligible 性质：两个渠道都从列表里挑标签合法、不是草稿、
// 有发布时间的最新一个（同值取先出现的）；正式版还要排除预发布和 beta 标签。
// 正式版没有符合条件的发布时明确提示；测试版保留空列表提示、非空无效列表报错。
func TestPropertyFetchReleasePicksNewestEligible(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(6)
		items := make([]githubRelease, n)
		versions := make([][4]int, n)
		eligible := make([]bool, n)
		for j := range items {
			tag, valid, version := randomTag(r)
			versions[j] = version
			items[j] = githubRelease{TagName: tag, Draft: r.Intn(5) == 0, Prerelease: r.Intn(2) == 0}
			if r.Intn(6) != 0 {
				items[j].PublishedAt = fmt.Sprintf("2026-09-%02dT00:00:00Z", 1+r.Intn(28))
			}
			eligible[j] = valid && !items[j].Draft && items[j].PublishedAt != ""
		}
		body, _ := json.Marshal(items)
		for _, channel := range []string{"beta", "stable"} {
			bestIndex := -1
			for j, item := range items {
				if !eligible[j] || (channel == "stable" && (item.Prerelease || versions[j][3] == 0)) {
					continue
				}
				if bestIndex == -1 || slices.Compare(versions[j][:], versions[bestIndex][:]) > 0 {
					bestIndex = j
				}
			}
			result, _, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=10", string(body), 200), channel, "")
			switch {
			case bestIndex >= 0:
				want := items[bestIndex]
				if err != nil || !result.Available || result.Version != want.TagName || result.URL != releasesPage+want.TagName || result.PublishedAt != want.PublishedAt || result.Prerelease != (want.Prerelease || versions[bestIndex][3] == 0) {
					t.Fatalf("第 %d 例 %s：应选 %+v，实际 %+v %v（列表 %s）", i, channel, want, result, err, body)
				}
			case channel == "stable":
				if err != nil || result.Available || !strings.Contains(result.Message, "还没有正式版") {
					t.Fatalf("第 %d 例：没有正式版应明确提示，实际 %+v %v", i, result, err)
				}
			case n > 0:
				if err == nil || result.Available {
					t.Fatalf("第 %d 例：没有可识别版本时应报错，实际 %+v %v", i, result, err)
				}
			default:
				if err != nil || result.Available || !strings.Contains(result.Message, "暂时没有公开版本") {
					t.Fatalf("第 %d 例：空列表应给出「暂无公开版本」，实际 %+v %v", i, result, err)
				}
			}
		}
	}
}
