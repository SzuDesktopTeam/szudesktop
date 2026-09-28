package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
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

// TestPropertyFetchReleasePicksNewestEligible 性质：测试版渠道从列表里挑「标签合法、不是草稿、
// 有发布时间」的最新一个（同值取先出现的）；一个都没有时，列表非空就报错、列表为空就给出
// 「暂无公开版本」；正式版渠道只在单个发布合法、非草稿、非预发布、非 beta 标签时可用。
func TestPropertyFetchReleasePicksNewestEligible(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(6)
		items := make([]githubRelease, n)
		var best [4]int
		var want *githubRelease
		for j := range items {
			tag, valid, version := randomTag(r)
			items[j] = githubRelease{TagName: tag, Draft: r.Intn(5) == 0, Prerelease: r.Intn(2) == 0}
			if r.Intn(6) != 0 {
				items[j].PublishedAt = fmt.Sprintf("2026-09-%02dT00:00:00Z", 1+r.Intn(28))
			}
			eligible := valid && !items[j].Draft && items[j].PublishedAt != ""
			if eligible && (want == nil || newerRelease(version, best)) {
				best, want = version, &items[j]
			}
		}
		body, _ := json.Marshal(items)
		result, _, err := fetchRelease(context.Background(), releaseClient(t, releasesAPI+"?per_page=10", string(body), 200), "beta", "")
		switch {
		case want != nil:
			if err != nil || !result.Available || result.Version != want.TagName || result.URL != releasesPage+want.TagName || result.PublishedAt != want.PublishedAt || result.Prerelease != (want.Prerelease || best[3] == 0) {
				t.Fatalf("第 %d 例：应选 %+v，实际 %+v %v（列表 %s）", i, want, result, err, body)
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

		tag, valid, version := randomTag(r)
		single := githubRelease{TagName: tag, Draft: r.Intn(4) == 0, Prerelease: r.Intn(3) == 0, PublishedAt: "2026-09-27T00:00:00Z"}
		if r.Intn(5) == 0 {
			single.PublishedAt = ""
		}
		body, _ = json.Marshal(single)
		result, _, err = fetchRelease(context.Background(), releaseClient(t, releasesAPI+"/latest", string(body), 200), "stable", "")
		wantStable := valid && !single.Draft && single.PublishedAt != "" && !single.Prerelease && version[3] == 1
		if wantStable && (err != nil || !result.Available || result.Version != tag || result.Prerelease) {
			t.Fatalf("第 %d 例：正式版 %+v 应可用，实际 %+v %v", i, single, result, err)
		}
		if !wantStable && result.Available {
			t.Fatalf("第 %d 例：正式版渠道不该把 %+v 当成可用", i, single)
		}
	}
}
