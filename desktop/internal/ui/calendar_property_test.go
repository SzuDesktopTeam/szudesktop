package ui

import (
	"fmt"
	"math/rand"
	"strings"
	"testing"
	"time"
)

// termFixture 是一份随机生成、满足校历说明页格式约束的学期。
type termFixture struct {
	year, next   int
	semester     string // 一 / 二
	start, end   time.Time
	classesStart time.Time
}

// randomTerm 生成合法学期：秋季学期从 8-9 月开始、春季从 2-3 月开始，学期 90~180 天，
// 上课日是学期开始后 10 天内的某个周一。
func randomTerm(r *rand.Rand) termFixture {
	f := termFixture{year: 2020 + r.Intn(70)}
	f.next = f.year + 1
	var month, startYear int
	if r.Intn(2) == 0 {
		f.semester, month, startYear = "一", 8+r.Intn(2), f.year
	} else {
		f.semester, month, startYear = "二", 2+r.Intn(2), f.next
	}
	f.start = time.Date(startYear, time.Month(month), 1+r.Intn(28), 0, 0, 0, 0, time.UTC)
	f.end = f.start.AddDate(0, 0, 90+r.Intn(91))
	// 10 天内一定有至少一个周一，可能有两个。
	var mondays []time.Time
	for d := 0; d <= 10; d++ {
		if day := f.start.AddDate(0, 0, d); day.Weekday() == time.Monday {
			mondays = append(mondays, day)
		}
	}
	f.classesStart = mondays[r.Intn(len(mondays))]
	return f
}

// render 把学期写成 OCR 会读出来的说明文字：数字有无前导零、有无多余空白、年份分隔符、
// 结束日期带不带年份、有没有「新生」那一句，都随机。
func (f termFixture) render(r *rand.Rand) string {
	num := func(n int) string {
		if r.Intn(2) == 0 {
			return fmt.Sprintf("%02d", n)
		}
		return fmt.Sprint(n)
	}
	dash := []string{"一", "—", "–", "-"}[r.Intn(4)]
	endYear := ""
	if f.end.Year() != f.start.Year() || r.Intn(2) == 0 {
		endYear = fmt.Sprintf("%d年", f.end.Year())
	}
	text := fmt.Sprintf("深圳大学%d%s%d学年第%s学期校历说明 学期为%d年%s月%s日至%s%s月%s日",
		f.year, dash, f.next, f.semester, f.start.Year(), num(int(f.start.Month())), num(f.start.Day()), endYear, num(int(f.end.Month())), num(f.end.Day()))
	if f.semester == "一" && r.Intn(2) == 0 {
		// 新生比老生晚开课；解析必须只认「老生」后面那个。
		fresh := f.classesStart.AddDate(0, 0, 7*(1+r.Intn(4)))
		text += fmt.Sprintf(" 新生开始上课：%s月%s日", num(int(fresh.Month())), num(fresh.Day()))
		text += " 老生"
	}
	sep := []string{"：", ":", "·", ""}[r.Intn(4)]
	if r.Intn(4) == 0 {
		text += fmt.Sprintf(" 本科生上课周数： 第 一 至 十 七 周（%s月%s日、7月3日）", num(int(f.classesStart.Month())), num(f.classesStart.Day()))
	} else {
		text += fmt.Sprintf(" 开始上课%s%s月%s日", sep, num(int(f.classesStart.Month())), num(f.classesStart.Day()))
	}
	// OCR 输出里到处是零散空白，解析前会全部去掉。
	var b strings.Builder
	for _, c := range text {
		b.WriteRune(c)
		if r.Intn(9) == 0 {
			b.WriteString([]string{" ", "\n", "  "}[r.Intn(3)])
		}
	}
	return b.String()
}

// TestPropertyAcademicTermRoundTrip 性质：任意合法学期渲染成说明文字后，解析得到同样的
// 开始 / 结束 / 上课日；周起始恒为上课日前一天（周日）；名称格式固定。
func TestPropertyAcademicTermRoundTrip(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		f := randomTerm(r)
		text := f.render(r)
		got, err := parseAcademicTerm(text, "img")
		if err != nil {
			t.Fatalf("第 %d 例：合法说明被拒：%v\n%s", i, err, text)
		}
		want := academicTerm{
			Name: fmt.Sprintf("%d–%d 学年第%s学期", f.year, f.next, f.semester), Start: f.start.Format("2006-01-02"), End: f.end.Format("2006-01-02"),
			WeekStart: f.classesStart.AddDate(0, 0, -1).Format("2006-01-02"), ClassesStart: f.classesStart.Format("2006-01-02"), Image: "img",
		}
		if got != want {
			t.Fatalf("第 %d 例：解析结果不对\n期望 %+v\n实际 %+v\n%s", i, want, got, text)
		}
		ws, _ := time.Parse("2006-01-02", got.WeekStart)
		if ws.Weekday() != time.Sunday {
			t.Fatalf("第 %d 例：周起始 %s 不是周日", i, got.WeekStart)
		}
	}
}

// TestPropertyAcademicTermRejectsInconsistentDates 性质：从合法说明出发，把上课日改成非周一、
// 改到学期开始前或 10 天后，把学年写错，或把学期拉到 90 天内 / 180 天外，都不能被采用。
func TestPropertyAcademicTermRejectsInconsistentDates(t *testing.T) {
	r := propertyRand(t)
	rejected := 0
	for i := 0; i < propertyCases; i++ {
		f := randomTerm(r)
		kind := r.Intn(5)
		switch kind {
		case 0: // 上课日不是周一
			f.classesStart = f.classesStart.AddDate(0, 0, 1+r.Intn(6))
		case 1: // 上课日在开学前
			f.classesStart = f.classesStart.AddDate(0, 0, -7)
			if !f.classesStart.Before(f.start) {
				continue
			}
		case 2: // 上课日离开学超过 10 天
			f.classesStart = f.classesStart.AddDate(0, 0, 14)
		case 3: // 学年写错
			f.next = f.year + 2
		case 4: // 学期长度离谱
			f.end = f.start.AddDate(0, 0, []int{30, 60, 89, 181, 240}[r.Intn(5)])
		}
		text := f.render(r)
		if got, err := parseAcademicTerm(text, "img"); err == nil {
			t.Fatalf("第 %d 例（变体 %d）：不一致的说明被采用为 %+v\n%s", i, kind, got, text)
		}
		rejected++
	}
	if rejected < propertyCases/2 {
		t.Fatalf("有效变体太少（%d）", rejected)
	}
}
