package ui

import (
	"context"
	"strings"
	"testing"
)

// 这些测试不碰真实学校：只验证解析对得上真实结构、字段缺失时不崩。

func TestParseSportVenuesReadsXMList(t *testing.T) {
	// 真实响应是平铺的，没有 data 包装。
	body := `{"campusList":[{"XQDM":"1","XQDM_DISPLAY":"粤海校区"}],
	 "xmList":[{"XMDM":"001","XMMC":"羽毛球","XQDM":"1","DCFS":"1.0"},
	           {"XMDM":"002","XMMC":"足球","XQDM":"1","DCFS":"2.0"}],
	 "code":"ok"}`
	got, err := parseSportVenues([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("得到 %d 个项目，期望 2", len(got))
	}
	if got[0].Name != "羽毛球" || got[0].ID != "001" || got[0].Campus != "1" {
		t.Fatalf("字段错位: %+v", got[0])
	}
}

// 会话过期时 ehall 会跳登录页拿回 HTML。这种情况必须报错，
// 绝不能当成"学校没有场地"——那会让用户以为真的没场地可约。
func TestParseSportVenuesRejectsNonJSON(t *testing.T) {
	if _, err := parseSportVenues([]byte("<html>请登录</html>")); err == nil {
		t.Fatal("登录页 HTML 必须报错，不能当成空列表")
	}
}

func TestParseSportVenuesRejectsEmptyList(t *testing.T) {
	for _, body := range []string{`{"xmList":[]}`, `{"xmList":[],"code":"401"}`} {
		if _, err := parseSportVenues([]byte(body)); err == nil {
			t.Fatalf("%s 应该报错，不能静默返回空列表", body)
		}
	}
}

func TestParseSportVenuesSkipsRowsWithoutName(t *testing.T) {
	body := `{"xmList":[{"XMDM":"001"},{"XMDM":"002","XMMC":"足球"}]}`
	got, err := parseSportVenues([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "足球" {
		t.Fatalf("没有名字的行应被跳过，实际: %+v", got)
	}
}

// 少了 lwSzuCgyy 这一段会 403/404，这是实测踩过的坑。
func TestSportAppPathIncludesAppSegment(t *testing.T) {
	if !strings.Contains(sportAppPath, "/lwSzuCgyy/") {
		t.Fatalf("场馆接口路径必须包含应用段 lwSzuCgyy，当前是 %q", sportAppPath)
	}
}

func TestParseSportTimesUsesCodeAndDisabled(t *testing.T) {
	// 真实响应：直接数组，CODE 是 "HH:mm-HH:mm"，disabled 表示不可约。
	body := `[
		{"CODE":"08:00-09:00","disabled":true,"text":"已过期"},
		{"CODE":"10:00-11:00","disabled":false,"text":null}
	]`
	day, err := parseSportTimes([]byte(body), "001", "2026-10-24")
	if err != nil {
		t.Fatal(err)
	}
	if len(day.Slots) != 2 {
		t.Fatalf("时段数 %d", len(day.Slots))
	}
	if day.Slots[0].Start != "08:00" || day.Slots[0].End != "09:00" {
		t.Fatalf("时段没拆开: %+v", day.Slots[0])
	}
	if day.Slots[0].Free {
		t.Fatal("disabled 的时段不该标成可约")
	}
	if day.Slots[0].Note != "已过期" {
		t.Fatalf("不可约原因没带上: %q", day.Slots[0].Note)
	}
	if !day.Slots[1].Free {
		t.Fatal("未 disabled 的时段应可约")
	}
	// Index 必须递增：否则前端 data-index 全是 0，点哪格都选中第一格。
	if day.Slots[0].Index != 0 || day.Slots[1].Index != 1 {
		t.Fatalf("Index 没按顺序赋值: %+v", day.Slots)
	}
	if day.Raw == "" {
		t.Fatal("raw_sample 必须带回原始响应")
	}
}

// 学校返回 {code,msg} 时要把它带到错误里，别只说「解析失败」。
func TestParseSportTimesSurfacesServerCode(t *testing.T) {
	_, err := parseSportTimes([]byte(`{"code":"0011","msg":" 不存在该预约时段"}`), "001", "2026-10-24")
	if err == nil || !strings.Contains(err.Error(), "0011") {
		t.Fatalf("应带上学校返回的错误码，实际: %v", err)
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
