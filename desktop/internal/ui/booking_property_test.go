package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// bookingScenario 是假预约服务这一轮的数据。
type bookingScenario struct {
	id, typeID   int
	enabled      bool
	mask         uint64
	days, max    int
	times        []int
	date         string
	unexpectedID bool // /booth/info 回另一个场地的 id
}

func (s *bookingScenario) respond(r *http.Request) (*http.Response, error) {
	var data any
	switch r.URL.Path {
	case "/venue-api/booth/info/" + strconv.Itoa(s.id):
		id := s.id
		if s.unexpectedID {
			id++
		}
		data = map[string]any{"id": id, "typeId": s.typeID, "name": "琴房", "status": s.enabled}
	case "/venue-api/boothType/info/" + strconv.Itoa(s.typeID):
		data = map[string]any{"name": "类型", "availableTimePeriod": s.mask, "samePersonMaxReservationPerDay": s.max, "lastReservationDayBeforeAppointment": s.days}
	case fmt.Sprintf("/venue-api/booth/%d/available-time", s.id):
		data = []any{map[string]any{"date": r.URL.Query().Get("startDate"), "times": s.times}}
	default:
		return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	}
	body, _ := json.Marshal(map[string]any{"status": 200, "data": data})
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Request: r}, nil
}

// TestPropertyBookingAvailabilityFollowsMaskWindowAndClock 性质：空位列表恰好包含掩码里置位的
// 那些半小时格、按序号升序、起止时间按格号换算；场地停用则全部 closed；已过去的格标 past；
// 其余按学校状态 1/0/-1 映射，别的值标 unknown。类型字段越界、日期在今天之前或超出可预约天数、
// 场地 id 对不上，一律报错而不是给出半份结果。
func TestPropertyBookingAvailabilityFollowsMaskWindowAndClock(t *testing.T) {
	r := propertyRand(t)
	var current *bookingScenario
	b := newBookingService()
	b.client.Transport = calendarTransport(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodGet || req.Header.Get("Cookie") != "" {
			t.Fatal("只读查询发出了非 GET 请求或带了 Cookie")
		}
		return current.respond(req)
	})
	for i := 0; i < propertyCases; i++ {
		now := time.Date(2026, time.Month(1+r.Intn(12)), 1+r.Intn(28), r.Intn(24), r.Intn(60), 0, 0, time.UTC)
		today := bookingToday(now)
		sc := &bookingScenario{id: 1 + r.Intn(50), typeID: 1 + r.Intn(9), enabled: r.Intn(4) != 0, mask: r.Uint64() >> 16, days: 1 + r.Intn(31), max: 1 + r.Intn(48), times: make([]int, 48)}
		for j := range sc.times {
			sc.times[j] = []int{-1, 0, 1, 1, 7}[r.Intn(5)]
		}
		invalidType := false
		switch r.Intn(10) {
		case 0:
			sc.days, invalidType = []int{0, 32, -1}[r.Intn(3)], true
		case 1:
			sc.max, invalidType = []int{0, 49}[r.Intn(2)], true
		case 2:
			sc.mask, invalidType = sc.mask|uint64(1)<<(48+r.Intn(16)), true
		case 3:
			sc.unexpectedID = true
		}
		offset := r.Intn(sc.days+3) - 1 // -1 是昨天，days 及以后超出窗口
		if sc.days <= 0 {
			offset = 0
		}
		day := today.AddDate(0, 0, offset)
		sc.date = day.Format("2006-01-02")
		inWindow := offset >= 0 && offset < sc.days && sc.days >= 1 && sc.days <= 31
		current = sc

		got, err := b.availability(context.Background(), sc.id, sc.date, now)
		where := fmt.Sprintf("第 %d 例（days=%d max=%d mask=%x offset=%d enabled=%v badID=%v）", i, sc.days, sc.max, sc.mask, offset, sc.enabled, sc.unexpectedID)
		if invalidType || sc.unexpectedID || !inWindow {
			if err == nil || got != nil {
				t.Fatalf("%s：应报错，实际 %+v", where, got)
			}
			continue
		}
		if err != nil || got == nil {
			t.Fatalf("%s：应成功，实际 %v", where, err)
		}
		var want []bookingSlot
		for j := 0; j < 48; j++ {
			if sc.mask&(1<<uint(j)) == 0 {
				continue
			}
			state := map[int]string{1: "available", 0: "occupied", -1: "closed"}[sc.times[j]]
			if state == "" {
				state = "unknown"
			}
			if !sc.enabled {
				state = "closed"
			} else if day.Add(time.Duration(j) * 30 * time.Minute).Before(now) {
				state = "past"
			}
			want = append(want, bookingSlot{Index: j, Start: fmt.Sprintf("%02d:%02d", j/2, j%2*30), End: fmt.Sprintf("%02d:%02d", (j+1)/2, (j+1)%2*30), State: state})
		}
		if len(got.Slots) != len(want) {
			t.Fatalf("%s：应有 %d 格，实际 %d：%+v", where, len(want), len(got.Slots), got.Slots)
		}
		for j := range want {
			if got.Slots[j] != want[j] {
				t.Fatalf("%s：第 %d 格不对：%+v，期望 %+v", where, j, got.Slots[j], want[j])
			}
		}
		if got.Date != sc.date || got.Room.ID != sc.id || got.Room.Enabled != sc.enabled {
			t.Fatalf("%s：返回的场地 / 日期不对：%+v", where, got)
		}
	}
}

// TestPropertyPlainTextFromSchoolHTMLShape 性质：任意由文本、块级 / 行内标签、<br>、注释、
// script / style、实体拼成的富文本，剥成纯文本后：可见文字按原顺序全部保留，script / style 正文
// 与注释一个字不留，没有 \r，首尾无空白，没有连续两个空行，每行内部空白收敛成单个空格。
func TestPropertyPlainTextFromSchoolHTMLShape(t *testing.T) {
	r := propertyRand(t)
	blocks := []string{"p", "div", "li", "h3", "td", "tr", "section", "blockquote"}
	inlines := []string{"b", "strong", "span", "em", "a"}
	for i := 0; i < propertyCases; i++ {
		var visible, hidden []string
		var b strings.Builder
		for j := 0; j < 1+r.Intn(10); j++ {
			switch r.Intn(8) {
			case 0, 1:
				text := randomCJK(r, 1, 8)
				visible = append(visible, text)
				b.WriteString(text)
			case 2:
				tag, text := blocks[r.Intn(len(blocks))], randomCJK(r, 1, 8)
				visible = append(visible, text)
				fmt.Fprintf(&b, "<%s style=\"x\">%s</%s>", tag, text, strings.ToUpper(tag))
			case 3:
				tag, text := inlines[r.Intn(len(inlines))], randomCJK(r, 1, 8)
				visible = append(visible, text)
				fmt.Fprintf(&b, "<%s href=\"#\">%s</%s>", tag, text, tag)
			case 4:
				b.WriteString([]string{"<br>", "<BR/>", "<br />", "\r\n", "\n\n\n", "   "}[r.Intn(6)])
			case 5:
				text := randomCJK(r, 1, 6)
				hidden = append(hidden, text)
				fmt.Fprintf(&b, "<!-- %s -->", text)
			case 6:
				text := randomCJK(r, 1, 6)
				hidden = append(hidden, text)
				tag := []string{"script", "style"}[r.Intn(2)]
				fmt.Fprintf(&b, "<%s type=\"x\">alert('%s')</%s >", tag, text, tag)
			case 7:
				b.WriteString([]string{"&nbsp;", "&amp;", "&#20;", "&quot;", "&emsp;"}[r.Intn(5)])
			}
		}
		got := plainTextFromSchoolHTML(b.String())
		if strings.Contains(got, "\r") || strings.TrimSpace(got) != got || strings.Contains(got, "\n\n\n") {
			t.Fatalf("第 %d 例：形状不对 %q\n输入 %q", i, got, b.String())
		}
		for _, line := range strings.Split(got, "\n") {
			if line != strings.Join(strings.Fields(line), " ") {
				t.Fatalf("第 %d 例：行内空白没有收敛 %q", i, line)
			}
		}
		if schoolTagRe.MatchString(got) {
			t.Fatalf("第 %d 例：还留着标签 %q", i, got)
		}
		rest := got
		for _, text := range visible {
			idx := strings.Index(rest, text)
			if idx < 0 {
				t.Fatalf("第 %d 例：可见文字 %q 丢了或乱序：%q\n输入 %q", i, text, got, b.String())
			}
			rest = rest[idx+len(text):]
		}
		for _, text := range hidden {
			if strings.Contains(got, text) {
				t.Fatalf("第 %d 例：脚本 / 注释里的 %q 漏进正文：%q", i, text, got)
			}
		}
	}
}
