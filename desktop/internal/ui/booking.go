package ui

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/SzuDesktopTeam/szudesktop/internal/portal"
)

const bookingPublic = "http://swzx.szu.edu.cn/venue-api"

// 写操作必须带着 WebVPN 登录态，只读查询仍走公开入口。
const bookingSecure = "https://swzx.webvpn.szu.edu.cn/venue-api"

var errBookingSession = errors.New("还没拿到预约登录态：请先在官方 WebVPN 打开一次场馆页，再把 Cookie 填进来")

// Redirects and 401s identify a response boundary, not the user's network location.
var errBookingUnreachable = errors.New("学校预约服务要求登录或重定向，本次没有取得公开数据。即使已在校园网，也请在官方 WebVPN 预约页核对；这不代表没有空位")
var errBookingFormat = errors.New("学校预约数据格式变化，本次未显示为成功，请到官方页面核对")

func bookingConnectionError(err error) error {
	var dnsErr *net.DNSError
	var networkErr net.Error
	message := "学校预约服务连接中断或未能建立连接"
	switch {
	case errors.As(err, &dnsErr):
		message = "学校预约服务名称解析失败（DNS）"
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &networkErr) && networkErr.Timeout():
		message = "学校预约服务连接或读取超时"
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		message = "学校预约服务返回空响应，连接在收到完整数据前结束"
	}
	// 查得到学校域名确实被代理的 Fake-IP 接管时，直接说原因和做法，不再让人自己去猜（O7）。
	if u, perr := url.Parse(bookingPublic); perr == nil && schoolFakeIP(context.Background(), u.Hostname()) {
		return errors.New(message + "。" + portal.ProxyTakeoverHint + "；无法据此判断是否在校园网，也可打开官方 WebVPN 预约页核对")
	}
	return errors.New(message + "。无法据此判断是否在校园网；若已在校内，请检查代理、TUN 或 DNS 是否接管学校域名，也可打开官方 WebVPN 预约页核对")
}

// bookingService 同时承担只读查询和预约提交。
//
// 提交分两步：prepare 先重新核对空位并生成一次性 token（两分钟有效），
// commit 拿 token 再校验一遍才真正发出去。这样"看到空位"和"点提交"之间
// 如果位子被别人抢走，会被拦下来，而不是替用户占一个不存在的位子。
//
// 登录态走 WebVPN，Cookie 只放内存：进程结束就没了，不进存档、不落盘。
type bookingService struct {
	mu      sync.Mutex
	client  *http.Client
	cookie  string
	pending *bookingPending
}

// bookingInput 是用户确认过的预约内容。
type bookingInput struct {
	RoomID int    `json:"boothId"`
	Phone  string `json:"phone"`
	Grade  string `json:"grade"`
	Date   string `json:"date"`
	Times  []int  `json:"timeList"`
	Agree  bool   `json:"agree"`
}

// bookingPending 是"已核对但还没提交"的一次预约，靠 token 防重放。
type bookingPending struct {
	Input   bookingInput
	Token   string
	Expires time.Time
}

type bookingRecord struct {
	ID     int         `json:"id"`
	Date   string      `json:"date"`
	Start  string      `json:"reservationStartTime"`
	End    string      `json:"reservationEndTime"`
	Status *int        `json:"status"`
	Room   bookingRoom `json:"booth"`
}

type bookingHistory struct {
	List  []bookingRecord `json:"list"`
	Total *int            `json:"total"`
}
type bookingType struct {
	Name         string `json:"name"`
	Mask         uint64 `json:"availableTimePeriod"`
	Max          int    `json:"samePersonMaxReservationPerDay"`
	Days         int    `json:"lastReservationDayBeforeAppointment"`
	Blacklist    int    `json:"blacklistValidDuration"`
	Announcement string `json:"announcement"`
}

// validate 把「学校字段是否还在我们的假设范围里」收成一处，供场地列表与单场地空位
// 两条路径共用。之前只有 availability 做了这组边界检查，列表路径没做，于是越界的
// Mask/Max/Days 会一路渲染到界面上（前端要对 64 位掩码做算术，越界值直接不可信）。
func (t bookingType) validate() bool {
	return t.Days >= 1 && t.Days <= 31 && t.Max >= 1 && t.Max <= 48 && t.Mask>>48 == 0
}

// UnmarshalJSON 在解码时就剥净 announcement。场地列表里内嵌的 type 与单独查
// /boothType/info 键集相同，两条路径都走这里，不存在某条漏掉的情况。
func (t *bookingType) UnmarshalJSON(b []byte) error {
	type raw bookingType // 剥掉方法，避免递归
	var r raw
	if err := json.Unmarshal(b, &r); err != nil {
		return err
	}
	*t = bookingType(r)
	t.Announcement = plainTextFromSchoolHTML(t.Announcement)
	return nil
}

var (
	// schoolTagRe 匹配任意 HTML 标签；剥完标签的文本里不该再出现它。
	schoolTagRe = regexp.MustCompile(`</?[A-Za-z][^<>]*>`)
	// schoolScriptRe 连内容一起丢掉，避免只剥标签却把脚本代码留在正文里。
	schoolScriptRe = regexp.MustCompile(`(?is)<(script|style)\b[^>]*>.*?</(script|style)\s*>`)
	// schoolCommentRe 去掉 HTML 注释，否则注释文字会原样混进正文。
	schoolCommentRe = regexp.MustCompile(`(?s)<!--.*?-->`)
	// schoolBrRe 换行标签，大小写与 `>` / `/>` / ` />` 几种写法都要认。
	schoolBrRe = regexp.MustCompile(`(?i)<br\s*/?>`)
	// schoolBlockCloseRe 块级元素结束标签一律换行。只换 </p></li> 是不够的：学校用
	// <div>/<h3>/<tr> 排版时，整段文字会被挤成一行、失去原有的分段。
	schoolBlockCloseRe = regexp.MustCompile(`(?i)</(p|div|li|ul|ol|tr|td|th|table|thead|tbody|section|article|header|footer|blockquote|pre|figure|h[1-6]|dd|dt|dl)\s*>`)
)

// plainTextFromSchoolHTML 把学校返回的富文本转成纯文本：块级标签和列表项换成
// 换行，script / style 连内容一起丢，注释丢掉，实体解码，行内空白收敛。
//
// 为什么必须在服务端做：这些文本来自学校，直接渲染等于给外部内容开 HTML 通道。
// 剥成纯文本后前端照旧 esc()，两层都不出问题。
func plainTextFromSchoolHTML(s string) string {
	if s == "" {
		return ""
	}
	s = schoolScriptRe.ReplaceAllString(s, "")
	s = schoolCommentRe.ReplaceAllString(s, "")
	s = schoolBrRe.ReplaceAllString(s, "\n")
	s = schoolBlockCloseRe.ReplaceAllString(s, "\n")
	s = schoolTagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	// 实体解码后可能又冒出换行或新的标签字符，再收敛一次空白。
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")

	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			if blank || len(out) == 0 {
				continue
			}
			blank = true
			out = append(out, "")
			continue
		}
		blank = false
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

type bookingRoom struct {
	ID          int         `json:"id"`
	TypeID      int         `json:"typeId"`
	Name        string      `json:"name"`
	Campus      string      `json:"campus"`
	Community   string      `json:"community"`
	Description string      `json:"description"`
	Enabled     bool        `json:"status"`
	Type        bookingType `json:"type"`
}
type bookingSlot struct {
	Index int    `json:"index"`
	Start string `json:"start"`
	End   string `json:"end"`
	State string `json:"state"`
}
type bookingDay struct {
	Room      bookingRoom   `json:"room"`
	Date      string        `json:"date"`
	Slots     []bookingSlot `json:"slots"`
	FetchedAt time.Time     `json:"fetched_at"`
}

func newBookingService() *bookingService {
	return &bookingService{client: &http.Client{Timeout: 20 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// Every call chooses one fixed origin and path, and every call is a GET.
// The HTTP client has no cookie jar and no write path exists to attach one to.
func (b *bookingService) request(ctx context.Context, path string, query url.Values, target any) error {
	u := bookingPublic + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", ehallUserAgent)
	res, err := b.client.Do(req)
	if err != nil {
		return bookingConnectionError(err)
	}
	defer res.Body.Close()
	if res.StatusCode == 401 || (res.StatusCode >= 300 && res.StatusCode < 400) {
		return errBookingUnreachable
	}
	if res.StatusCode == 403 {
		return errSessionPermission
	}
	if res.StatusCode != 200 {
		return fmt.Errorf("学校预约服务返回 HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, ehallMaxBody+1))
	if err != nil {
		return bookingConnectionError(err)
	}
	if len(data) == 0 {
		return bookingConnectionError(io.EOF)
	}
	if len(data) > ehallMaxBody {
		return errBookingFormat
	}
	var envelope struct {
		Status   int             `json:"status"`
		Data     json.RawMessage `json:"data"`
		Encoding int             `json:"encoding"`
	}
	if json.Unmarshal(data, &envelope) != nil {
		return errBookingFormat
	}
	if envelope.Status == 401 {
		return errBookingUnreachable
	}
	if envelope.Status == 403 {
		return errSessionPermission
	}
	if envelope.Status != 200 {
		return fmt.Errorf("学校预约服务返回状态 %d，本次未显示为成功，请到官方页面核对", envelope.Status)
	}
	if envelope.Encoding != 0 {
		return errBookingFormat
	}
	if target != nil && json.Unmarshal(envelope.Data, target) != nil {
		return errBookingFormat
	}
	return nil
}
func bookingToday(now time.Time) time.Time {
	x := now.In(time.FixedZone("Asia/Shanghai", 8*60*60))
	return time.Date(x.Year(), x.Month(), x.Day(), 0, 0, 0, 0, x.Location())
}
func bookingClock(index int) string { return fmt.Sprintf("%02d:%02d", index/2, (index%2)*30) }

func (b *bookingService) availability(ctx context.Context, id int, date string, now time.Time) (*bookingDay, error) {
	if id <= 0 {
		return nil, errors.New("请选择场地")
	}
	var room bookingRoom
	if err := b.request(ctx, "/booth/info/"+strconv.Itoa(id), nil, &room); err != nil {
		return nil, err
	}
	if room.ID != id || room.Name == "" || room.TypeID <= 0 {
		return nil, errBookingFormat
	}
	if err := b.request(ctx, "/boothType/info/"+strconv.Itoa(room.TypeID), nil, &room.Type); err != nil {
		return nil, err
	}
	if room.Type.Days < 1 || room.Type.Days > 31 || room.Type.Max < 1 || room.Type.Max > 48 || room.Type.Mask>>48 != 0 {
		return nil, errBookingFormat
	}
	today := bookingToday(now)
	day, err := time.ParseInLocation("2006-01-02", date, today.Location())
	// 别拿 lastReservationDayBeforeAppointment 当"最多提前几天"来卡。
	// 实测该字段是 3 时，今天+3 的日期学校仍然正常返回空位（不是边界），
	// 说明它的语义还没核实清楚；拿它当硬限制会白白挡掉本来能约的日子。
	// 这里只做一个宽松兜底，具体开放到哪天交给学校判断。
	if err != nil || day.Before(today) || day.After(today.AddDate(0, 0, 31)) {
		return nil, errors.New("日期超出了可查询范围（只支持未来 31 天内）")
	}
	var days []struct {
		Date  string `json:"date"`
		Times []int  `json:"times"`
	}
	if err = b.request(ctx, fmt.Sprintf("/booth/%d/available-time", id), url.Values{"startDate": {date}, "endDate": {date}}, &days); err != nil {
		return nil, err
	}
	var times []int
	for _, d := range days {
		if d.Date == date {
			if times != nil {
				return nil, errBookingFormat
			}
			times = d.Times
		}
	}
	if len(times) != 48 {
		return nil, errBookingFormat
	}
	out := &bookingDay{Room: room, Date: date, Slots: []bookingSlot{}, FetchedAt: now.UTC()}
	for i, state := range times {
		if room.Type.Mask&(uint64(1)<<i) == 0 {
			continue
		}
		label := "unknown"
		switch state {
		case 1:
			label = "available"
		case 0:
			label = "occupied"
		case -1:
			label = "closed"
		}
		if !room.Enabled {
			label = "closed"
		} else if day.Add(time.Duration(i) * 30 * time.Minute).Before(now) {
			label = "past"
		}
		out.Slots = append(out.Slots, bookingSlot{Index: i, Start: bookingClock(i), End: bookingClock(i + 1), State: label})
	}
	return out, nil
}

func writeBookingError(w http.ResponseWriter, err error) {
	code := 502
	switch {
	case errors.Is(err, errSessionPermission):
		code = 403
	case errors.Is(err, errBookingSession):
		// 还没登录是本地前置条件没满足，不是学校那边出错，别报成 502。
		code = 400
	}
	writeAPIError(w, code, err)
}
func (s *Server) handleBookingRooms(w http.ResponseWriter, r *http.Request) {
	var result struct {
		List  []bookingRoom `json:"list"`
		Total *int          `json:"total"`
	}
	if err := s.booking.request(r.Context(), "/booth/list", url.Values{"current": {"1"}, "pageSize": {"100"}}, &result); err != nil {
		writeBookingError(w, err)
		return
	}
	if result.List == nil || result.Total == nil || *result.Total != len(result.List) {
		writeBookingError(w, errBookingFormat)
		return
	}
	for i := range result.List {
		room := &result.List[i]
		if room.ID <= 0 || room.Name == "" {
			writeBookingError(w, errBookingFormat)
			return
		}
		// 列表这条路上，字段异常只收敛不拒绝。availability 会硬校验 type，因为掩码错
		// 一格就会显示错误的空位；而列表只用 type 展示规则，整份数据因一个场地被扣下
		// 会让用户什么都看不到。收敛成零值后前端显示「—」，等于如实说「这项未知」。
		if !room.Type.validate() {
			room.Type = bookingType{Name: room.Type.Name, Announcement: room.Type.Announcement}
		}
	}
	writeJSON(w, map[string]any{"rooms": result.List, "today": bookingToday(time.Now()).Format("2006-01-02"), "fetched_at": time.Now().UTC()})
}
func (s *Server) handleBookingAvailability(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.URL.Query().Get("room"))
	result, err := s.booking.availability(r.Context(), id, r.URL.Query().Get("date"), time.Now())
	if err != nil {
		writeBookingError(w, err)
		return
	}
	writeJSON(w, result)
}

// ---- 预约提交 ----------------------------------------------------------
//
// 只读查询走公开入口、不需要登录；提交必须带 WebVPN 的登录态。
// 两步式（prepare → commit）是为了让"看到空位"和"真正提交"之间，如果位子
// 被别人抢走能当场发现，而不是替用户占一个并不存在的位子。

// authRequest 发一次带登录态的只读请求。
func (b *bookingService) authRequest(ctx context.Context, path string, query url.Values, target any) error {
	if b.cookie == "" {
		return errBookingSession
	}
	u := bookingSecure + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", ehallUserAgent)
	req.Header.Set("Cookie", b.cookie)
	res, err := b.client.Do(req)
	if err != nil {
		return bookingConnectionError(err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return errBookingSession
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return bookingConnectionError(err)
	}
	if res.StatusCode >= 400 {
		return fmt.Errorf("学校预约服务返回 %d：%s", res.StatusCode, bookingSnippet(raw))
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("学校预约数据格式变了：%w", err)
	}
	return nil
}

// writeRequest 发一次带登录态的写请求。目前只有提交预约用到。
func (b *bookingService) writeRequest(ctx context.Context, path string, payload any) error {
	if b.cookie == "" {
		return errBookingSession
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bookingSecure+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", ehallUserAgent)
	req.Header.Set("Cookie", b.cookie)
	res, err := b.client.Do(req)
	if err != nil {
		return bookingConnectionError(err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return errBookingSession
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return bookingConnectionError(err)
	}
	if res.StatusCode >= 400 {
		return fmt.Errorf("学校预约服务返回 %d：%s", res.StatusCode, bookingSnippet(raw))
	}
	return nil
}

func bookingSnippet(raw []byte) string {
	s := strings.TrimSpace(string(raw))
	if len(s) > 160 {
		return s[:160] + "…"
	}
	return s
}

// history 读「我的预约」，提交前后都用它核对结果。
func (b *bookingService) history(ctx context.Context, page int) (*bookingHistory, error) {
	q := url.Values{}
	q.Set("page", strconv.Itoa(page))
	q.Set("pageSize", "10")
	var out bookingHistory
	if err := b.authRequest(ctx, "/boothReservation/myList", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// validateBooking 在提交前再确认一遍：资料齐全、没超上限、位子还在。
func validateBooking(input bookingInput, day *bookingDay) error {
	grade, err := strconv.Atoi(input.Grade)
	if !input.Agree || err != nil || grade <= 1000 || grade >= 3000 || !regexp.MustCompile(`^1\d{10}$`).MatchString(input.Phone) {
		return errors.New("请填写有效的手机号、入学年份并阅读使用须知")
	}
	if len(input.Times) == 0 || len(input.Times) > day.Room.Type.Max {
		return errors.New("所选时段超过学校单日上限，或没有选择时段")
	}
	free := map[int]bool{}
	for _, slot := range day.Slots {
		free[slot.Index] = slot.State == "available"
	}
	for _, index := range input.Times {
		if !free[index] {
			return errors.New("所选时段已经不可预约，请刷新后重新选择")
		}
		free[index] = false
	}
	return nil
}

func (s *Server) handleBookingSession(w http.ResponseWriter, r *http.Request) {
	b := s.booking
	switch r.Method {
	case http.MethodGet:
		b.mu.Lock()
		has := b.cookie != ""
		b.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "has_session": has})
	case http.MethodPost:
		var in struct {
			Cookie string `json:"cookie"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.Cookie) == "" {
			writeAPIError(w, 400, errors.New("请粘贴 WebVPN 场馆页的 Cookie"))
			return
		}
		b.mu.Lock()
		b.cookie = strings.TrimSpace(in.Cookie)
		b.pending = nil
		b.mu.Unlock()
		// 立刻验证一次：填错就当场说清楚，别等到点提交才发现。
		if _, err := b.history(r.Context(), 1); err != nil {
			b.mu.Lock()
			b.cookie = ""
			b.mu.Unlock()
			writeAPIError(w, 400, err)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "message": "登录态只存在内存里，关掉程序就清除"})
	case http.MethodDelete:
		b.mu.Lock()
		b.cookie = ""
		b.pending = nil
		b.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "message": "已清除登录态"})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleBookingHistory(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	out, err := s.booking.history(r.Context(), page)
	if err != nil {
		writeBookingError(w, err)
		return
	}
	writeJSON(w, out)
}

// handleBookingPrepare 只核对、不提交：重新读一次空位，生成两分钟有效的一次性 token。
func (s *Server) handleBookingPrepare(w http.ResponseWriter, r *http.Request) {
	b := s.booking
	b.mu.Lock()
	defer b.mu.Unlock()
	b.pending = nil
	var input bookingInput
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		writeAPIError(w, 400, errors.New("预约内容格式不正确"))
		return
	}
	if _, err := b.history(r.Context(), 1); err != nil {
		writeBookingError(w, err)
		return
	}
	day, err := b.availability(r.Context(), input.RoomID, input.Date, time.Now())
	if err != nil {
		writeBookingError(w, err)
		return
	}
	if err := validateBooking(input, day); err != nil {
		writeAPIError(w, 400, err)
		return
	}
	var token [24]byte
	if _, err := rand.Read(token[:]); err != nil {
		writeAPIError(w, 500, errors.New("无法准备这次预约"))
		return
	}
	sort.Ints(input.Times)
	b.pending = &bookingPending{Input: input, Token: hex.EncodeToString(token[:]), Expires: time.Now().Add(2 * time.Minute)}
	labels := make([]string, 0, len(input.Times))
	for _, i := range input.Times {
		labels = append(labels, bookingClock(i)+"–"+bookingClock(i+1))
	}
	writeJSON(w, map[string]any{"token": b.pending.Token, "room": day.Room.Name, "date": input.Date, "times": labels})
}

// handleBookingCommit 真正提交。失败要说清「不确定是否成功」，避免用户重复占位。
func (s *Server) handleBookingCommit(w http.ResponseWriter, r *http.Request) {
	b := s.booking
	b.mu.Lock()
	defer b.mu.Unlock()
	var in struct {
		Token string `json:"token"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || b.pending == nil || in.Token != b.pending.Token || time.Now().After(b.pending.Expires) {
		writeAPIError(w, 409, errors.New("这次确认已失效，请重新核对场地和时段"))
		return
	}
	pending := b.pending
	b.pending = nil // 先消费：即使随后超时，同一个 token 也不能提交两次。
	day, err := b.availability(r.Context(), pending.Input.RoomID, pending.Input.Date, time.Now())
	if err != nil {
		writeBookingError(w, err)
		return
	}
	if err := validateBooking(pending.Input, day); err != nil {
		writeAPIError(w, 409, err)
		return
	}
	p := pending.Input
	payload := map[string]any{"boothId": p.RoomID, "phone": p.Phone, "grade": p.Grade, "date": p.Date, "timeList": p.Times}
	if err := b.writeRequest(r.Context(), "/boothReservation/add", payload); err != nil {
		writeAPIError(w, 502, errors.New("没有确认到提交结果。先去「我的预约」或学校原页看一眼，确认没有生成记录再重试，别直接重复提交"))
		return
	}
	writeJSON(w, map[string]any{"ok": true, "message": "学校已接受预约请求，请核对「我的预约」"})
}
