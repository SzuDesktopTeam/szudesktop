package ui

import (
	"strings"
	"testing"
)

func TestParseLibraryItemCopies(t *testing.T) {
	page := `<html><body><table>
	<tr><th>馆藏地(排/架参考)</th><th>索取号</th><th>登录号</th><th>卷期</th><th>年代</th><th>状态</th><th>借阅类型</th></tr>
	<tr><td>南馆4楼工科阅览室(汇智楼四楼5排5架3层)</td><td>TP301.6/K37</td><td>A2233373</td><td></td><td></td><td>可供出借</td><td>中文图书</td></tr>
	<tr><td>丽湖馆B101智能立体书库</td><td>TP301.6/K37</td><td>A2233372</td><td></td><td></td><td>可供出借（在库）</td><td>中文图书</td></tr>
	</table></body></html>`
	out, err := parseLibraryItem(strings.NewReader(page), "3750028")
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Copies) != 2 {
		t.Fatalf("馆藏条数应为 2，实际 %d", len(out.Copies))
	}
	c := out.Copies[0]
	if c.CallNo != "TP301.6/K37" || c.Status != "可供出借" {
		t.Fatalf("字段错位: %+v", c)
	}
	if !strings.Contains(c.Location, "汇智楼") {
		t.Fatalf("馆藏地没取到: %q", c.Location)
	}
}

// 表头缺「索取号」或「状态」的表（导航、分页）不能被当成馆藏。
func TestParseLibraryItemIgnoresOtherTables(t *testing.T) {
	page := `<html><body>
	<table><tr><td>页脚</td><td>导航</td></tr><tr><td>1</td><td>2</td></tr></table>
	</body></html>`
	if _, err := parseLibraryItem(strings.NewReader(page), "1"); err == nil {
		t.Fatal("非馆藏页必须报错，不能返回空列表")
	}
}

func TestFetchLibraryItemRejectsBadCtrlNo(t *testing.T) {
	for _, bad := range []string{"", "abc", "1 or 1=1", "../../etc"} {
		if _, err := fetchLibraryItem(t.Context(), bad); err == nil {
			t.Fatalf("%q 应该被拒绝", bad)
		}
	}
}
