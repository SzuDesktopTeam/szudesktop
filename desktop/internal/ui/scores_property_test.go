package ui

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

// scoreScenario 描述假教务系统这一轮怎么分页：total 条不同的记录、每页 pageSize 条，
// 以及一种故意制造的异常。
type scoreScenario struct {
	app      scoreApp
	rows     []map[string]any
	pageSize int
	total    *int   // 服务端报的总数；nil 表示不给
	mutation string // none / dupAcrossPages / dropRow / totalChanges / dupWithinPage / noTotal
}

// page 返回第 n 页（从 1 起）的正文。
func (s *scoreScenario) page(n int) string {
	rows := []map[string]any{}
	start, end := (n-1)*s.pageSize, n*s.pageSize
	all := s.rows
	if s.mutation == "dropRow" && len(all) > 0 {
		all = all[:len(all)-1]
	}
	for i := start; i < end && i < len(all); i++ {
		rows = append(rows, all[i])
	}
	if n == 1 && s.mutation == "dupWithinPage" && len(rows) > 0 {
		rows = append(rows, rows[0])
	}
	if n == 2 && s.mutation == "dupAcrossPages" && len(rows) > 0 && len(s.rows) > 0 {
		rows[0] = s.rows[0]
	}
	total := s.total
	if n >= 2 && s.mutation == "totalChanges" && total != nil {
		changed := *total + 1
		total = &changed
	}
	return scorePageFixture(s.app.Dataset, rows, total)
}

// randomScoreRow 生成一条成绩：JXBID 唯一，课程名随机，学分 / 绩点可缺可为字符串。
func randomScoreRow(r *rand.Rand, app scoreApp, i int) map[string]any {
	row := map[string]any{"JXBID": fmt.Sprintf("jxb-%04d", i), "XNXQDM": []string{"2024-2025-1", "2024-2025-2", "2025-2026-1"}[r.Intn(3)], "JSXM": randomCJK(r, 2, 3)}
	name := randomCJK(r, 2, 8)
	if app.Level == "graduate" {
		row["KCMC"], row["DYBFZCJ"] = name, strconv.Itoa(60+r.Intn(41))
	} else {
		row["KCM"], row["ZCJ"] = name, strconv.Itoa(60+r.Intn(41))
	}
	switch r.Intn(3) {
	case 0:
		row["XF"] = float64(1+r.Intn(5)) / 2
	case 1:
		row["XF"] = strconv.Itoa(1 + r.Intn(4))
	}
	switch r.Intn(3) {
	case 0:
		row["JD"] = float64(r.Intn(41)) / 10
	case 1:
		row["JD"] = "null"
	}
	return row
}

// TestPropertyScoresPaginationNeverLosesOrDuplicates 性质：无论学校每页给多少条、总数多少，
// 只要分页自洽，读到的记录集合正好等于学校的全部记录（不丢不重）、Full 为真、按学期倒序 /
// 课程名正序稳定排列；跨页重复、少一条、总数中途变化、页数超过上限时一律报错且不给部分结果；
// 页内重复在总数算上它时被合并、不报错；学校不给总数时只取第一页并如实标注不完整。
func TestPropertyScoresPaginationNeverLosesOrDuplicates(t *testing.T) {
	r := propertyRand(t)
	var current *scoreScenario
	c, _ := newFakeEhall(t, func(dataset string, form url.Values) (int, string) {
		n, _ := strconv.Atoi(form.Get("pageNumber"))
		if dataset != current.app.Dataset || n < 1 || form.Get("pageSize") != strconv.Itoa(scorePageSize) {
			return 500, ""
		}
		return 200, current.page(n)
	})
	for i := 0; i < propertyCases; i++ {
		app, _ := selectScoreApp([]string{"undergrad", "graduate"}[r.Intn(2)])
		total := r.Intn(9)
		if r.Intn(4) == 0 {
			total = r.Intn(700)
		}
		pageSize := 1 + r.Intn(scorePageSize)
		if r.Intn(3) == 0 {
			pageSize = scorePageSize
		}
		rows := make([]map[string]any, total)
		for j := range rows {
			rows[j] = randomScoreRow(r, app, j)
		}
		sc := &scoreScenario{app: app, rows: rows, pageSize: pageSize, total: &total}
		mutations := []string{"none", "none", "none", "dropRow", "dupWithinPage", "noTotal"}
		pages := (total + pageSize - 1) / pageSize
		if pages >= 2 {
			mutations = append(mutations, "dupAcrossPages", "totalChanges")
		}
		sc.mutation = mutations[r.Intn(len(mutations))]
		switch sc.mutation {
		case "noTotal":
			sc.total = nil
		case "dupWithinPage":
			if total == 0 {
				sc.mutation = "none"
			} else {
				plus := total + 1
				sc.total = &plus
			}
		case "dropRow":
			if total == 0 {
				sc.mutation = "none"
			}
		}
		current = sc
		result, err := readScore(c, app)
		where := fmt.Sprintf("第 %d 例（%s，total=%d，每页 %d，%s）", i, app.Level, total, pageSize, sc.mutation)

		switch sc.mutation {
		case "none", "dupWithinPage":
			if pages > scoreMaxPages || (pages == 0 && false) {
				if err == nil || result != nil || !strings.Contains(err.Error(), "读取上限") {
					t.Fatalf("%s：超过页数上限应报错，实际 %+v %v", where, result, err)
				}
				continue
			}
			if err != nil || result == nil || !result.Full || result.Fetched != total || len(result.Items) != total || result.Total == nil || *result.Total != *sc.total || result.Note != "" {
				t.Fatalf("%s：应完整读到 %d 条，实际 %+v %v", where, total, result, err)
			}
			seen := map[string]bool{}
			for _, item := range result.Items {
				if seen[item.Identity] {
					t.Fatalf("%s：记录 %q 出现了两次", where, item.Identity)
				}
				seen[item.Identity] = true
			}
			for _, row := range rows {
				if !seen[row["JXBID"].(string)] {
					t.Fatalf("%s：记录 %v 丢了", where, row["JXBID"])
				}
			}
			for j := 1; j < len(result.Items); j++ {
				a, b := result.Items[j-1], result.Items[j]
				if a.Term < b.Term || (a.Term == b.Term && a.Name > b.Name) {
					t.Fatalf("%s：排序不对：%+v 在 %+v 之前", where, a, b)
				}
			}
		case "noTotal":
			want := min(total, pageSize)
			if err != nil || result == nil || result.Full || result.Total != nil || result.Fetched != want || !strings.Contains(result.Note, "不能据此认定成绩已取全") {
				t.Fatalf("%s：没有总数时应只取第一页 %d 条并标注不完整，实际 %+v %v", where, want, result, err)
			}
		default:
			if err == nil || result != nil {
				t.Fatalf("%s：分页不自洽时应报错且不给部分结果，实际 %+v %v", where, result, err)
			}
			if strings.Contains(err.Error(), "jxb-") {
				t.Fatalf("%s：错误里不该带出成绩记录：%v", where, err)
			}
		}
	}
}

// TestPropertyOptionalNumberAndStr 性质：optionalNumber 对缺失 / null / 空串 / "null" 给 nil；
// 数字与数字字符串在 [0, max] 内按值读出；越界、NaN、非数字文本、别的类型报错。
// str 对多个候选键取第一个非空的，数字按最短十进制写法给出。
func TestPropertyOptionalNumberAndStr(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		max := []float64{5, 100}[r.Intn(2)]
		value := r.Float64()*max*1.4 - max*0.2
		row := map[string]any{}
		asString := r.Intn(2) == 0
		if asString {
			row["XF"] = strconv.FormatFloat(value, 'f', -1, 64)
		} else {
			row["XF"] = value
		}
		got, err := optionalNumber(row, "XF", max)
		inRange := value >= 0 && value <= max
		if inRange && (err != nil || got == nil || *got != value) {
			t.Fatalf("第 %d 例：%v 应读成 %v，实际 %v %v", i, row["XF"], value, got, err)
		}
		if !inRange && (err == nil || got != nil) {
			t.Fatalf("第 %d 例：越界值 %v 应报错", i, row["XF"])
		}
		for _, empty := range []map[string]any{{}, {"XF": nil}, {"XF": ""}, {"XF": " null "}} {
			if got, err := optionalNumber(empty, "XF", max); err != nil || got != nil {
				t.Fatalf("第 %d 例：%v 应视为缺失", i, empty)
			}
		}
		for _, bad := range []any{"abc", true, []any{1}, "NaN", "Inf"} {
			if _, err := optionalNumber(map[string]any{"XF": bad}, "XF", max); err == nil {
				t.Fatalf("第 %d 例：%v 应报错", i, bad)
			}
		}
		name := randomCJK(r, 1, 5)
		row = map[string]any{"A": "", "B": "  ", "C": "null", "D": " " + name + " ", "E": "后面的"}
		if got := str(row, "A", "B", "C", "D", "E"); got != name {
			t.Fatalf("第 %d 例：str 应跳过空值取 %q，实际 %q", i, name, got)
		}
		n := float64(r.Intn(100000)) / 100
		if got := str(map[string]any{"N": n}, "N"); got != strconv.FormatFloat(n, 'f', -1, 64) {
			t.Fatalf("第 %d 例：数字 %v 应写成最短十进制，实际 %q", i, n, got)
		}
	}
	// 学校给出超出 float64 范围的数字时，json 会解成 +Inf 或报错，两种都不能变成一个「成绩数值」。
	var row map[string]any
	if json.Unmarshal([]byte(`{"XF":1e400}`), &row) == nil {
		if _, err := optionalNumber(row, "XF", 100); err == nil {
			t.Fatal("溢出的数字应报错")
		}
	}
}
