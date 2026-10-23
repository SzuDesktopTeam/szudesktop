package ui

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// 体育场馆在 ehall 里另一个应用（qljfwapp），和教务、研究生各走各的接口。
// 和琴房社区空间（swzx）是完全不同的两套，别混。
//
// 提交的字段名（CGDM / CDWID / XMDM / XQWID / KYYSJD / YYRQ / YYLX / YYKS / YYJS）
// 来自调研笔记，实际取值要以真实会话实测为准；没实测过的解析都先按「宽松读取」写，
// 字段缺失时返回空而不是瞎猜。

const sportAppPath = "/qljfwapp/sys/lwSzuCgyy/sportVenue"

// 应用首页。ehall 的 .do 接口要先打开它建立应用上下文，否则一律 403。
const sportAppIndex = "/qljfwapp/sys/lwSzuCgyy/index.do"

type sportService struct{}

// sportRoom 是一个可订场地（羽毛球 1 号场、篮球场 2 号场之类）。
type sportRoom struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Campus   string `json:"campus"` // 1 粤海 2 丽湖
	Kind     string `json:"kind"`   // 1 包场 2 散场
	Price    string `json:"price"`
	MaxSlots int    `json:"max_slots"` // 单次最多约几格
}

// sportSlot 是一格可订时段。
type sportSlot struct {
	Index int    `json:"index"`
	Start string `json:"start"`
	End   string `json:"end"`
	Free  bool   `json:"free"`
	Note  string `json:"note,omitempty"` // 不可约时的原因：已过期 / 无开放场地
}

type sportDay struct {
	Room      sportRoom   `json:"room"`
	Date      string      `json:"date"`
	Slots     []sportSlot `json:"slots"`
	FetchedAt time.Time   `json:"fetched_at"`
	Raw       string      `json:"raw_sample,omitempty"` // 调试用：学校返回的开头一段
}

type sportInput struct {
	RoomID  string `json:"room_id"`
	Date    string `json:"date"`
	Start   string `json:"start"` // HH:MM
	End     string `json:"end"`
	Phone   string `json:"phone"`
	Kind    string `json:"kind"` // 1 包场 / 2 散场
}

type sportPending struct {
	Input   sportInput
	Token   string
	Expires time.Time
}

func newSportService() *sportService { return &sportService{} }

// sportClient 从当前会话建一个 ehall 客户端。没登录返回明确错误。
//
// 优先复用 CAS 已认证的客户端：从学校窗口导入的登录态就走这条路，
// 不必把 Cookie 再写进 sessionStore（少落一次盘）。
func (s *Server) sportClient() (*ehallClient, error) {
	if s.cas != nil {
		s.cas.mu.Lock()
		authed, client := s.cas.authenticated, s.cas.client
		s.cas.mu.Unlock()
		if authed && client != nil {
			return &ehallClient{cookie: "", usesJar: true, base: ehallBaseURL, http: client}, nil
		}
	}
	if s.session == nil {
		return nil, errors.New("还没有学校系统的登录状态，请先在「校园服务」登录")
	}
	sess, err := s.session.Load()
	if err != nil || strings.TrimSpace(sess.Cookie) == "" {
		return nil, errors.New("还没有学校系统的登录状态，请先在「校园服务」登录")
	}
	if s.ehallFactory != nil {
		return s.ehallFactory(sess.Cookie), nil
	}
	return newEhallClient(sess.Cookie, 0), nil
}

// sportVenues 读场地类型/校区配置。
func (s *Server) sportVenues(ctx context.Context) ([]sportRoom, error) {
	c, err := s.sportClient()
	if err != nil {
		return nil, err
	}
	if _, err := c.getContext(ctx, sportAppIndex); err != nil {
		return nil, err
	}
	body, err := c.postFormContext(ctx, sportAppPath+"/getSportVenueData.do", url.Values{})
	if err != nil {
		return nil, err
	}
	return parseSportVenues(body)
}

// parseSportVenues 读运动项目。真实响应是平铺的，没有 data 包装：
//
//	{"campusList":[{"XQDM":"1","XQDM_DISPLAY":"粤海校区"}],
//	 "xmList":[{"XMDM":"..","XMMC":"..","XQDM":"..","DCFS":".."}], ...}
//
// 空列表要报错：会话过期时学校常返回空数组，直接说"没有场地"会误导。
func parseSportVenues(body []byte) ([]sportRoom, error) {
	var root struct {
		XMList []map[string]json.RawMessage `json:"xmList"`
		Code   json.RawMessage              `json:"code"`
	}
	if err := json.Unmarshal(body, &root); err != nil {
		return nil, fmt.Errorf("学校场馆数据不是 JSON：%w", err)
	}
	if len(root.XMList) == 0 {
		if len(root.Code) > 0 {
			return nil, fmt.Errorf("学校返回 %s（多半是登录状态已过期）", string(root.Code))
		}
		return nil, errors.New("学校没有返回运动项目（可能登录状态已过期）")
	}
	out := make([]sportRoom, 0, len(root.XMList))
	for _, m := range root.XMList {
		room := sportRoom{
			ID:     pickStr(m, "XMDM"),
			Name:   pickStr(m, "XMMC"),
			Campus: pickStr(m, "XQDM"),
			Kind:   pickStr(m, "DCFS"),
		}
		if room.Name != "" {
			out = append(out, room)
		}
	}
	return out, nil
}

// sportTimes 读某天的可订时段。
func (s *Server) sportTimes(ctx context.Context, roomID, date string) (*sportDay, error) {
	c, err := s.sportClient()
	if err != nil {
		return nil, err
	}
	form := url.Values{}
	form.Set("YYRQ", date)
	form.Set("YYLX", "1.0")
	if roomID != "" {
		form.Set("XMDM", roomID)
	}
	body, err := c.postFormContext(ctx, sportAppPath+"/getTimeList.do", form)
	if err != nil {
		return nil, err
	}
	return parseSportTimes(body, roomID, date)
}

func parseSportTimes(body []byte, roomID, date string) (*sportDay, error) {
	// 真实响应是直接数组，每个时段带 CODE（"08:00-09:00"）和 disabled/text：
	//
	//	[{"WID":"..","CODE":"08:00-09:00","disabled":true,"text":"已过期"}, ...]
	//
	// disabled 为 true 时 text 说明原因（"已过期" / "无开放场地"）。
	var rows []struct {
		Code     string `json:"CODE"`
		Name     string `json:"NAME"`
		Disabled bool   `json:"disabled"`
		Text     string `json:"text"`
	}
	if err := json.Unmarshal(body, &rows); err != nil {
		// 可能是 {code,msg} 形式的错误对象，或是登录页 HTML。
		var errObj struct {
			Code string `json:"code"`
			Msg  string `json:"msg"`
		}
		if json.Unmarshal(body, &errObj) == nil && errObj.Code != "" {
			return nil, fmt.Errorf("学校返回 %s：%s", errObj.Code, strings.TrimSpace(errObj.Msg))
		}
		return nil, fmt.Errorf("学校时段数据不是 JSON：%w", err)
	}

	out := &sportDay{Date: date, Room: sportRoom{ID: roomID}, Slots: []sportSlot{}, FetchedAt: time.Now().UTC()}
	if len(body) > 400 {
		out.Raw = string(body[:400])
	} else {
		out.Raw = string(body)
	}
	for i, r := range rows {
		start, end := splitSlotCode(r.Code, r.Name)
		slot := sportSlot{Index: i, Start: start, End: end, Free: !r.Disabled}
		if r.Disabled {
			slot.Note = strings.TrimSpace(r.Text)
		}
		out.Slots = append(out.Slots, slot)
	}
	return out, nil
}

// splitSlotCode 把 "08:00-09:00" 拆成起止时间；拆不开就原样返回。
func splitSlotCode(code, name string) (string, string) {
	text := strings.TrimSpace(code)
	if text == "" {
		text = strings.TrimSpace(name)
	}
	for _, sep := range []string{"-", "—", "~", "至"} {
		if i := strings.Index(text, sep); i > 0 {
			return strings.TrimSpace(text[:i]), strings.TrimSpace(text[i+len(sep):])
		}
	}
	return text, ""
}

// ---- 提交（两步式） ------------------------------------------------------

func validateSport(input sportInput) error {
	if strings.TrimSpace(input.RoomID) == "" {
		return errors.New("请选择场地")
	}
	if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(input.Date) {
		return errors.New("请选择日期")
	}
	if !regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`).MatchString(input.Start) ||
		!regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`).MatchString(input.End) {
		return errors.New("请选择起止时间")
	}
	if input.Start >= input.End {
		return errors.New("开始时间要早于结束时间")
	}
	if !regexp.MustCompile(`^1\d{10}$`).MatchString(input.Phone) {
		return errors.New("请填写有效的手机号")
	}
	if input.Kind != "1" && input.Kind != "2" {
		return errors.New("请选择包场还是散场")
	}
	return nil
}

func (s *Server) handleSportVenues(w http.ResponseWriter, r *http.Request) {
	out, err := s.sportVenues(r.Context())
	if err != nil {
		writeBookingError(w, err)
		return
	}
	writeJSON(w, map[string]any{"rooms": out, "fetched_at": time.Now().UTC()})
}

func (s *Server) handleSportTimes(w http.ResponseWriter, r *http.Request) {
	room := r.URL.Query().Get("room")
	date := r.URL.Query().Get("date")
	out, err := s.sportTimes(r.Context(), room, date)
	if err != nil {
		writeBookingError(w, err)
		return
	}
	writeJSON(w, out)
}

func (s *Server) handleSportPrepare(w http.ResponseWriter, r *http.Request) {
	s.sportMu.Lock()
	defer s.sportMu.Unlock()
	s.sportPending = nil
	var input sportInput
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		writeAPIError(w, 400, errors.New("预约内容格式不正确"))
		return
	}
	if err := validateSport(input); err != nil {
		writeAPIError(w, 400, err)
		return
	}
	// 提交前再核对一次时段还在不在
	day, err := s.sportTimes(r.Context(), input.RoomID, input.Date)
	if err != nil {
		writeBookingError(w, err)
		return
	}
	ok := false
	for _, slot := range day.Slots {
		if slot.Start == input.Start && slot.End == input.End {
			ok = slot.Free
			break
		}
	}
	if !ok {
		writeAPIError(w, 409, errors.New("所选时段已不可预约，请刷新后重新选择"))
		return
	}
	var token [24]byte
	if _, err := rand.Read(token[:]); err != nil {
		writeAPIError(w, 500, errors.New("无法准备这次预约"))
		return
	}
	s.sportPending = &sportPending{Input: input, Token: hex.EncodeToString(token[:]), Expires: time.Now().Add(2 * time.Minute)}
	writeJSON(w, map[string]any{"token": s.sportPending.Token, "room": input.RoomID, "date": input.Date, "time": input.Start + "–" + input.End})
}

func (s *Server) handleSportCommit(w http.ResponseWriter, r *http.Request) {
	s.sportMu.Lock()
	defer s.sportMu.Unlock()
	var in struct {
		Token string `json:"token"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || s.sportPending == nil || in.Token != s.sportPending.Token || time.Now().After(s.sportPending.Expires) {
		writeAPIError(w, 409, errors.New("这次确认已失效，请重新核对场地和时段"))
		return
	}
	pending := s.sportPending
	s.sportPending = nil // 先消费：即使随后超时，同一个 token 也不能提交两次

	c, err := s.sportClient()
	if err != nil {
		writeBookingError(w, err)
		return
	}
	// 提交的字段名来自调研笔记，实际取值要以真实会话实测为准。
	form := url.Values{}
	form.Set("CDWID", pending.Input.RoomID)
	form.Set("YYRQ", pending.Input.Date)
	form.Set("YYKS", pending.Input.Start)
	form.Set("YYJS", pending.Input.End)
	form.Set("YYLX", pending.Input.Kind)
	form.Set("LXFS", pending.Input.Phone)
	if _, err := c.postFormContext(r.Context(), sportAppPath+"/insertVenueBookingInfo.do", form); err != nil {
		writeAPIError(w, 502, errors.New("没有确认到提交结果。请先在「我的预约」或学校原页核对有没有生成记录，再重试，别直接重复提交"))
		return
	}
	writeJSON(w, map[string]any{"ok": true, "message": "学校已接受预约请求，请核对「我的预约」"})
}
