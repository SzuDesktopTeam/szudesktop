package ui

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strconv"
	"testing"
)

// numberOrString 让节次 / 星期既可能是 JSON 数字也可能是数字字符串——学校两种都给过。
func numberOrString(r *rand.Rand, n int) any {
	if r.Intn(2) == 0 {
		return n
	}
	return strconv.Itoa(n)
}

// TestPropertyGraduateTimetableSortedAndComplete 性质：任意合法课表里每条记录都出现一次、按
// （星期，开始节次）稳定排序；已选课程里没有排课的按原顺序进 Unscheduled、排了课的不进；
// 任一记录的日期 / 节次越界或缺课程名，或已选课程缺班级号 / 课程名，整份课表拒绝而不是删掉那一条。
func TestPropertyGraduateTimetableSortedAndComplete(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(12)
		rows := make([]map[string]any, n)
		for j := range rows {
			start := 1 + r.Intn(12)
			rows[j] = map[string]any{
				"KCMC": randomCJK(r, 1, 6), "KCDM": fmt.Sprintf("K%03d", j), "BJDM": fmt.Sprintf("B%03d", j), "JSXM": randomCJK(r, 2, 3),
				"XQ": numberOrString(r, 1+r.Intn(7)), "KSJCDM": numberOrString(r, start), "JSJCDM": numberOrString(r, start+r.Intn(3)),
				"ZCMC": "1-16周", "JASMC": randomCJK(r, 2, 4),
			}
			if r.Intn(4) == 0 {
				rows[j]["BJDM"] = rows[r.Intn(j+1)]["BJDM"] // 同一班级多段排课
			}
		}
		arranged := map[string]bool{}
		for _, row := range rows {
			arranged[row["BJDM"].(string)] = true
		}
		selected := []map[string]any{}
		var wantUnscheduled []string
		for j := 0; j < r.Intn(8); j++ {
			id := fmt.Sprintf("B%03d", r.Intn(n+4))
			selected = append(selected, map[string]any{"KCMC": randomCJK(r, 1, 5), "BJDM": id, "KCDM": "K" + id})
			if !arranged[id] {
				wantUnscheduled = append(wantUnscheduled, id)
			}
		}
		body, _ := json.Marshal(map[string]any{"results": rows, "xkjgList": selected})
		got, err := parseGraduateTimetable(body)
		if err != nil {
			t.Fatalf("第 %d 例：合法课表被拒：%v\n%s", i, err, body)
		}
		if len(got.Entries) != n {
			t.Fatalf("第 %d 例：%d 条记录解出 %d 条", i, n, len(got.Entries))
		}
		for j := 1; j < len(got.Entries); j++ {
			a, b := got.Entries[j-1], got.Entries[j]
			if a.Day > b.Day || (a.Day == b.Day && a.Start > b.Start) {
				t.Fatalf("第 %d 例：排序不对：%+v 在 %+v 之前", i, a, b)
			}
		}
		codes := map[string]int{}
		for _, e := range got.Entries {
			codes[e.Code]++
			if e.Day < 1 || e.Day > 7 || e.Start < 1 || e.End < e.Start || e.End > 30 || e.Name == "" {
				t.Fatalf("第 %d 例：解出了越界记录 %+v", i, e)
			}
		}
		for _, row := range rows {
			if codes[row["KCDM"].(string)] != 1 {
				t.Fatalf("第 %d 例：记录 %v 出现 %d 次", i, row["KCDM"], codes[row["KCDM"].(string)])
			}
		}
		if len(got.Unscheduled) != len(wantUnscheduled) {
			t.Fatalf("第 %d 例：未排课应有 %v，实际 %+v", i, wantUnscheduled, got.Unscheduled)
		}
		for j, e := range got.Unscheduled {
			if e.Code != "K"+wantUnscheduled[j] {
				t.Fatalf("第 %d 例：未排课顺序不对：%+v vs %v", i, got.Unscheduled, wantUnscheduled)
			}
		}

		// 破坏一条记录，整份拒绝。
		if n > 0 {
			bad := rows[r.Intn(n)]
			switch r.Intn(6) {
			case 0:
				bad["XQ"] = []any{0, 8, "x"}[r.Intn(3)]
			case 1:
				bad["KSJCDM"] = 0
			case 2:
				bad["JSJCDM"] = 31
			case 3:
				bad["JSJCDM"] = 0
			case 4:
				bad["KCMC"] = " "
			default:
				delete(bad, "KCMC")
			}
			body, _ = json.Marshal(map[string]any{"results": rows, "xkjgList": selected})
			if got, err := parseGraduateTimetable(body); err == nil {
				t.Fatalf("第 %d 例：越界记录 %v 没被拒，得到 %d 条", i, bad, len(got.Entries))
			}
		} else if len(selected) > 0 {
			selected[r.Intn(len(selected))][[]string{"BJDM", "KCMC"}[r.Intn(2)]] = ""
			body, _ = json.Marshal(map[string]any{"results": rows, "xkjgList": selected})
			if _, err := parseGraduateTimetable(body); err == nil {
				t.Fatalf("第 %d 例：已选课程缺字段没被拒", i)
			}
		}
	}
}

// TestPropertyUndergradTimetableMatchesRows 性质：本科课表按 ehall 分页格式解析时，课程数等于
// 记录数、字段原样（YPSJDD 不改一字）；总数与条数不一致或课程名缺失整份拒绝。
func TestPropertyUndergradTimetableMatchesRows(t *testing.T) {
	r := propertyRand(t)
	for i := 0; i < propertyCases; i++ {
		n := r.Intn(10)
		rows := make([]map[string]any, n)
		for j := range rows {
			rows[j] = map[string]any{"KCM": randomCJK(r, 1, 6), "KCH": fmt.Sprintf("H%03d", j), "KXH": strconv.Itoa(1 + r.Intn(9)), "SKJS": randomCJK(r, 2, 3), "YPSJDD": fmt.Sprintf("%d-%d周 星期%d 第%d-%d节 %s", 1+r.Intn(3), 10+r.Intn(8), 1+r.Intn(7), 1+r.Intn(5), 6+r.Intn(5), randomCJK(r, 2, 4))}
		}
		total := n
		courses, err := parseUndergradTimetable([]byte(scorePageFixture("xskcb", rows, &total)))
		if err != nil || len(courses) != n {
			t.Fatalf("第 %d 例：%d 条记录解出 %d 门：%v", i, n, len(courses), err)
		}
		for j, c := range courses {
			if c.Name != rows[j]["KCM"] || c.Code != rows[j]["KCH"] || c.Arrangement != rows[j]["YPSJDD"] {
				t.Fatalf("第 %d 例：第 %d 门字段变了：%+v vs %v", i, j, c, rows[j])
			}
		}
		if _, err := parseUndergradTimetable([]byte(scorePageFixture("xskcb", rows, nil))); err != nil || n == 0 && false {
			t.Fatalf("第 %d 例：没有总数时按条数为准，不该报错：%v", i, err)
		}
		if n > 0 {
			wrong := n + 1 + r.Intn(3)
			if _, err := parseUndergradTimetable([]byte(scorePageFixture("xskcb", rows, &wrong))); err == nil {
				t.Fatalf("第 %d 例：总数 %d 与条数 %d 不一致却没报错", i, wrong, n)
			}
			rows[r.Intn(n)]["KCM"] = ""
			if _, err := parseUndergradTimetable([]byte(scorePageFixture("xskcb", rows, &total))); err == nil {
				t.Fatalf("第 %d 例：课程名缺失没被拒", i)
			}
		}
	}
}
