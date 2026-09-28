package ui

import (
	"fmt"
	"math/rand"
	"strings"
	"testing"
	"time"
)

// randomDate 生成 2000~2099 年间的合法日期（含闰年 2 月 29 日）。
func randomDate(r *rand.Rand) time.Time {
	for {
		d := time.Date(2000+r.Intn(100), time.Month(1+r.Intn(12)), 1+r.Intn(31), 0, 0, 0, 0, time.UTC)
		if d.Day() <= 31 && d.Month() == time.Month(1+((int(d.Month())-1)%12)) {
			return d
		}
	}
}

// renderNoticeDate 用学院站点见过的六种版式之一写出日期。
func renderNoticeDate(r *rand.Rand, d time.Time) string {
	y, m, day := d.Year(), int(d.Month()), d.Day()
	pad := func(n int) string {
		if r.Intn(2) == 0 {
			return fmt.Sprintf("%02d", n)
		}
		return fmt.Sprint(n)
	}
	switch r.Intn(6) {
	case 0:
		return fmt.Sprintf("%d%s%s%s%s", y, []string{"-", ".", "/"}[r.Intn(3)], pad(m), []string{"-", ".", "/"}[r.Intn(3)], pad(day))
	case 1:
		return fmt.Sprintf("%d %s%s%s", y, pad(m), []string{"-", ".", "/"}[r.Intn(3)], pad(day))
	case 2:
		return fmt.Sprintf("%s / %d-%s", pad(day), y, pad(m))
	case 3:
		return fmt.Sprintf("%s%s%s %d", pad(m), []string{"-", ".", "/"}[r.Intn(3)], pad(day), y)
	case 4:
		return fmt.Sprintf("%s %s月 %d", pad(day), pad(m), y)
	default:
		return fmt.Sprintf("%d年%s月%s日", y, pad(m), pad(day))
	}
}

// TestPropertyNoticeDateFromRoundTrip 性质：任意合法日期用六种版式之一写出、前后夹着汉字，
// noticeDateFrom 都还原成同一个 YYYY-MM-DD，且返回匹配到的原文片段；不合法的日期（2 月 30、
// 13 月、非闰年 2 月 29）不会被凑成一个日期。
func TestPropertyNoticeDateFromRoundTrip(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		d := randomDate(r)
		rendered := renderNoticeDate(r, d)
		text := randomCJK(r, 0, 12) + " " + rendered + " " + randomCJK(r, 0, 12)
		got, match := noticeDateFrom(text)
		if want := d.Format("2006-01-02"); got != want || !strings.Contains(rendered, strings.TrimSpace(match)) {
			t.Fatalf("第 %d 例：noticeDateFrom(%q) = %q %q，期望 %q", i, text, got, match, want)
		}
		// 日期本身不合法时，六种版式都不能凑出结果。
		y := 2000 + r.Intn(100)
		bad := []string{
			fmt.Sprintf("%d年2月30日", y), fmt.Sprintf("%d-13-01", y), fmt.Sprintf("%d.04.31", y), fmt.Sprintf("%d年0月1日", y),
		}
		if y%4 != 0 || (y%100 == 0 && y%400 != 0) {
			bad = append(bad, fmt.Sprintf("%d-02-29", y))
		}
		for _, b := range bad {
			if got, _ := noticeDateFrom(randomCJK(r, 0, 5) + b + randomCJK(r, 0, 5)); got != "" {
				t.Fatalf("第 %d 例：非法日期 %q 被凑成 %q", i, b, got)
			}
		}
	}
	if got, _ := noticeDateFrom("2024-02-29"); got != "2024-02-29" {
		t.Fatalf("闰年 2 月 29 日应被接受，实际 %q", got)
	}
}

// noticeFixture 是列表页里的一条公告。
type noticeFixture struct {
	path, title string
	date        time.Time
}

// TestPropertyParseNoticesKeepsEveryDatedItemOnce 性质：一份含 N 条（N ≤ 30）公告的列表页，
// 每条链接指向 /info/x/y.htm、标题 4~180 字、日期落在标题属性 / 链接文本 / 兄弟节点三种位置
// 之一，解析结果按页面顺序恰好 N 条，标题、日期、绝对 https 地址逐条一致；同一链接重复出现
// 只算一次；站外链接和 javascript: 链接不出现。
func TestPropertyParseNoticesKeepsEveryDatedItemOnce(t *testing.T) {
	r := propertyRand(t)
	const base = "https://jwb.szu.edu.cn/index/jwtz.htm"
	for i := 0; i < propertyCases; i++ {
		n := 1 + r.Intn(30)
		items := make([]noticeFixture, n)
		var page strings.Builder
		page.WriteString("<html><body><ul>")
		for j := range items {
			items[j] = noticeFixture{path: fmt.Sprintf("/info/%d/%d.htm", 1000+r.Intn(9), 100+j), title: randomCJK(r, 4, 60), date: randomDate(r)}
			rendered := renderNoticeDate(r, items[j].date)
			switch r.Intn(3) {
			case 0: // 标题属性 + 兄弟节点里的日期
				fmt.Fprintf(&page, `<li><a href="%s" title="%s">%s</a><span class="%s">%s</span></li>`, items[j].path, items[j].title, randomCJK(r, 4, 10), []string{"time", "date", "news_meta", "sj"}[r.Intn(4)], rendered)
			case 1: // 链接文本里带日期
				fmt.Fprintf(&page, `<li><a href="..%s">%s %s</a></li>`, items[j].path, items[j].title, rendered)
			default: // 链接里嵌一个日期节点
				fmt.Fprintf(&page, `<li><a href="%s"><span class="time">%s</span><p>%s</p></a></li>`, items[j].path, rendered, items[j].title)
			}
			if r.Intn(5) == 0 { // 重复链接只算一次
				fmt.Fprintf(&page, `<li><a href="%s">%s %s</a></li>`, items[j].path, randomCJK(r, 4, 8), rendered)
			}
		}
		page.WriteString(`<li><a href="https://evil.example/info/1/1.htm">站外 2026-01-01</a></li><li><a href="javascript:alert(1)">脚本 2026-01-01</a></li></ul></body></html>`)
		got := parseNotices(page.String(), base)
		if len(got) != n {
			t.Fatalf("第 %d 例：%d 条公告解出 %d 条：%+v\n%s", i, n, len(got), got, page.String())
		}
		for j, item := range items {
			want := campusNotice{Title: item.title, URL: "https://jwb.szu.edu.cn" + item.path, Date: item.date.Format("2006-01-02")}
			if got[j] != want {
				t.Fatalf("第 %d 例：第 %d 条不对\n期望 %+v\n实际 %+v\n%s", i, j, want, got[j], page.String())
			}
		}
	}
}
