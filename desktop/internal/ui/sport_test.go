package ui

import (
	"context"
	"strings"
	"testing"
)

// 这些测试不碰真实学校：只验证"字段猜错时不会崩、不会把失败当成没场地"。
// 真实字段要等有会话之后拿 raw_sample 对齐。

func TestParseSportVenuesAcceptsCommonShapes(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
	}{
		{"data.list", `{"data":{"list":[{"XMDM":"1","XMMC":"羽毛球1号"},{"XMDM":"2","XMMC":"羽毛球2号"}]}}`, 2},
		{"data.rows", `{"data":{"rows":[{"id":"3","name":"篮球场"}]}}`, 1},
		{"data array", `{"data":[{"XMDM":"4","XMMC":"网球场"}]}`, 1},
		{"empty list", `{"data":{"list":[]}}`, 0},
	}
	for _, tc := range cases {
		got, err := parseSportVenues([]byte(tc.body))
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if len(got) != tc.want {
			t.Fatalf("%s: 得到 %d 个场地，期望 %d", tc.name, len(got), tc.want)
		}
	}
}

// 会话过期时 ehall 会跳登录页拿回 HTML。这种情况必须报错，
// 绝不能当成"学校没有场地"——那会让用户以为真的没场地可约。
func TestParseSportVenuesRejectsNonJSON(t *testing.T) {
	if _, err := parseSportVenues([]byte("<html>请登录</html>")); err == nil {
		t.Fatal("登录页 HTML 必须报错，不能当成空列表")
	}
	if _, err := parseSportVenues([]byte(`{"data":null}`)); err == nil {
		t.Fatal("data 为 null 必须报错")
	}
}

func TestParseSportTimesKeepsIndexAndRaw(t *testing.T) {
	body := `{"data":{"list":[
		{"KSSJ":"09:00","JSSJ":"10:00","KYYSJD":"1"},
		{"KSSJ":"10:00","JSSJ":"11:00","KYYSJD":"0"}
	]}}`
	day, err := parseSportTimes([]byte(body), "1", "2026-10-21")
	if err != nil {
		t.Fatal(err)
	}
	if len(day.Slots) != 2 {
		t.Fatalf("时段数 %d", len(day.Slots))
	}
	// Index 必须递增：否则前端 data-index 全是 0，点哪格都选中第一格。
	if day.Slots[0].Index != 0 || day.Slots[1].Index != 1 {
		t.Fatalf("Index 没按顺序赋值: %+v", day.Slots)
	}
	if !day.Slots[0].Free || day.Slots[1].Free {
		t.Fatalf("空闲状态解析错: %+v", day.Slots)
	}
	if day.Raw == "" {
		t.Fatal("raw_sample 必须带回原始响应，字段猜错时才有得对齐")
	}
}

func TestSportWithoutSessionIsExplicit(t *testing.T) {
	s := &Server{}
	_, err := s.sportVenues(context.Background())
	if err == nil || !strings.Contains(err.Error(), "登录") {
		t.Fatalf("没有会话时必须明确提示登录，得到: %v", err)
	}
}

func TestValidateSport(t *testing.T) {
	ok := sportInput{RoomID: "1", Date: "2026-10-21", Start: "09:00", End: "10:00", Phone: "13800138000", Kind: "2"}
	if err := validateSport(ok); err != nil {
		t.Fatalf("合法输入被拒: %v", err)
	}
	bad := []struct {
		name string
		in   sportInput
	}{
		{"缺场地", sportInput{Date: ok.Date, Start: ok.Start, End: ok.End, Phone: ok.Phone, Kind: ok.Kind}},
		{"时间倒挂", sportInput{RoomID: "1", Date: ok.Date, Start: "10:00", End: "09:00", Phone: ok.Phone, Kind: ok.Kind}},
		{"手机号", sportInput{RoomID: "1", Date: ok.Date, Start: ok.Start, End: ok.End, Phone: "123", Kind: ok.Kind}},
		{"类型", sportInput{RoomID: "1", Date: ok.Date, Start: ok.Start, End: ok.End, Phone: ok.Phone, Kind: "9"}},
	}
	for _, tc := range bad {
		if err := validateSport(tc.in); err == nil {
			t.Fatalf("%s: 应该被拒", tc.name)
		}
	}
}
