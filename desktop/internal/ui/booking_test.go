package ui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

// bookingFixture 造一个只读的预约服务，学校的公开接口由替身应答。
//
// 替身对三件事零容忍：请求带 Cookie、请求不是 GET、目标不是学校的公开地址。
// 预约的办理在学校官方页面完成，本应用不留写操作通路，也不保存用户粘贴的
// 预约 Cookie（STATUS.md F23）。`/venue-api/boothReservation/*` 没有列进
// switch，任何代码走到那里都会撞上 default 分支而失败。
func bookingFixture(t *testing.T) *Server {
	t.Helper()
	b := newBookingService()
	b.client.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Cookie") != "" {
			t.Fatal("只读查询携带了 Cookie")
		}
		if r.Method != http.MethodGet {
			t.Fatal("预约查询发出了非 GET 请求：" + r.Method)
		}
		if r.URL.Scheme != "http" || r.URL.Host != "swzx.szu.edu.cn" {
			t.Fatal("公开查询的目标被改成了 " + r.URL.Scheme + "://" + r.URL.Host)
		}
		var data any
		switch r.URL.Path {
		case "/venue-api/booth/list":
			data = map[string]any{"list": []any{map[string]any{"id": 1, "typeId": 1, "name": "测试会议室", "status": true}}, "total": 1}
		case "/venue-api/booth/info/1":
			data = map[string]any{"id": 1, "typeId": 1, "name": "测试会议室", "status": true}
		case "/venue-api/boothType/info/1":
			data = map[string]any{"availableTimePeriod": uint64(1)<<28 | uint64(1)<<29 | uint64(1)<<30 | uint64(1)<<31, "samePersonMaxReservationPerDay": 4, "lastReservationDayBeforeAppointment": 3}
		case "/venue-api/booth/1/available-time":
			times := make([]int, 48)
			times[28] = 1
			times[29] = -1
			times[31] = 7
			data = []any{map[string]any{"date": r.URL.Query().Get("startDate"), "times": times}}
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		body, _ := json.Marshal(map[string]any{"status": 200, "data": data})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Request: r}, nil
	})
	return &Server{booking: b}
}

func TestBookingPublicSlotsAreReadOnly(t *testing.T) {
	s := bookingFixture(t)
	now := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	day, err := s.booking.availability(context.Background(), 1, "2026-09-21", now)
	if err != nil || len(day.Slots) != 4 {
		t.Fatal("slot parse", err)
	}
	for i, want := range []string{"available", "closed", "occupied", "unknown"} {
		if day.Slots[i].State != want {
			t.Fatal("official state mapping", day.Slots)
		}
	}
	if day.Slots[0].Start != "14:00" || day.Slots[0].End != "14:30" {
		t.Fatal("half-hour index mapping")
	}
	// lastReservationDayBeforeAppointment 的语义没核实清楚：实测学校在 Days=3 时
	// 仍然对 +3 的日期返回空位，所以本地不再拿它卡，只保留 31 天的宽松兜底。
	if _, err = s.booking.availability(context.Background(), 1, "2026-10-25", now); err == nil {
		t.Fatal("超过 31 天的日期应该被拒")
	}
	if bookingToday(time.Date(2026, 9, 19, 17, 0, 0, 0, time.UTC)).Format("2006-01-02") != "2026-09-20" {
		t.Fatal("not Shenzhen date")
	}
}

func TestBookingFailuresNeverBecomeEmptyOrSuccessful(t *testing.T) {
	for _, body := range []string{`<html>登录</html>`, `{"status":200,"data":null}`, `{"status":200,"data":{"list":[],"total":null}}`, `{"status":200,"encoding":1,"data":"opaque"}`} {
		s := bookingFixture(t)
		s.booking.client.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
		})
		if _, err := s.booking.availability(context.Background(), 1, "2026-09-22", time.Now()); err == nil {
			t.Fatal("unrecognized response accepted", body)
		}
	}
}

// 被网关拦下、重定向到登录页时，不能显示成「这天没有空位」。
func TestBookingRedirectIsNotReportedAsNoAvailability(t *testing.T) {
	s := bookingFixture(t)
	s.booking.client.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: 302,
			Header:     http.Header{"Location": {"https://auth.szu.edu.cn/login"}},
			Body:       io.NopCloser(strings.NewReader("")),
			Request:    r,
		}, nil
	})
	_, err := s.booking.availability(context.Background(), 1, "2026-09-22", time.Now())
	if err == nil {
		t.Fatal("被重定向到登录页却报成查询成功")
	}
	if !strings.Contains(err.Error(), "重定向") || !strings.Contains(err.Error(), "即使已在校园网") {
		t.Fatalf("重定向不能被误判为校外网络：%v", err)
	}
}

func TestBookingTransportFailuresExplainObservedCause(t *testing.T) {
	for _, tc := range []struct {
		cause error
		want  string
	}{
		{&net.DNSError{Err: "no such host", Name: "redacted.invalid"}, "名称解析失败"},
		{context.DeadlineExceeded, "超时"},
		{io.EOF, "空响应"},
		{io.ErrUnexpectedEOF, "空响应"},
		{errors.New("private upstream debug value"), "连接中断"},
	} {
		b := newBookingService()
		b.client.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
			return nil, &url.Error{Op: "Get", URL: r.URL.String(), Err: tc.cause}
		})
		err := b.request(context.Background(), "/booth/list", nil, nil)
		if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), "无法据此判断是否在校园网") || !strings.Contains(err.Error(), "官方 WebVPN") || strings.Contains(err.Error(), "private upstream") || strings.Contains(err.Error(), "redacted.invalid") {
			t.Fatalf("cause %v produced misleading or unsafe error: %v", tc.cause, err)
		}
	}
	b := newBookingService()
	b.client.Transport = calendarTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	})
	if err := b.request(context.Background(), "/booth/list", nil, nil); err == nil || !strings.Contains(err.Error(), "空响应") {
		t.Fatalf("empty HTTP 200 must not become a format or availability result: %v", err)
	}
}

// 写端点在 2026-10-18 按维护者决定恢复（支持应用内提交），但仍要守住三条：
// 方法受限、缺登录态必须拒绝、没有一次性 token 不能提交。
func TestBookingWriteEndpointsRequireConfirmation(t *testing.T) {
	s := &Server{booking: newBookingService()}
	mux := authedRoutes(s, fstest.MapFS{})

	// session 允许查询"有没有登录态"。
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/booking/session", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/booking/session 得到 %d（应为 200）", w.Code)
	}

	// prepare 只收 POST。
	r = httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/booking/prepare", nil)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET /api/booking/prepare 得到 %d（应为 405）", w.Code)
	}

	// 没经过 prepare 就提交，必须 409：不能拿着空 token 去真的写。
	r = httptest.NewRequest(http.MethodPost, "http://127.0.0.1/api/booking/commit", strings.NewReader(`{"token":"whatever"}`))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != http.StatusConflict {
		t.Fatalf("没有确认 token 的提交得到 %d（应为 409）", w.Code)
	}

	// 没有登录态时 prepare 必须直接拒绝，而不是先替用户去学校试一次。
	r = httptest.NewRequest(http.MethodPost, "http://127.0.0.1/api/booking/prepare",
		strings.NewReader(`{"boothId":1,"date":"2026-09-22","timeList":[1],"phone":"13800138000","grade":"2023","agree":true}`))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code == http.StatusOK {
		t.Fatal("没有登录态也能准备预约")
	}
}

// 只读的两个端点必须还在：删死代码不能顺手删掉已实测可用的功能。
func TestBookingReadOnlyEndpointsStillServed(t *testing.T) {
	s := bookingFixture(t)
	mux := authedRoutes(s, fstest.MapFS{})

	for _, path := range []string{"/api/booking/rooms", "/api/booking/availability"} {
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1"+path+"?room=1&date=2026-09-22", nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code == http.StatusNotFound {
			t.Fatalf("%s 被误删了", path)
		}
	}
}
