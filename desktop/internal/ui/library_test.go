package ui

import (
	"strings"
	"testing"
)

func TestParseLibraryRows(t *testing.T) {
	page := `<html><body><table>
	<tr><th>序号</th><th>题名</th><th>责任者</th><th>出版者</th></tr>
	<tr><td>1</td><td>算法导论</td><td>科曼 著</td><td>机械工业出版社</td></tr>
	<tr><td>2</td><td>随机算法导论</td><td>张鹏 著</td><td>山东大学出版社</td></tr>
	</table></body></html>`
	items, err := parseLibraryRows(strings.NewReader(page))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("解析出 %d 条，期望 2", len(items))
	}
	if items[0].Title != "算法导论" || items[0].Author != "科曼 著" || items[0].Publisher != "机械工业出版社" {
		t.Fatalf("字段错位: %+v", items[0])
	}
}

// 表头行不能被当成一本书。
func TestParseLibraryRowsSkipsHeader(t *testing.T) {
	page := `<table><tr><td>序号</td><td>题名</td><td>责任者</td><td>出版者</td></tr></table>`
	if _, err := parseLibraryRows(strings.NewReader(page)); err == nil {
		t.Fatal("只有表头时必须报「没有结果」，不能返回一条叫「题名」的书")
	}
}

// 页面改版或登录页被当成结果时，必须报错而不是静默空列表。
func TestParseLibraryRowsRejectsUnexpectedPage(t *testing.T) {
	if _, err := parseLibraryRows(strings.NewReader(`<html><body>请登录</body></html>`)); err == nil {
		t.Fatal("非结果页必须报错")
	}
}

func TestParseLibraryRowsIgnoresNavigationAndPagingTables(t *testing.T) {
	page := `<html><body>
	<table><tr><td>首页</td><td>馆藏检索</td><td>我的图书馆</td></tr></table>
	<table><tr><th>序号</th><th>题名</th><th>责任者</th><th>出版者</th></tr>
	<tr><td>1</td><td><a href="bookinfo.aspx?ctrlno=123">合成测试书目</a></td><td>测试作者</td><td>测试出版社</td></tr></table>
	<table><tr><td>上一页</td><td>第 1 页</td><td>下一页</td></tr></table>
	</body></html>`
	items, err := parseLibraryRows(strings.NewReader(page))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Title != "合成测试书目" || items[0].CtrlNo != "123" {
		t.Fatalf("导航和分页不能成为书目: %+v", items)
	}
}

func TestParseLibraryRowsRejectsUnrecognizedTable(t *testing.T) {
	page := `<table><tr><td>账号</td><td>登录学校图书馆</td><td>请先登录</td></tr></table>`
	if items, err := parseLibraryRows(strings.NewReader(page)); err == nil {
		t.Fatalf("没有书目表头的页面不能成为成功检索结果: %+v", items)
	}
}

func TestLibrarySearchRejectsEmptyKeyword(t *testing.T) {
	if _, err := fetchLibrarySearch(t.Context(), "   ", 1); err == nil {
		t.Fatal("空检索词应被拒绝，而不是发出一次无意义请求")
	}
}
